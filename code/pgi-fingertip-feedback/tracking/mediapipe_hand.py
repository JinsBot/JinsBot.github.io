import cv2
import mediapipe as mp
import socket
import json
import time
import math

UDP_IP   = "127.0.0.1"
UDP_PORT = 5005
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

# ── One Euro Filter ──────────────────────────────────────────────────────────
# 저속: min_cutoff로 강하게 평활화, 고속: beta로 반응성 유지
class OneEuroFilter:
    def __init__(self, min_cutoff=0.5, beta=0.5, d_cutoff=1.0):
        self.min_cutoff = min_cutoff
        self.beta       = beta
        self.d_cutoff   = d_cutoff
        self._x  = None
        self._dx = 0.0

    @staticmethod
    def _alpha(cutoff, dt):
        tau = 1.0 / (2.0 * math.pi * cutoff)
        return 1.0 / (1.0 + tau / max(dt, 1e-6))

    def filter(self, x, dt):
        if self._x is None:
            self._x = x
            return x
        dx     = (x - self._x) / max(dt, 1e-6)
        a_d    = self._alpha(self.d_cutoff, dt)
        dx_hat = a_d * dx + (1.0 - a_d) * self._dx
        cutoff = self.min_cutoff + self.beta * abs(dx_hat)
        a      = self._alpha(cutoff, dt)
        x_hat  = a * x + (1.0 - a) * self._x
        self._x  = x_hat
        self._dx = dx_hat
        return x_hat


# 21 랜드마크 × x,y,z = 63개 독립 필터
LM_COUNT = 21
_filters = [[OneEuroFilter(min_cutoff=0.5, beta=0.5) for _ in range(3)]
            for _ in range(LM_COUNT)]

def apply_filters(lms, dt):
    out = []
    for i, lm in enumerate(lms):
        out.append({
            "x": _filters[i][0].filter(lm.x, dt),
            "y": _filters[i][1].filter(lm.y, dt),
            "z": _filters[i][2].filter(lm.z, dt),
        })
    return out


# ── 추적 상태 (Hold-and-Decay) ───────────────────────────────────────────────
class State:
    last_valid      = None  # 마지막 유효 프레임의 필터 결과
    decay_remaining = 0     # 남은 hold 프레임
    ref_palm_size   = None  # z 보정용 기준 palm size

DECAY_FRAMES = 15


# ── 유틸 ─────────────────────────────────────────────────────────────────────
def _dist2d(a, b):
    return math.sqrt((a["x"] - b["x"])**2 + (a["y"] - b["y"])**2)

# 신뢰도 판단 핵심 랜드마크: 손목(0) + 검지 라인(5,6,7,8)
KEY_LMS = [0, 5, 6, 7, 8]

def calc_confidence(result, idx=0):
    """
    handedness score × 핵심 랜드마크(0,5-8) visibility 평균.
    visibility를 지원하지 않는 모델은 handedness score만 반환.
    """
    h_score = result.handedness[idx][0].score if result.handedness else 0.0
    lms     = result.hand_landmarks[idx]
    vis     = [getattr(lms[k], 'visibility', None) for k in KEY_LMS]
    vis     = [v for v in vis if v is not None]
    return float(h_score * (sum(vis) / len(vis))) if vis else float(h_score)


def correct_z(filtered, palm_size):
    """
    z값을 ref_palm_size 기준으로 정규화.
    손이 멀어지거나 회전해 palm_size가 줄어들면 z 스케일이 틀어지는 것을 보정.
    검지 라인(5-8)에만 적용 (손목 기준 상대 깊이).
    """
    if palm_size < 0.02:
        return filtered
    if State.ref_palm_size is None:
        State.ref_palm_size = palm_size
        return filtered
    scale = State.ref_palm_size / palm_size
    for i in KEY_LMS[1:]:      # 5, 6, 7, 8
        filtered[i]["z"] *= scale
    return filtered


# ── MediaPipe 설정 ─────────────────────────────────────────────────────────
BaseOptions           = mp.tasks.BaseOptions
HandLandmarker        = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
VisionRunningMode     = mp.tasks.vision.RunningMode

options = HandLandmarkerOptions(
    base_options=BaseOptions(model_asset_path='hand_landmarker.task'),
    running_mode=VisionRunningMode.VIDEO,
    num_hands=1,
    min_hand_detection_confidence=0.2,
    min_hand_presence_confidence=0.2,
    min_tracking_confidence=0.2)

cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
cap.set(cv2.CAP_PROP_FPS,          60)
cap.set(cv2.CAP_PROP_AUTOFOCUS,    1)

start_time = time.time()
prev_time  = start_time

with HandLandmarker.create_from_options(options) as landmarker:
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        now = time.time()
        dt  = max(now - prev_time, 1e-4)
        prev_time = now

        frame = cv2.flip(frame, 1)
        frame = cv2.convertScaleAbs(frame, alpha=1.2, beta=20)

        ts_ms    = int((now - start_time) * 1000)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame)
        result   = landmarker.detect_for_video(mp_image, ts_ms)

        if result.hand_landmarks:
            filtered = apply_filters(result.hand_landmarks[0], dt)

            palm_size = _dist2d(filtered[0], filtered[9])
            filtered  = correct_z(filtered, palm_size)

            confidence = calc_confidence(result)

            State.last_valid      = filtered
            State.decay_remaining = DECAY_FRAMES

            payload = json.dumps({
                "landmarks":  filtered,
                "confidence": round(confidence, 3),
                "decay":      1.0,
            })
            sock.sendto(payload.encode(), (UDP_IP, UDP_PORT))

        elif State.last_valid is not None and State.decay_remaining > 0:
            # 인식 실패 → 마지막 유효 좌표 유지, 신뢰도 선형 감쇠
            State.decay_remaining -= 1
            decay = State.decay_remaining / DECAY_FRAMES

            payload = json.dumps({
                "landmarks":  State.last_valid,
                "confidence": 0.0,
                "decay":      round(decay, 3),
            })
            sock.sendto(payload.encode(), (UDP_IP, UDP_PORT))

            if State.decay_remaining == 0:
                State.last_valid = None

        display = cv2.resize(frame, (960, 540))
        cv2.imshow('Hand Tracking', display)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()
