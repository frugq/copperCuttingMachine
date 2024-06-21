//https://github.com/ongzzzzzz/p5.web-serial

#include <Encoder.h>
#include <MsTimer2.h>
#include <Servo.h>

const int SRCLK = 4;
const int RCLK = 6;
const int SER = 7;
const int led = 13;
int idxTask = -1;
int preIdxTask = -1;

enum TaskType{
  none, 
  up, right,  //noneが来るまで動き続ける
  cw, 
  x, y, theta, 
  hold,
  knife,
  setXY, setTheta,
  setK,
  get,
};

struct Pair{
  TaskType type;
  String str;
};

Pair mpTasks[]{
  {none, "NONE"},
  {up, "UP"},
  {right, "RIGHT"},
  {cw, "CW"},
  {x, "X"},
  {y, "Y"},
  {theta, "T"},
  {hold, "HOLD"},
  {knife, "KNIFE"},
  {setXY, "SETXY"},
  {setTheta, "SETT"},
  {get, "GET"},
};

struct Task{
  TaskType type;
  double val;
  int no;
};

class SteppingMotor{
private:
  long angle = 0;
  int state = 0b1100; //4bit
  int delayTime = 10;
  int no = 0;
  double mps = 0; //mm per steps

public:
  SteppingMotor(int DelayTime, double Mps, int No){
    delayTime = DelayTime;
    mps = Mps;
    no = No;
  }

  void step(int speed){
    if(speed > 0){
      state = ((state << 1) | (state >> 3)) & 0b1111;
      angle++;
    }else if(speed < 0){
      state = ((state >> 1) | (state << 3)) & 0b1111;
      angle--;
    }
    digitalWrite(RCLK, LOW);
    shiftOut(SER, SRCLK, LSBFIRST, state << (4 * no));
    digitalWrite(RCLK, HIGH);
    delayMicroseconds(delayTime / abs(speed));
  }

  void move2pos(double pos){
    digitalWrite(led, HIGH);
    double target = pos / mps;
    if(angle < target){
      while(angle < target) step(3);
    }else if(angle > target){
      while(angle > target) step(-3);
    }
    
    Serial.println("step " + String(target) + ", " + String(getAngle()));
    delay(500);
    digitalWrite(led, LOW);
  }

  void reset(){
    angle = 0;
  }

  int getAngle(){
    return angle;
  }
};

volatile double preEncVal = 0.0;
volatile double vel = 0.0;
void updateVel();

class DCMotor{
private:
  int pinM1, pinM2;
  int pinPwm;
  const double kp = 3.0;
  const double kd = 1.0;
  const double spr = 1898.241;  //steps per rad
  double targetAngle = 0;
  int angle0 = 0;
  Encoder enc;

public:
  DCMotor(int PinM1, int PinM2, int PinPwm, int PinEnc1, int PinEnc2) : enc(PinEnc1, PinEnc2){
    pinM1 = PinM1;
    pinM2 = PinM2;
    pinPwm = PinPwm;
    pinMode(pinM1, OUTPUT);
    pinMode(pinM2, OUTPUT);
    MsTimer2::set(10, updateVel);
    MsTimer2::start();
  }

  void move2pos(double targetAngle){
    digitalWrite(led, HIGH);
    double target = targetAngle * spr, error = 1e6, minError = 1e6;
    unsigned long start = millis();
    int counter = 0;
    while(abs(error) > 5){
      error = (double)getAngle() - (target - 200);
      double pwm = -kp * error - kd * vel;
      rotate(pwm);
      counter = (counter + 1) % 100;
      if(counter == 0){
        if(minError > abs(error)){
          minError = abs(error);
          start = millis();
        }else if(millis() - start > 1000){
          break;
        }
      }
      delay(1);
    }
    while(getAngle() < target){
      rotate(50);
      counter = (counter + 1) % 100;
      if(counter == 0){
        if(minError > abs(error)){
          minError = abs(error);
          start = millis();
        }else if(millis() - start > 1000){
          break;
        }
      }
      delay(1);
    }
    rotate(0);
    delay(500);
    digitalWrite(led, LOW);
    Serial.println("dc t=" + String(target) + ", r=" + String(getAngle()) + " " + String(targetAngle));
  }

