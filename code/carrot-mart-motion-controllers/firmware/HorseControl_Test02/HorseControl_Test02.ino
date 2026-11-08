/*
 * Nano 33 BLE Rev2 (BMI270 + BMM150)
 * LEFT HAND → BLE HID KEYBOARD
 * v5.1.2-jerk: HID + Serial logs, axis-fixed, stuck-guard
 *
 * - A/D : X축 jerk (A:x-, D:x+)
 * - Shift: Y축 jerk (y-)
 * - W→S : Z축 jerk (z-)
 * - 이벤트 로그: 키 트리거/해제 이유를 시리얼로 출력
 * - 옵션: jerk 실시간 로그 (SERIAL_VERBOSE)
 */

#include <Arduino.h>
#include <Arduino_BMI270_BMM150.h>
#include "Nano33BleHID.h"

// =========== SERIAL LOG OPTIONS ===========
static const bool SERIAL_VERBOSE = false;   // true: 주기적 jerk/raw 로그
static const uint16_t VERBOSE_EVERY_MS = 50;

// =========== BLE HID ===========
Nano33BleHID<HIDKeyboardService> LeftKeys("Rein BLE Keyboard");

// =========== LOOP RATE ==========
const float    LOOP_HZ = 100.0f;
const uint32_t DT_US   = (uint32_t)(1e6/LOOP_HZ);

// =========== AXIS SIGNS =========
// 요청: A/D=X, Shift=Y, WS=Z
const int AXIS_SIGN_X = +1;
const int AXIS_SIGN_Y = +1;
const int AXIS_SIGN_Z = +1;

// =========== FILTERS ============
const float G_LPF_BETA = 0.02f;   // 중력 추정 LPF

// =========== JERK THRESHOLDS ====
const float JERK_Z_WS_NEG    = 0.22f; // WS: z- 큰 변화율
const float JERK_X_LEFT_NEG  = 0.20f; // A : x- 큰 변화율
const float JERK_X_RIGHT_POS = 0.20f; // D : x+ 큰 변화율
const float JERK_Y_SHIFT_NEG = 0.16f; // Shift: y- 큰 변화율
const float JERK_CROSS_MAX   = 0.10f; // 교차축 jerk 컷(혼선 방지)

// =========== TIMINGS ============
const uint16_t HOLD_AD_MS     = 160;  // A/D 유지
const uint16_t COOLDOWN_AD    = 140;  // A/D 재트리거 금지
const uint16_t COOLDOWN_WS    = 180;  // WS 재트리거 금지
const uint16_t COOLDOWN_SH    = 180;  // Shift 재트리거 금지
const uint16_t W_TAP_MS       = 160;   // W 탭 길이 // 80->160
const uint16_t WS_GAP_MS      = 90;   // W→S 간격 // 40->90
const uint16_t S_TAP_MS       = 160;   // S 탭 길이 // 80->160
const uint16_t SHIFT_TAP_MS   = 120;  // Shift 탭 길이

// =========== STUCK GUARD =========
const uint16_t STUCK_WATCH_MS    = 250; // 조용한 다운 상태 강제 해제
const uint16_t MAX_DOWN_AD_MS    = 300; // A/D 최대 다운
const uint16_t MAX_DOWN_SHIFT_MS = 250; // Shift 최대 다운

// =========== HID Usage IDs =======
#define KEY_A          0x04
#define KEY_D          0x07
#define KEY_S          0x16
#define KEY_W          0x1A
#define KEY_LEFT_SHIFT 0xE1


// =========== helpers ============
struct V3 { float x,y,z; };
static inline float absf(float v){return v<0?-v:v;}
static inline void  tiny_yield(){ delay(2); }

static void logEvt(const char* code, const char* act, const char* why){
  Serial.print("{\"key\":\"");   Serial.print(code);
  Serial.print("\",\"act\":\"");  Serial.print(act);
  Serial.print("\",\"why\":\"");  Serial.print(why);
  Serial.println("\"}");
}
static void logVal(const char* tag, float a, float b, float c){
  Serial.print("{\""); Serial.print(tag); Serial.print("\":[");
  Serial.print(a,3); Serial.print(','); Serial.print(b,3); Serial.print(','); Serial.print(c,3);
  Serial.println("]}");
}

