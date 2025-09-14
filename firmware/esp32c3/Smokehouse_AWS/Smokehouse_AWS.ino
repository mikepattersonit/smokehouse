// Smokehouse_AWS.ino (ESP32-C3)
// Session persistence (30m gap), UTC timestamps, 60s publish cadence,
// device_id/firmware in payload, MUX bit fix, larger MQTT buffer.

// ===== Includes =====
#include <SPI.h>
#include <Adafruit_MAX31855.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <LiquidCrystal_I2C.h>
#include <Wire.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <DHT.h>
#include <PubSubClient.h>
#include <Preferences.h>
#include <time.h>

#include "credentials.h"  // Your SSID/password + AWS IoT: endpoint, port, certs, keys, topic, client id, etc.

// ===== Pins / Sensors =====
#define NUM_SENSORS 8
#define I2C_SDA 4
#define I2C_SCL 5
#define T0 12
#define T1 18
#define T2 19
#define MAXDO 10
#define MAXCS 7
#define MAXCLK 2
#define DHT_PIN 11
#define MQ135_PIN 1
#define DHTTYPE DHT11

// ===== Globals =====
WiFiClientSecure wifiClient;
PubSubClient mqttClient(wifiClient);

LiquidCrystal_I2C lcd(0x27, 20, 4);
Adafruit_MAX31855 thermocouple(MAXCLK, MAXCS, MAXDO);
DHT dht(DHT_PIN, DHTTYPE);
Preferences prefs;

double Temps[NUM_SENSORS];
double outsideTemp = 0.0;
double humidity    = 0.0;
double smokePPM    = 0.0;

unsigned long lastSensorReadTime = 0;
const unsigned long sensorReadInterval = 1000;   // read sensors ~1s

unsigned long lastMqttSendTime = 0;
const unsigned long mqttSendInterval = 60000;    // publish every 60s

uint8_t currentSensor = 0;
bool waitingForConversion = false;
unsigned long muxSwitchTime = 0;

String session_id;
String DEVICE_ID;
const char* FIRMWARE_VERSION = "esp32c3-0.2.0";

const uint32_t SESSION_GAP_SECS = 1800;          // 30 minutes

// ===== Helpers =====
String macAsHex() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char buf[13];
  snprintf(buf, sizeof(buf), "%02X%02X%02X%02X%02X%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return String(buf);
}

void setupLCD() {
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0); lcd.print("Smokehouse Booting");
  delay(1000);
  lcd.clear();
}

void connectToWiFi() {
  WiFi.begin(ssid, password);
  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 40) {
    delay(250);
    retries++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi connected!");
    Serial.print("IP: "); Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi connect failed; restarting…");
    ESP.restart();
  }
}

void syncTime() {
  if (WiFi.status() != WL_CONNECTED) return;
  // UTC (offset 0, no DST); NTP pools:
  configTime(0, 0, "time.google.com", "time.windows.com", "pool.ntp.org");
  time_t now = time(nullptr);
  int retries = 0;
  while (now < 1000000000 && retries < 60) {
    delay(500);
    now = time(nullptr);
    retries++;
  }
  lcd.setCursor(0, 0);
  if (now >= 1000000000) {
    lcd.print("Time Synced (UTC) ");
  } else {
    lcd.print("Time Sync Failed  ");
  }
  delay(800);
  lcd.clear();
}

String generateSessionIdUTC() {
  time_t now = time(nullptr);
  struct tm t; gmtime_r(&now, &t);
  char buf[20];
  // e.g. 20250914 180300 (YYYYMMDDHHMMSS)
  snprintf(buf, sizeof(buf), "%04d%02d%02d%02d%02d%02d",
           t.tm_year + 1900, t.tm_mon + 1, t.tm_mday,
           t.tm_hour, t.tm_min, t.tm_sec);
  return String(buf);
}

String generateTimestampUTC() {
  time_t now = time(nullptr);
  struct tm t; gmtime_r(&now, &t);
  char buf[18];
  // e.g. 20250914T180300Z (sortable; matches backend expectations)
  snprintf(buf, sizeof(buf), "%04d%02d%02dT%02d%02d%02dZ",
           t.tm_year + 1900, t.tm_mon + 1, t.tm_mday,
           t.tm_hour, t.tm_min, t.tm_sec);
  return String(buf);
}