  void rotate(double pwm){
    if(pwm == 0){
      analogWrite(pinPwm, 0);
      digitalWrite(pinM1, HIGH);
      digitalWrite(pinM2, HIGH);
    }else if(pwm > 0){
      analogWrite(pinPwm, min(pwm, 255));
      digitalWrite(pinM1, HIGH);
      digitalWrite(pinM2, LOW);
    }else{
      analogWrite(pinPwm, min(-pwm, 255));
      digitalWrite(pinM1, LOW);
      digitalWrite(pinM2, HIGH);
    }
  }

  int getAngle(){
    return enc.read() - angle0;
  }

  void reset(){
    angle0 = enc.read();
  }
};

String input;
SteppingMotor motorX(10000, 0.0375, 0), motorY(8500, 0.0195, 1);
DCMotor motorT(12, 8, 11, 3, 2);
Task task;
Servo servoKnife, servoHold;

void updateVel(){
  now = motorT.getAngle();
  vel = now - preEncVal;
  preEncVal = now;
}

void updateTask(){
  input = "";
  if (Serial.available()) {
    input = Serial.readStringUntil('\n');
    input.trim();
    int sep1 = input.indexOf(' ', 0);
    int sep2 = input.indexOf(' ', sep1 + 1);
    String type = input.substring(0, sep1);
    task.type = none;
    for(int i = 0; i < sizeof(mpTasks) / sizeof(Pair); ++i){
      if(type == mpTasks[i].str){
        task.type = mpTasks[i].type;
        break;
      }
    }
    task.val = input.substring(sep1 + 1, sep2).toDouble();
    task.no = input.substring(sep2 + 1, input.length()).toInt();
    Serial.println("input : " + String(type) + " " + String(task.val) + " " + String(task.no));
  }
}

void setup() {
  Serial.begin(9600);
  pinMode(13, OUTPUT);
  pinMode(SER, OUTPUT);
  pinMode(RCLK, OUTPUT);
  pinMode(SRCLK, OUTPUT);
  servoKnife.attach(5);
  servoHold.attach(9);
  servoKnife.write(100);
  servoHold.write(110);
}

void loop() {
  updateTask();
  int nowTheta;
  switch(task.type){
    case none:
      motorT.rotate(0);
      break;
    case up:
      motorY.step(task.val);
      break;
    case right:
      motorX.step(task.val);
      break;
    case cw:
      motorT.rotate(task.val * 30);
      break;
    case x:
      motorX.move2pos(task.val);
      Serial.println(task.no);
      task.type = none;
      break;
    case y:
      motorY.move2pos(task.val);
      Serial.println(task.no);
      task.type = none;
      break;
    case theta:
      motorT.move2pos(task.val);
      Serial.println(task.no);
      task.type = none;
      break;
    case hold:
      nowTheta = servoHold.read();
      if(nowTheta < task.val){
        for(int theta = nowTheta; theta <= task.val; ++theta){
          servoHold.write(theta);
          delay(5);
        }
      }else{
        for(int theta = nowTheta; theta >= task.val; --theta){
          servoHold.write(theta);
          delay(5);
        }
      }
      delay(300);
      Serial.println(task.no);
      task.type = none;
      break;
    case knife:
      nowTheta = servoKnife.read();
      if(nowTheta < task.val){
        for(int theta = nowTheta; theta <= task.val; ++theta){
          servoKnife.write(theta);
          delay(5);
        }
      }else{
        for(int theta = nowTheta; theta >= task.val; --theta){
          servoKnife.write(theta);
          delay(5);
        }
      }
      delay(1000);
      Serial.println(task.no);
      task.type = none;
      break;
    case setXY:
      motorX.reset();
      motorY.reset();
      Serial.println(task.no);
      task.type = none;
      break;
    case setTheta:
      motorT.reset();
      motorT.move2pos(0);
      Serial.println(task.no);
      task.type = none;
      break;
  }
}
