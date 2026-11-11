# 💍 SineRing Sleep

> **Dedicated, Private & Lightweight Sleep Monitor for Smart Rings (COLMI R09 / QRing Hardware)**  
> 100% Offline • Zero Telemetry • No Accounts Required • Native Android Widget & Google Health Connect Integration

---

## 📖 Introduction & Philosophy

Modern budget smart rings, such as the **COLMI R09** (and similar rings using QRing / Realtek / Nordic BLE chipsets), offer impressive hardware: dual optical PPG sensors, skin temperature thermistors, infrared sleep monitoring, and multi-day battery life.

However, the official companion app (**QRing**) suffers from severe drawbacks:
- Heavy and bloated with gamification, fake social feeds, and unneeded sports modes.
- Invasive permissions requested (persistent background location, camera/accessibility overlays).
- Mandatory cloud account registration and proprietary Chinese cloud servers.
- Unreliable sleep scoring algorithms (e.g., awarding a 95 score to a 4-hour fragmented sleep).
- Aggressive background services draining the phone's battery.

**SineRing Sleep** was created to unlock the true potential of the ring:
1. **Privacy-First & Offline:** Your biometric data never leaves your device. No cloud, no analytics, no accounts.
2. **Dedicated Nighttime Monitor:** Laser-focused on restorative sleep architecture, hypnograms, resting heart rate, and skin temperature trends.
3. **Clinical 4-Pillar Scoring:** Realistic, medically aligned sleep score (Duration 40%, Deep Sleep 25%, REM 20%, Restfulness 15%).
4. **Native Android Ecosystem:** Direct sync to **Google Health Connect** (syncing to Google Fit / health apps) and a glanceable **Desktop Home Widget**.

---

## 💍 Supported Hardware: COLMI R09 Smart Ring

- **Model:** COLMI R09 (and compatible Nordic UART / QRing protocol rings)
- **Connectivity:** Bluetooth Low Energy (BLE 5.0)
- **Sensors:**
  - Optical PPG Heart Rate & SpO2 Sensor
  - Infrared Contact Sleep Sensor
  - Precision Skin Temperature Thermistor
  - 3-Axis Accelerometer (Movement / Actigraphy)
- **Battery Life:** 5 to 7 days on typical 10-minute sampling intervals.

---

## ✨ Features

- 🌙 **Interactive Hypnogram:** High-resolution step-chart rendering Deep Sleep, REM, Light Sleep, and Awakenings across the entire night.
- 🌡️ **Skin Temperature Telemetry:** Continuous tracking of nocturnal skin temperature changes, detecting circadian rhythm shifts and fever onset.
- 🧮 **Clinical 4-Pillar Sleep Score:**
  - **Duration Factor (40%):** Scaled to 7-9 hours optimal rest. Less than 5 hours will never score high.
  - **Deep Sleep Factor (25%):** Minimum 15-20% deep sleep required for full physical recovery.
  - **REM Sleep Factor (20%):** Crucial for memory consolidation and cognitive recovery.
  - **Restfulness Factor (15%):** Penalizes frequent awakenings and restless actigraphy.
- 💤 **Smart Siesta / Nap Filter:**
  - Micro-sleeps under 10 minutes are filtered out as sensor noise.
  - Sessions between 15 and 180 minutes during daytime are automatically tagged as **Siestas** with specialized metrics.
- 🌿 **Google Health Connect Integration:** Native 2-way sync with Android's official Health Connect repository (`androidx.health.connect:connect-client:1.1.0-alpha11`). Export your sleep sessions directly to Google Fit.
- 📱 **Android Desktop Home Screen Widget:** Glance at your sleep score, total hours, skin temperature, deep/rem ratio, and average heart rate without even opening the app.
- 🔍 **BLE Proximity Radar & Ring Finder:**
  - Real-time RSSI signal strength meter to locate a misplaced ring in your room.
  - Optical LED flasher to make the ring blink on command.
- ⏱️ **On-Device Flash Interval Configuration:** Customize the ring's internal logging interval (5, 10, 15, or 30 minutes) to tailor precision vs. battery life.
- 🔬 **Sensor Diagnostic Suite:** Real-time engineering test bench to individually verify Skin Temp, PPG Heart Rate, SpO2, and Stress/HRV with raw BLE telemetry stream.
- 💾 **Resilient Local Persistence:** Dual-layer storage using IndexedDB and Android `hasFragileUserData="true"` protection to prevent data loss on app updates.

---

## 🔬 Reverse Engineered BLE Protocol (COLMI R09)

