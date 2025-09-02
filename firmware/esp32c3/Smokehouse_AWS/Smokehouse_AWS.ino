#include <SPI.h>
#include <Adafruit_MAX31855.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <LiquidCrystal_I2C.h>
#include <Wire.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <DHT.h>
#include "credentials.h" // Ensure credentials.h is properly configured
#include <PubSubClient.h>

// Sensor Configuration
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

// MQTT Client Configuration
WiFiClientSecure wifiClient;
PubSubClient mqttClient(wifiClient);

// LCD and Sensors
LiquidCrystal_I2C lcd(0x27, 20, 4);
Adafruit_MAX31855 thermocouple(MAXCLK, MAXCS, MAXDO);
DHT dht(DHT_PIN, DHTTYPE);

// Global Variables
double Temps[NUM_SENSORS];
double outsideTemp = 0.0;
double humidity = 0.0;
double smokePPM = 0.0;
unsigned long lastSensorReadTime = 0;
const unsigned long sensorReadInterval = 1000; // 1 second
unsigned long lastMqttSendTime = 0;
const unsigned long mqttSendInterval = 5000; // 5 seconds
uint8_t currentSensor = 0;  // Current sensor index
String session_id;
bool waitingForConversion = false;
unsigned long muxSwitchTime = 0;


// Setup LCD
void setupLCD() {
    lcd.init();
    lcd.backlight();
    lcd.setCursor(0, 0);
    lcd.print("Smokehouse Booting");
    delay(1000);
    lcd.clear();
}

void connectToWiFi() {
    WiFi.begin(ssid, password);
    int retries = 0;
    while (WiFi.status() != WL_CONNECTED && retries < 20) {
        delay(500);
        Serial.print(".");
        retries++;
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("WiFi connected!");
        Serial.print("IP Address: ");
        Serial.println(WiFi.localIP());
    } else {
        Serial.println("WiFi connection failed!");
        ESP.restart(); // Restart the device if Wi-Fi fails
    }
}

// Sync Time with NTP
void syncTime() {
    if (WiFi.status() != WL_CONNECTED) {
        lcd.setCursor(0, 0);
        lcd.print("WiFi not connected!");
        Serial.println("WiFi not connected!");
        return;
    }

    configTime(0, 0, "time.google.com", "time.windows.com");
    time_t now = time(nullptr);
    int retries = 0;

    while (now < 1000000000 && retries < 30) {
        lcd.setCursor(0, 0);
        lcd.print("Time Syncing...");
        Serial.println("Time Syncing...");
        delay(1000);
        now = time(nullptr);
        retries++;
    }

    if (now >= 1000000000) {
        lcd.setCursor(0, 0);
        lcd.print("Time Synced!");
        Serial.println("Time successfully synced.");
    } else {
        lcd.setCursor(0, 0);
        lcd.print("Time Sync Failed!");
        Serial.println("Failed to sync time.");
    }

    delay(1000);
    lcd.clear();
}
String generateSessionId() {
    time_t now = time(nullptr);
    struct tm* timeinfo = localtime(&now);

    char sessionId[20];
    snprintf(sessionId, sizeof(sessionId), "%04d%02d%02d%02d%02d%02d",
             timeinfo->tm_year + 1900, timeinfo->tm_mon + 1,
             timeinfo->tm_mday, timeinfo->tm_hour,
             timeinfo->tm_min, timeinfo->tm_sec);

    return String(sessionId);
}

String generateTimestamp() {
    time_t now = time(nullptr);
    struct tm* timeinfo = localtime(&now);

    char timestamp[10];
    snprintf(timestamp, sizeof(timestamp), "%02d%02d%02d",
             timeinfo->tm_hour, timeinfo->tm_min, timeinfo->tm_sec);

    return String(timestamp);
}


// MQTT Callback
void mqttCallback(char* topic, byte* payload, unsigned int length) {
    Serial.print("Message arrived on topic: ");
    Serial.println(topic);
    Serial.print("Payload: ");
    for (unsigned int i = 0; i < length; i++) {
        Serial.print((char)payload[i]);
    }
    Serial.println();
}

// Connect to AWS IoT Core
void connectToAWS() {
    int retryCount = 0;
    while (!mqttClient.connected() && retryCount < 10) {
        Serial.print("Connecting to AWS IoT...");
        if (mqttClient.connect(AWS_IOT_CLIENT_ID)) {
            Serial.println("Connected!");
            mqttClient.subscribe(AWS_IOT_TOPIC);
        } else {
            Serial.print("Failed. State: ");
            Serial.println(mqttClient.state());
            delay(2000);
            retryCount++;
        }
    }
    if (!mqttClient.connected()) {
        Serial.println("Failed to connect to AWS IoT. Restarting...");
        ESP.restart();
    }
}


void readThermocouple() {
    unsigned long now = millis();

    if (!waitingForConversion) {
        if (now - lastSensorReadTime >= sensorReadInterval) {
            // Switch MUX
            digitalWrite(T0, currentSensor & 1);
            digitalWrite(T1, currentSensor & 2);
            digitalWrite(T2, currentSensor & 4);

            muxSwitchTime = now;
            waitingForConversion = true;
        }
    } else {
        if (now - muxSwitchTime >= 100) {  // Wait 100ms after switching
            double ftemp = thermocouple.readFahrenheit();

            if (isnan(ftemp) || ftemp < -100 || ftemp > 1000) {
                Temps[currentSensor] = -999;
                Serial.println("Thermocouple reading invalid.");
            } else {
                Temps[currentSensor] = trunc(ftemp);
            }

             // Internal temp after last probe
            if (currentSensor == NUM_SENSORS - 1) {
                //double internalC = ((int16_t)((raw >> 4) & 0x0FFF)) * 0.0625;
                double internalC = thermocouple.readInternal();
                outsideTemp = trunc((internalC * 9.0 / 5.0) + 32);
            }

            currentSensor = (currentSensor + 1) % NUM_SENSORS;
            lastSensorReadTime = now;
            waitingForConversion = false;
        }
    }
}


