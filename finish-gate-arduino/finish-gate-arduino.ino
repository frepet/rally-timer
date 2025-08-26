// Arduino Uno + HC-SR04 finish-line detector
// Sends: PASS,<millis> on a single line when a car passes (distance < THRESHOLD_CM)

const int TRIG_PIN = 9;
const int ECHO_PIN = 10;
const int PASS_LED = 11;

// Tune these for your setup:
const unsigned long MEASURE_TIMEOUT_MICROS = 25000UL; // ~4.3m max, we only need short range
const float SOUND_SPEED_CM_PER_US = 0.0343f / 2.0f;  // /2 because pulseIn measures round trip
const int SAMPLES = 5;

const float THRESHOLD_CM = 40.0f;   // Trigger when closer than this
const float RELEASE_CM   = 50.0f;   // Hysteresis: must go above this to re-arm
const unsigned long COOLDOWN_MS = 100UL; // Minimum time between triggers

unsigned long lastTriggerMs = 0;
bool armed = true;

float measureOnceCM() {
  // Send 10us pulse on TRIG
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // Read echo duration
  unsigned long duration = pulseIn(ECHO_PIN, HIGH, MEASURE_TIMEOUT_MICROS);
  if (duration == 0) {
    // Timeout/no echo -> treat as "far"
    return 9999.0f;
  }
  // Convert to distance
  return duration * SOUND_SPEED_CM_PER_US;
}

float medianOfSamplesCM() {
  float v[SAMPLES];
  for (int i = 0; i < SAMPLES; i++) {
    v[i] = measureOnceCM();
    delay(5); // tiny gap to de-correlate readings
  }
  // Simple insertion sort for small SAMPLES
  for (int i = 1; i < SAMPLES; i++) {
    float key = v[i];
    int j = i - 1;
    while (j >= 0 && v[j] > key) {
      v[j + 1] = v[j];
      j--;
    }
    v[j + 1] = key;
  }
  return v[SAMPLES / 2]; // median
}

void setup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(PASS_LED, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  Serial.begin(115200);
  // Warm up sensor
  delay(200);
}

void loop() {
  float d = medianOfSamplesCM();
  unsigned long now = millis();

  if (armed) {
    if (d < THRESHOLD_CM && (now - lastTriggerMs) > COOLDOWN_MS) {
      lastTriggerMs = now;
      armed = false;
      digitalWrite(PASS_LED, HIGH);
      Serial.println("P");
      // Optional: small delay to avoid instant re-measure on transient
      delay(20);
    }
  } else {
    // Re-arm once clear again (hysteresis)
    if (d > RELEASE_CM) {
      armed = true;
      digitalWrite(PASS_LED, LOW);
    }
  }

  // Sampling pace (adjust as needed). 10–20 Hz works well.
  delay(10);
}