The ring uses two primary BLE Services:

### 1. Nordic UART Service (Control & Real-time Sensors)
- **Service UUID:** `6e40fff0-b5a3-f393-e0a9-e50e24dcca9e`
- **TX Characteristic (Notify):** `6e40fff1-b5a3-f393-e0a9-e50e24dcca9e`
- **RX Characteristic (Write):** `6e40fff2-b5a3-f393-e0a9-e50e24dcca9e`

#### Key Command Packets (Written to RX):
- **Find Device (Blink LEDs):**  
  `[0x09, 0x01, 0x03, 0x00, ...]`
- **Set Flash Logging Interval:**  
  `[0x16, 0x00, <interval_minutes>, 0x00, ...]`  
  *(Supported: 5, 10, 15, 30 min)*
- **Single Sensor Diagnostics (0x69):**  
  - Temperature: `[0x69, 0x01, 0x05, 0x00, ...]`
  - Heart Rate PPG: `[0x69, 0x01, 0x01, 0x00, ...]`
  - SpO2: `[0x69, 0x01, 0x02, 0x00, ...]`
  - Stress / HRV: `[0x69, 0x01, 0x06, 0x00, ...]`
  - Stop sensor test: `[0x69, 0x00, 0x00, 0x00, ...]`

### 2. BigData Service (Flash Memory Sleep & Temp Sync)
- **Service UUID:** `de5bf728-d711-4e47-af26-65e3012a5dc7`
- **TX Characteristic (Notify):** `de5bf729-d711-4e47-af26-65e3012a5dc7`
- **RX Characteristic (Write):** `de5bf72a-d711-4e47-af26-65e3012a5dc7`

#### BigData Opcodes:
- **`0x27` (Nightly Sleep Summary & Epochs):**  
  Synchronizes historic sleep stages logged in flash memory. Each record contains header timestamps (start/end) followed by epoch arrays where stages are encoded:
  - `0x03`: Deep Sleep
  - `0x04`: REM Sleep
  - `0x02` / `0x00`: Light Sleep
  - `0x01` / `0x05`: Awake
- **`0x25` (Nightly Skin Temperature History):**  
  Retrieves 10-minute interval skin temperature logs logged throughout the night, calibrated in tenths of a degree Celsius.

---

## 🛠️ Architecture

```
sinering-sleep/
├── www/                         # Clean Web Frontend (Vanilla ES6, CSS Glassmorphism)
│   ├── index.html               # Main UI (Monitor, History, Settings tabs)
│   ├── app.js                   # Application logic, hypnogram renderer, sleep scorer
│   ├── ble.bundle.js            # BLE protocol handler & packet decoder
│   └── styles.css               # Responsive OLED dark / light theme
├── android/                     # Native Android Capacitor Project
│   ├── app/src/main/
│   │   ├── AndroidManifest.xml  # Permissions, Health Connect rationales, Widget config
│   │   ├── java/.../
│   │   │   ├── MainActivity.java        # Capacitor bridge initializer
│   │   │   ├── HealthConnectPlugin.kt   # Native Kotlin Health Connect integration
│   │   │   ├── SleepWidgetPlugin.java   # AppWidget bridge & data provider
│   │   │   └── SleepWidgetProvider.java # RemoteViews desktop widget
│   │   └── res/
│   │       ├── layout/widget_sleep_summary.xml  # Translucent desktop widget layout
│   │       └── xml/sleep_widget_info.xml
│   └── build.gradle
└── SineRing-Sleep.apk           # Ready-to-install compiled Android APK
```

---

## 🚀 Building & Installing

### Prerequisites
- Node.js (v18+)
- Android Studio / Android SDK (API 34, compileSdk 34, minSdk 26)
- Java 17

### Build Steps
```bash
# 1. Install dependencies
npm install

# 2. Sync web assets to Android
npx cap sync android

# 3. Compile the debug APK
cd android
./gradlew assembleDebug

# The APK will be generated at:
# android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 🔒 Permissions & Privacy

SineRing Sleep only requests strictly required hardware permissions:
- `BLUETOOTH_SCAN` & `BLUETOOTH_CONNECT`: To establish direct local BLE connection with your ring.
- `android.permission.health.WRITE_SLEEP` & `READ_SLEEP`: Optional, only if you choose to sync your sleep to Google Health Connect.
- **No Internet transmission:** All network access is limited to local device communication. No external servers are contacted.

---

## 📄 License

This project is licensed under the **MIT License**. Open source and free for the community.
Contributions, reverse engineering improvements, and bug reports are warmly welcome!