// Read Humidity Data
void readHumidity() {
    humidity = dht.readHumidity();
    if (isnan(humidity)) {
        humidity = 0.0;
        //lcd.setCursor(0, 2);
        //lcd.print("DHT Sensor Error");
    }
}

// Read Smoke Sensor Data
void readSmokeSensor() {
    smokePPM = analogRead(MQ135_PIN) * (5.0 / 1023.0) * 10.0;
    if (isnan(smokePPM)) {
        smokePPM = 0.0;
        lcd.setCursor(0, 3);
        lcd.print("Smoke Sensor Error");
    }
}

// Update LCD
// Update LCD
void updateLCD() {
    static int prevOutsideTemp = -999, prevTopTemp = -999, prevMidTemp = -999, prevBotTemp = -999;
    static int prevProbe1 = -999, prevProbe2 = -999, prevProbe3 = -999;

    // Updated helper function: prints dash if value == -999
    auto printValue = [](int col, int row, String label, int value, int prevValue) {
        if (value != prevValue) {
            // Clear previous text first
            String clearString = label + "    "; // label + 4 spaces to clear old numbers
            lcd.setCursor(col, row);
            lcd.print(clearString);

            // Then print updated value or dash
            lcd.setCursor(col, row);
            if (value == -999) {
                lcd.print(label + "-");
            } else {
                lcd.print(label + String(value) + "F");
            }
        }
    };

    printValue(0, 0, "Out:", int(outsideTemp), prevOutsideTemp);
    printValue(0, 1, "Top:", int(Temps[2]), prevTopTemp);
    printValue(0, 2, "Mid:", int(Temps[1]), prevMidTemp);
    printValue(0, 3, "Bot:", int(Temps[0]), prevBotTemp);
    printValue(11, 1, "P1:", int(Temps[4]), prevProbe1);
    printValue(11, 2, "P2:", int(Temps[5]), prevProbe2);
    printValue(11, 3, "P3:", int(Temps[6]), prevProbe3);

    // Update previous values
    prevOutsideTemp = int(outsideTemp);
    prevTopTemp = int(Temps[2]);
    prevMidTemp = int(Temps[1]);
    prevBotTemp = int(Temps[0]);
    prevProbe1 = int(Temps[4]);
    prevProbe2 = int(Temps[5]);
    prevProbe3 = int(Temps[6]);
}


// Publish Data to MQTT
void publishMQTT() {
    if (millis() - lastMqttSendTime >= mqttSendInterval) {
        StaticJsonDocument<512> doc;
         String timestamp = generateTimestamp(); 
        doc["session_id"] = session_id;
        doc["timestamp"] = timestamp;
        doc["outside_temp"] = outsideTemp;
        doc["bottom_temp"] = int(Temps[0]);
        doc["middle_temp"] = int(Temps[1]);
        doc["top_temp"] = int(Temps[2]);
        doc["probe1_temp"] = int(Temps[4]);
        doc["probe2_temp"] = int(Temps[5]);
        doc["probe3_temp"] = int(Temps[6]);
        doc["humidity"] = humidity;
        doc["smoke_ppm"] = smokePPM;

        char buffer[512];
        size_t jsonSize = serializeJson(doc, buffer);
        if (jsonSize <= 512) {
            mqttClient.publish(AWS_IOT_TOPIC, buffer);
        } else {
            Serial.println("Error: Payload size exceeds buffer!");
        }
        lastMqttSendTime = millis();
    }
}

// OTA Setup
void setupOTA() {
    ArduinoOTA.onStart([]() {
        lcd.setCursor(0, 3);
        lcd.print("OTA Update");
    });
    ArduinoOTA.onEnd([]() {
        lcd.setCursor(0, 3);
        lcd.print("OTA Complete");
    });
    ArduinoOTA.onError([](ota_error_t error) {
        lcd.setCursor(0, 3);
        lcd.print("OTA Error: ");
        lcd.print(error);
    });
    ArduinoOTA.begin();
}

// Setup
void setup() {
    Serial.begin(115200);
  //  while (!Serial) {
   // delay(10);  // Wait for USB CDC serial to connect
   // }

    Wire.begin(I2C_SDA, I2C_SCL);
    pinMode(T0, OUTPUT);
    pinMode(T1, OUTPUT);
    pinMode(T2, OUTPUT);

    setupLCD();
    connectToWiFi();
    syncTime();

    wifiClient.setCACert(AWS_IOT_CA_CERT);
    wifiClient.setCertificate(AWS_IOT_CLIENT_CERT);
    wifiClient.setPrivateKey(AWS_IOT_PRIVATE_KEY);

    mqttClient.setServer(AWS_IOT_ENDPOINT, AWS_IOT_PORT);
    mqttClient.setCallback(mqttCallback);

    session_id = generateSessionId();
    dht.begin();

    connectToAWS();
    setupOTA();
    analogReadResolution(10);  // ensures range is 0–1023
}

// Loop
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
