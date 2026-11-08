/*
 * Nano 33 BLE Rev2 (BMI270 + BMM150)
 * BLE HID Mouse + Serial(JSON)
 *  - Spin start  -> Right button DOWN (hold)
 *  - Spin keep   -> Left button CLICKs (tempo ~ spin speed)
 *  - Throw       -> Right button UP (release)
 */

#include <Arduino_BMI270_BMM150.h>
#include "Nano33BleHID.h"   // BLE HID (Mouse/Keyboard)

// ----- Mouse button bit masks -----
#define MOUSE_NONE   0x00
#define MOUSE_LEFT   0x01
#define MOUSE_RIGHT  0x02
#define MOUSE_MIDDLE 0x04

Nano33BleHID<HIDMouseService> LassoMouse("Lasso BLE Mouse");

// ---- math helpers ----
struct V3 { float x,y,z; };
static inline float dot(const V3&a,const V3&b){return a.x*b.x+a.y*b.y+a.z*b.z;}
static inline float norm(V3 a){return sqrtf(dot(a,a));}
static inline V3   sub(V3 a,V3 b){return {a.x-b.x,a.y-b.y,a.z-b.z};}
static inline V3   add(V3 a,V3 b){return {a.x+b.x,a.y+b.y,a.z+b.z};}
static inline V3   mul(V3 a,float k){return {a.x*k,a.y*k,a.z*k};}
static inline V3   unit(V3 a){float n=norm(a); return (n>1e-6f)?V3{a.x/n,a.y/n,a.z/n}:V3{0,0,0};}
static inline float clampf(float v,float a,float b){return v<a?a:(v>b?b:v);}

// ---- sampling & filters ----
V3 gLP = {0,0,9.81f};         
float alpha = 0.03f; // gravity LPF

const int W = 64;
float omegaBuf[W], alinBuf[W];
int wIdx=0, wFill=0;

enum State { IDLE, SPIN } state = IDLE;

float SPIN_ON_MIN=3.5f, SPIN_OFF_MIN=2.0f;   // rad/s
float THROW_PEAK_MIN=9.0f, THROW_MAD_K=3.8f; // m/s^2
float OMEGA_DROP_RATIO=0.35f;

unsigned long tSpinStart=0;
float peakAcc=0, omegaAtPeak=0;
bool peakHit=false; unsigned long tPeak=0;

bool rbtnDown=false;
unsigned long nextLClickMs=0;

const unsigned long MIN_SPIN_MS_BEFORE_THROW = 350; // 0.35초는 회전만 허용

// ------------------------------------------------------------
void setup(){
  Serial.begin(115200);
  while(!Serial && millis()<2000){}

  if(!IMU.begin()){
    Serial.println("{\"error\":\"IMU begin failed\"}");
    while(1);
  }

  LassoMouse.initialize();
  MbedBleHID_RunEventThread();
  Serial.println("{\"info\":\"BLE HID Mouse ready. Pair via Bluetooth.\"}");
  delay(300);
}

// ------------------------------------------------------------
static bool readIMU(V3& acc_g, V3& gyro_rs){
  float ax,ay,az, gx,gy,gz;
  if(!(IMU.accelerationAvailable() && IMU.gyroscopeAvailable())) return false;
  IMU.readAcceleration(ax,ay,az);
  IMU.readGyroscope(gx,gy,gz);
  acc_g  = { ax*9.80665f, ay*9.80665f, az*9.80665f };
  gyro_rs= { gx*(PI/180.0f), gy*(PI/180.0f), gz*(PI/180.0f) };
  return true;
}

