using UnityEngine;

/// 순차적 햅틱 상태 머신:
///   ROTATING : servo1이 (LM7→LM8 법선) vs (손끝→블록) 각도를 추적.
///              servo2는 180°(느슨한 default) 고정.
///   PRESSING : 회전 정렬 완료 + 충분히 가까울 때 진입.
///              servo2가 ContactForce 기반으로 당김 시작.
[RequireComponent(typeof(SerialController))]
public class HapticController : MonoBehaviour
{
    [SerializeField] private HandTracker        handTracker;
    [SerializeField] private HandVisualizer     handVisualizer;
    [SerializeField] private HandPhysicsCollider handPhysics;

    [Header("Servo1 — 회전 (0°=손톱정면 default, 180°=지문면 max)")]
    [Tooltip("패드가 커버 가능한 최대 각도. 손톱정면(0°)~지문면(90°) 구간.")]
    [SerializeField] private float servo1MaxAngle = 90f;

    [Header("Servo2 — 당김 (servo1 커버 범위 내 + 근접 시 진입)")]
    [Tooltip("이 거리 이하로 가까워지면 PRESSING 진입 (블록이 서보 커버 범위 내여야 함)")]
    [SerializeField] private float pressStartDistance = 0.12f;
    [Tooltip("이 거리 이상 멀어지면 다시 ROTATING으로 복귀 (히스테리시스)")]
    [SerializeField] private float pressStopDistance  = 0.18f;
    [Tooltip("ContactForce가 이 값(N)에 도달하면 servo2 최대 반응")]
    [SerializeField] private float maxContactForce    = 30f;

    private enum HapticState { Rotating, Pressing }
    private HapticState _state = HapticState.Rotating;

    private SerialController _serial;
    private Collider[]       _blockColliders;

    private void Start()
    {
        _serial = GetComponent<SerialController>();
        if (handPhysics == null)
            handPhysics = FindAnyObjectByType<HandPhysicsCollider>();
        CacheBlockColliders();
    }

    private void CacheBlockColliders()
    {
        var tower = GameObject.Find("JengaTower");
        _blockColliders = tower != null
            ? tower.GetComponentsInChildren<Collider>()
            : new Collider[0];
        Debug.Log($"[HapticController] Tracking {_blockColliders.Length} block colliders");
    }

    private void Update()
    {
        if (handTracker == null || !handTracker.IsTracking) return;

        if (handVisualizer != null)
            handVisualizer.UpdateScreenLandmarks(handTracker.RawLandmarks, Camera.main);

        // 검지 끝(8)과 한 마디 아래(7) 월드 위치
        Vector3 lm8 = handVisualizer != null
            ? handVisualizer.GetLandmarkWorldPosition(8)
            : handTracker.IndexTipPosition;
        Vector3 lm7 = handVisualizer != null
            ? handVisualizer.GetLandmarkWorldPosition(7)
            : lm8;

        if (lm8.y < -50f) return;

        // 가장 가까운 블록: 표면 거리 + 중심 위치
        NearestBlock(lm8, out float dist, out Vector3 blockCenter);

        // LM7→LM8 방향 = 검지 끝 마디의 법선벡터
        Vector3 fingerNormal = (lm8 - lm7).sqrMagnitude > 1e-6f
            ? (lm8 - lm7).normalized
            : Vector3.forward;

        // 손끝→블록 중심 방향
        Vector3 toBlock = (blockCenter - lm8).sqrMagnitude > 1e-6f
            ? (blockCenter - lm8).normalized
            : Vector3.forward;

        float angleDeg = Vector3.Angle(fingerNormal, toBlock);
        float force    = handPhysics != null ? handPhysics.ContactForce : 0f;
        float quality  = handTracker.TrackingQuality;

        // ── 상태 전이 ─────────────────────────────────────────────
        switch (_state)
        {
            case HapticState.Rotating:
                if (angleDeg <= servo1MaxAngle && dist < pressStartDistance)
                    _state = HapticState.Pressing;
                break;

            case HapticState.Pressing:
                if (dist > pressStopDistance)
                    _state = HapticState.Rotating;
                break;
        }

        // ── 서보 계산 ─────────────────────────────────────────────
        byte servo1 = RotationAngle(angleDeg);
        byte servo2 = _state == HapticState.Pressing ? PadPressure(force) : (byte)180;

        // TrackingQuality로 전체 스케일 (신뢰도 낮으면 기본값으로 복귀)
        _serial.Servo1Angle = (byte)(servo1 * quality);
        _serial.Servo2Angle = (byte)(180 - (int)((180 - servo2) * quality));

        if (Time.frameCount % 60 == 0)
            Debug.Log($"[Haptic] {_state}  angle={angleDeg:F1}°  dist={dist:F3}  force={force:F1}  q={quality:F2}" +
                      $"  s1={_serial.Servo1Angle}°  s2={_serial.Servo2Angle}°");
    }

    // ── Block lookup ──────────────────────────────────────────────

    private void NearestBlock(Vector3 tip, out float dist, out Vector3 center)
    {
        float   minDist    = float.MaxValue;
        Vector3 minCenter  = Vector3.zero;

        foreach (var col in _blockColliders)
        {
            if (col == null) continue;
            float d = Vector3.Distance(tip, col.ClosestPoint(tip));
            if (d < minDist)
            {
                minDist   = d;
                minCenter = col.bounds.center;
            }
        }

        dist   = minDist < float.MaxValue ? minDist : 0f;
        center = minCenter;
    }

    // ── Servo mappings ────────────────────────────────────────────

    /// servo1: angleDeg 0°(손톱 정면) → 0°, servo1MaxAngle(90°, 지문면) → 180°
    private byte RotationAngle(float angleDeg)
    {
        float t = Mathf.Clamp01(angleDeg / servo1MaxAngle);
        return (byte)Mathf.RoundToInt(t * 180f);
    }

    /// servo2: 충격력 기반. 반전 포함 (0N=180°느슨, max=0°최대당김)
    private byte PadPressure(float force)
    {
        float t = Mathf.Clamp01(force / maxContactForce);
        return (byte)(180 - Mathf.RoundToInt(t * 180f));
    }
}