static inline void KeyDownKey(HIDKeyboardService* kbd, uint8_t usage){
  kbd->keydown((KeySym_t)usage); kbd->SendReport(); tiny_yield();
}
static inline void KeyUpAll(HIDKeyboardService* kbd){
  kbd->keyup(); kbd->SendReport(); tiny_yield();
}

// =========== state ============
V3 g_est = {0,0,1};
V3 a_prev = {0,0,0};

bool aDown=false, dDown=false, shDown=false;
bool wsBusy=false;

uint32_t ad_release_ms=0, ad_down_start=0, sh_down_start=0;
uint32_t nextOK_AD=0, nextOK_WS=0, nextOK_SH=0;
uint32_t lastEvtMs=0;
uint32_t nextVerboseMs=0;

// =========== setup ============
void setup(){
  Serial.begin(115200);
  if(!IMU.begin()){
    Serial.println("{\"error\":\"IMU begin failed\"}");
    while(1) delay(500);
  }
  LeftKeys.initialize();
  MbedBleHID_RunEventThread();
  delay(300);
  Serial.println("{\"info\":\"v5.1.2-jerk HID+Logs ready\"}");
}

// =========== loop ============
void loop(){
  static uint32_t tick=micros();
  uint32_t nowu=micros();
  if((uint32_t)(nowu - tick) < DT_US) return;
  tick += DT_US;

  auto* kbd = LeftKeys.hid();
  uint32_t ms = millis();

  // --- 센서 ---
  float ax,ay,az,gx,gy,gz;
  if(!(IMU.accelerationAvailable() && IMU.gyroscopeAvailable())) return;
  IMU.readAcceleration(ax,ay,az);
  IMU.readGyroscope(gx,gy,gz);
  ax*=AXIS_SIGN_X; ay*=AXIS_SIGN_Y; az*=AXIS_SIGN_Z;

  // --- 중력 제거 ---
  g_est.x = (1.0f - G_LPF_BETA)*g_est.x + G_LPF_BETA*ax;
  g_est.y = (1.0f - G_LPF_BETA)*g_est.y + G_LPF_BETA*ay;
  g_est.z = (1.0f - G_LPF_BETA)*g_est.z + G_LPF_BETA*az;
  V3 a_lin = { ax - g_est.x, ay - g_est.y, az - g_est.z };

  // --- jerk(Δa) ---
  V3 j = { a_lin.x - a_prev.x, a_lin.y - a_prev.y, a_lin.z - a_prev.z };
  a_prev = a_lin;

  // (옵션) 주기적 값 로그
  if(SERIAL_VERBOSE && ms >= nextVerboseMs){
    logVal("jerk", j.x, j.y, j.z);
    // logVal("alin", a_lin.x, a_lin.y, a_lin.z); // 필요하면 주석 해제
    nextVerboseMs = ms + VERBOSE_EVERY_MS;
  }

  // ---- stuck guard ----
  bool anyDown = (aDown || dDown || shDown || wsBusy);
  if(anyDown && (uint32_t)(ms - lastEvtMs) >= STUCK_WATCH_MS){
    KeyUpAll(kbd);
    if(aDown)   { logEvt("A","up","watchdog"); }
    if(dDown)   { logEvt("D","up","watchdog"); }
    if(shDown)  { logEvt("LSHIFT","up","watchdog"); }
    aDown=dDown=shDown=false; wsBusy=false;
    lastEvtMs = ms;
  }
  if(aDown && (uint32_t)(ms - ad_down_start) >= MAX_DOWN_AD_MS){
    KeyUpAll(kbd); aDown=false; logEvt("A","up","maxdown"); lastEvtMs = ms;
  }
  if(dDown && (uint32_t)(ms - ad_down_start) >= MAX_DOWN_AD_MS){
    KeyUpAll(kbd); dDown=false; logEvt("D","up","maxdown"); lastEvtMs = ms;
  }
  if(shDown && (uint32_t)(ms - sh_down_start) >= MAX_DOWN_SHIFT_MS){
    KeyUpAll(kbd); shDown=false; logEvt("LSHIFT","up","maxdown"); lastEvtMs = ms;
  }

  // ===============================
  // 1) WS : z- jerk → W tap → gap → S tap
  // ===============================
  if(ms >= nextOK_WS){
    const bool z_down_fast = (j.z <= -JERK_Z_WS_NEG);
    const bool cross_ok    = (absf(j.x) <= JERK_CROSS_MAX) && (absf(j.y) <= JERK_CROSS_MAX);
    if(z_down_fast && cross_ok){
      wsBusy = true;
      // W→S : z- jerk
      KeyUpAll(kbd);
      KeyDownKey(kbd, KEY_W);
      logEvt("W","down","WS_W");
      delay(W_TAP_MS);
      KeyUpAll(kbd);
      logEvt("W","up","WS_gap");

      delay(WS_GAP_MS);

      KeyDownKey(kbd, KEY_S);
      logEvt("S","down","WS_S");
      delay(S_TAP_MS);
      KeyUpAll(kbd);
      logEvt("S","up","WS_done");

      wsBusy = false;
      nextOK_WS = ms + COOLDOWN_WS;
      nextOK_AD = max(nextOK_AD, ms + 60);
      nextOK_SH = max(nextOK_SH, ms + 60);
      lastEvtMs = ms;
      return;
    }
  }

  // ===============================
  // 2) A/D : x jerk (A:x-, D:x+)
  // ===============================
  if((aDown || dDown) && (int32_t)(ms - ad_release_ms) >= 0){
    KeyUpAll(kbd);
    if(aDown){ logEvt("A","up","hold_end"); }
    if(dDown){ logEvt("D","up","hold_end"); }
    aDown=dDown=false;
    lastEvtMs = ms;
  }

  if(ms >= nextOK_AD){
    const bool left_impulse  = (j.x <= -JERK_X_LEFT_NEG);
    const bool right_impulse = (j.x >=  JERK_X_RIGHT_POS);
    const bool cross_ok      = (absf(j.z) <= JERK_CROSS_MAX) && (absf(j.y) <= JERK_CROSS_MAX);
    if(cross_ok){
      if(left_impulse){
        KeyUpAll(kbd);
        KeyDownKey(kbd, KEY_A);      logEvt("A","down","X-jerk");
        aDown=true; ad_down_start=ms;
        ad_release_ms = ms + HOLD_AD_MS;
        nextOK_AD = ms + COOLDOWN_AD;
        nextOK_SH = max(nextOK_SH, ms + 60);
        nextOK_WS = max(nextOK_WS, ms + 60);
        lastEvtMs = ms;
        return;
      }else if(right_impulse){
        KeyUpAll(kbd);
        KeyDownKey(kbd, KEY_D);      logEvt("D","down","X+jerk");
        dDown=true; ad_down_start=ms;
        ad_release_ms = ms + HOLD_AD_MS;
        nextOK_AD = ms + COOLDOWN_AD;
        nextOK_SH = max(nextOK_SH, ms + 60);
        nextOK_WS = max(nextOK_WS, ms + 60);
        lastEvtMs = ms;
        return;
      }
    }
  }

  // ===============================
  // 3) Shift : y- jerk
  // ===============================
  if(ms >= nextOK_SH){
    const bool pull_fast = (j.y <= -JERK_Y_SHIFT_NEG);
    const bool cross_ok  = (absf(j.x) <= JERK_CROSS_MAX) && (absf(j.z) <= JERK_CROSS_MAX);
    if(pull_fast && cross_ok){
      KeyUpAll(kbd);
      KeyDownKey(kbd, KEY_LEFT_SHIFT); logEvt("LSHIFT","down","Y-jerk");
      shDown=true; sh_down_start=ms;
      delay(SHIFT_TAP_MS);
      KeyUpAll(kbd);                   logEvt("LSHIFT","up","Y-jerk_end");
      shDown=false;
      nextOK_SH = ms + COOLDOWN_SH;
      nextOK_AD = max(nextOK_AD, ms + 60);
      nextOK_WS = max(nextOK_WS, ms + 60);
      lastEvtMs = ms;
      return;
    }
  }
}
