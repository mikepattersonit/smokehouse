# ESP32-C3 Firmware

- Sketch: `Smokehouse_AWS/Smokehouse_AWS.ino`
- Board: **ESP32C3**
- Libraries: MAX31855, DHT, LiquidCrystal_I2C, ArduinoJson, PubSubClient
- `preferences.h` stores local settings (session gap, LCD paging, etc.)
- `credentials.h` is **local only** (gitignored).

## LCD Pages
- **Env page (5s):** Left = Outside/Top/Mid/Bot, Right = Smoke/Humidity  
- **Probes page (5s):** P1–P4 per screen (auto-paginate if >4)