String loadOrCreateSessionId() {
  prefs.begin("smoke", false);
  String saved = prefs.getString("session_id", "");
  time_t last_seen = (time_t)prefs.getLong("last_seen", 0);
  time_t now = time(nullptr);

  if (saved.length() > 0 && now >= last_seen && ((now - last_seen) <= SESSION_GAP_SECS)) {
    prefs.end();
    return saved;  // reuse
  }
  String sid = generateSessionIdUTC();
  prefs.putString("session_id", sid);
  prefs.putLong("started_at", (long)now);
  prefs.putLong("last_seen",  (long)now);
  prefs.end();
  return sid;
}

void touchLastSeen() {
  prefs.begin("smoke", false);
  prefs.putLong("last_seen", (long)time(nullptr));
  prefs.end();
}

// ===== MQTT =====
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  // (Optional) handle inbound messages later
  Serial.print("MQTT in ["); Serial.print(topic); Serial.print("] ");
  for (unsigned int i = 0; i < length; i++) Serial.print((char)payload[i]);
  Serial.println();
}

void connectToAWS() {
  int retries = 0;
  while (!mqttClient.connected() && retries < 10) {
    Serial.print("Connecting to AWS IoT… ");
    if (mqttClient.connect(AWS_IOT_CLIENT_ID)) {
      Serial.println("OK");
      mqttClient.subscribe(AWS_IOT_TOPIC);  // listen if you want to
    } else {
      Serial.print("Failed, rc="); Serial.println(mqttClient.state());
      delay(1500);
      retries++;
    }
  }
  if (!mqttClient.connected()) {
    Serial.println("MQTT connect failed, restarting…");
    ESP.restart();
  }
}

// ===== Sensors =====
void readThermocouple() {
  unsigned long now = millis();

  if (!waitingForConversion) {
    if (now - lastSensorReadTime >= sensorReadInterval) {
      // Set MUX select bits cleanly
      digitalWrite(T0, (currentSensor >> 0) & 1);
      digitalWrite(T1, (currentSensor >> 1) & 1);
      digitalWrite(T2, (currentSensor >> 2) & 1);

      muxSwitchTime = now;
      waitingForConversion = true;
    }
  } else {
    if (now - muxSwitchTime >= 100) { // wait after switching
      double ftemp = thermocouple.readFahrenheit();
      if (isnan(ftemp) || ftemp < -100 || ftemp > 1000) {
        Temps[currentSensor] = -999;
      } else {
        Temps[currentSensor] = trunc(ftemp);
      }

      // After last probe, read internal (chip) temp → outsideTemp
      if (currentSensor == NUM_SENSORS - 1) {
        double internalC = thermocouple.readInternal(); // Celsius
        outsideTemp = trunc((internalC * 9.0 / 5.0) + 32.0);
      }

      currentSensor = (currentSensor + 1) % NUM_SENSORS;
      lastSensorReadTime = now;
      waitingForConversion = false;
    }
  }
}

void readHumidity() {
  humidity = dht.readHumidity();
  if (isnan(humidity)) humidity = 0.0;
}

void readSmokeSensor() {
  // ESP32-C3 default adcWidth is 12-bit, but we set to 10-bit in setup.
  // If you change resolution, adjust the divisor accordingly (1023 vs 4095).
  int raw = analogRead(MQ135_PIN);
  smokePPM = (raw * (5.0 / 1023.0)) * 10.0;  // placeholder scaling; calibrate MQ-135 later
  if (isnan(smokePPM)) smokePPM = 0.0;
}