// ------------------------------------------------------------
void loop(){
  V3 aRaw,w; if(!readIMU(aRaw,w)) return;

  gLP = add( mul(gLP,1.0f-alpha), mul(aRaw,alpha) );
  V3 aLin = sub(aRaw,gLP);

  float omega = norm(w);
  float alin  = norm(aLin);

  // running stats
  omegaBuf[wIdx]=omega; alinBuf[wIdx]=alin;
  wIdx=(wIdx+1)%W; wFill = (wFill<W)?(wFill+1):W;

  float oMean=0,aMean=0;
  for(int i=0;i<wFill;i++){ oMean+=omegaBuf[i]; aMean+=alinBuf[i]; }
  oMean/=max(1,wFill); aMean/=max(1,wFill);

  float oMAD=0,aMAD=0;
  for(int i=0;i<wFill;i++){ oMAD+=fabs(omegaBuf[i]-oMean); aMAD+=fabs(alinBuf[i]-aMean); }
  oMAD/=max(1,wFill); aMAD/=max(1,wFill);

  float spinOnAdapt  = max(SPIN_ON_MIN,  oMean + 2.0f*oMAD);
  float spinOffAdapt = max(SPIN_OFF_MIN, oMean + 1.0f*oMAD);
  float throwPeak    = max(THROW_PEAK_MIN, aMean + THROW_MAD_K*aMAD);

  auto* hid = LassoMouse.hid();

  switch(state){
    case IDLE:
      if(omega > spinOnAdapt){
        state=SPIN; tSpinStart=millis(); peakAcc=0; peakHit=false; omegaAtPeak=0;

        if(!rbtnDown){
          hid->button((HIDMouseService::Button)MOUSE_RIGHT);
          hid->SendReport();
          rbtnDown=true;
          Serial.println("KEY RBTN_DOWN");
          Serial.println("{\"type\":\"spin_start\"}");
        }
        nextLClickMs = millis() + 140;
      }
      break;

    case SPIN:{
      if(alin>peakAcc) peakAcc=alin;

      float spinRPS = omega/(2.0f*PI);
      unsigned long now=millis();
      int interval = (int)clampf( 900.0f / max(spinRPS, 0.5f), 70, 300 );

      if(now >= nextLClickMs){
        uint8_t downMask = rbtnDown ? (MOUSE_LEFT|MOUSE_RIGHT) : MOUSE_LEFT;
        uint8_t upMask   = rbtnDown ?  MOUSE_RIGHT            : MOUSE_NONE;

        hid->button((HIDMouseService::Button)downMask); hid->SendReport();
        hid->button((HIDMouseService::Button)upMask);   hid->SendReport();

        Serial.println("KEY LBTN_CLICK");
        Serial.print("{\"type\":\"spin_tick\",\"spin_rps\":");
        Serial.print(spinRPS,2); Serial.println("}");

        nextLClickMs = now + interval;
      }

      if(!peakHit && alin > throwPeak){
        peakHit=true; omegaAtPeak=omega; tPeak=now;
      }

      if(peakHit && (millis()-tPeak)<200){
        if ((millis()-tSpinStart) < MIN_SPIN_MS_BEFORE_THROW){
          break; // 아직 던지기 금지
        }
        if(omega < omegaAtPeak*OMEGA_DROP_RATIO){
          V3 dir  = unit(aLin);
          V3 gHat = unit(gLP);
          float d_g = dot(dir,gHat);
          V3 dirH = unit( sub(dir, V3{gHat.x*d_g, gHat.y*d_g, gHat.z*d_g} ) );
          float power = clampf(peakAcc/20.0f,0.0f,1.0f);

          if(rbtnDown){
            hid->button((HIDMouseService::Button)MOUSE_NONE);
            hid->SendReport();
            rbtnDown=false;
            Serial.println("KEY RBTN_UP");
          }

          Serial.print("{\"type\":\"throw\",\"dir\":[");
          Serial.print(dir.x,3); Serial.print(","); Serial.print(dir.y,3); Serial.print(","); Serial.print(dir.z,3); Serial.print("]");
          Serial.print(",\"dir_h\":["); Serial.print(dirH.x,3); Serial.print(","); Serial.print(dirH.y,3); Serial.print(","); Serial.print(dirH.z,3); Serial.print("]");
          Serial.print(",\"power\":");     Serial.print(power,3);
          Serial.print(",\"spin_rps\":");  Serial.print(omegaAtPeak/(2.0f*PI),2);
          Serial.print(",\"spin_ms\":");   Serial.print(millis()-tSpinStart);
          Serial.println("}");

          state=IDLE; peakHit=false;
          break;
        }
      }

      if((omega < spinOffAdapt && (millis()-tSpinStart)>150) || (millis()-tSpinStart)>3500){
        if(rbtnDown){
          hid->button((HIDMouseService::Button)MOUSE_NONE);
          hid->SendReport();
          rbtnDown=false;
          Serial.println("KEY RBTN_UP");
        }
        Serial.println("{\"type\":\"spin_end\"}");
        state=IDLE; peakHit=false;
      }
    } break;
  }

  delayMicroseconds(1000);
}
