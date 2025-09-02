# ESP32-C3 Firmware

## Board / IDE
- Arduino IDE
- Board: ESP32C3 (install Espressif ESP32 core)
- Typical Port: (varies by system)

## Libraries (install via Library Manager)
- MAX31855 (thermocouple)
- DHT sensor (DHT11)
- MQ-135 (air quality) or equivalent
- LiquidCrystal_I2C (20x4 LCD)
- MQTT / AWS IoT client used by the sketch

> Adjust this list to match your actual Includes in the sketch.

## Credentials
- Copy `credentials.example.h` to `credentials.h` and fill in real values.
- `credentials.h` is **gitignored** on purpose.

## Build
1. Open the sketch folder in Arduino IDE (folder name must match `.ino` filename).
2. Select the ESP32C3 board and the correct port.
3. Verify/Upload.