// ===== LCD =====
void updateLCD() {
  static int prevOutside = -999, prevTop = -999, prevMid = -999, prevBot = -999;
  static int prevP1 = -999, prevP2 = -999, prevP3 = -999;

  auto printValue = [](int col, int row, const String& label, int value, int prevValue) {
    if (value != prevValue) {
      String clearString = label + "    ";
      lcd.setCursor(col, row); lcd.print(clearString);
      lcd.setCursor(col, row);
      if (value == -999) lcd.print(label + "-");
      else               lcd.print(label + String(value) + "F");
    }
  };

  printValue(0, 0,  "Out:", (int)outsideTemp, prevOutside);
  printValue(0, 1,  "Top:", (int)Temps[2],   prevTop);
  printValue(0, 2,  "Mid:", (int)Temps[1],   prevMid);
  printValue(0, 3,  "Bot:", (int)Temps[0],   prevBot);
  printValue(11, 1, "P1:",  (int)Temps[4],   prevP1);
  printValue(11, 2, "P2:",  (int)Temps[5],   prevP2);
  printValue(11, 3, "P3:",  (int)Temps[6],   prevP3);

  prevOutside = (int)outsideTemp;
  prevTop     = (int)Temps[2];
  prevMid     = (int)Temps[1];
  prevBot     = (int)Temps[0];
  prevP1      = (int)Temps[4];
  prevP2      = (int)Temps[5];
  prevP3      = (int)Temps[6];
}

// ===== Publish =====
void publishMQTT() {
  if (millis() - lastMqttSendTime < mqttSendInterval) return;

  StaticJsonDocument<768> doc;  // generous headroom
  String ts = generateTimestampUTC();
  time_t now = time(nullptr);

  doc["session_id"]   = session_id;
  doc["timestamp"]    = ts;             // 20250914T180300Z
  doc["ts_epoch"]     = (uint32_t)now;  // optional seconds since epoch
  doc["device_id"]    = DEVICE_ID;      // MAC hex
  doc["firmware"]     = FIRMWARE_VERSION;

  doc["outside_temp"] = outsideTemp;
  doc["bottom_temp"]  = (int)Temps[0];
  doc["middle_temp"]  = (int)Temps[1];
  doc["top_temp"]     = (int)Temps[2];
  doc["probe1_temp"]  = (int)Temps[4];
  doc["probe2_temp"]  = (int)Temps[5];
  doc["probe3_temp"]  = (int)Temps[6];
  doc["humidity"]     = humidity;
  doc["smoke_ppm"]    = smokePPM;

  char buffer[768];
  size_t n = serializeJson(doc, buffer, sizeof(buffer));
  if (n == 0 || n >= sizeof(buffer)) {
    Serial.println("Payload too large");
    return;
  }

  if (mqttClient.publish(AWS_IOT_TOPIC, buffer)) {
    lastMqttSendTime = millis();
    touchLastSeen();    // <- update NVS to keep session alive across reboots
  } else {
    Serial.println("MQTT publish failed");
  }
}

// ===== OTA =====
void setupOTA() {
  ArduinoOTA.onStart([]() {
    lcd.setCursor(0, 3); lcd.print("OTA Update       ");
  });
  ArduinoOTA.onEnd([]() {
    lcd.setCursor(0, 3); lcd.print("OTA Complete     ");
  });
  ArduinoOTA.onError([](ota_error_t error) {
    lcd.setCursor(0, 3); lcd.print("OTA Error: "); lcd.print(error);
  });
  ArduinoOTA.begin();
}

// ===== Setup / Loop =====
void setup() {
  Serial.begin(115200);

  Wire.begin(I2C_SDA, I2C_SCL);
  pinMode(T0, OUTPUT); pinMode(T1, OUTPUT); pinMode(T2, OUTPUT);

  setupLCD();
  connectToWiFi();
  syncTime();

  wifiClient.setCACert(AWS_IOT_CA_CERT);
  wifiClient.setCertificate(AWS_IOT_CLIENT_CERT);
  wifiClient.setPrivateKey(AWS_IOT_PRIVATE_KEY);

  mqttClient.setServer(AWS_IOT_ENDPOINT, AWS_IOT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(768); // allow larger JSON publishes

  DEVICE_ID = macAsHex();
  session_id = loadOrCreateSessionId(); // 30m gap reuse

  dht.begin();
  analogReadResolution(10);  // 0..1023 (keep consistent with smokePPM math)

  connectToAWS();
  setupOTA();
}

void loop() {
  if (!mqttClient.connected()) {
    connectToAWS();
  }
  mqttClient.loop();
  ArduinoOTA.handle();

  readThermocouple();
  readHumidity();
  readSmokeSensor();

  publishMQTT();
  updateLCD();
}
