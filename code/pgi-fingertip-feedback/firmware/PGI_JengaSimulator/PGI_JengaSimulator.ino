#include <Servo.h>

Servo servo1, servo2;

void setup() {
  Serial.begin(115200);
  servo1.attach(9);
  servo2.attach(10);
  servo1.write(90);
  servo2.write(180);  // default 느슨한 상태
  delay(500);
}

void loop() {
  if (Serial.available() >= 2) {
    byte a1 = Serial.read();
    byte a2 = Serial.read();
    servo1.write(a1);
    servo2.write(a2);
  }
}