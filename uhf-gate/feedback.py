"""LED and buzzer feedback on tag detection."""

import threading
import time
import logging

logger = logging.getLogger(__name__)

_BEEP_FREQ = 1000   # Hz
_BEEP_MS = 200      # ms
_LED_MS = 300       # ms
_DEDUP_LED_MS = 100 # ms


def _make_led(pin: int | None, label: str):
    if pin is None:
        return None
    try:
        from gpiozero import LED
        led = LED(pin)
        logger.info(f"{label} LED on GPIO {pin}")
        return led
    except Exception as e:
        logger.warning(f"{label} LED init failed (GPIO {pin}): {e}")
        return None


class Feedback:
    def __init__(self, led_pin: int | None, dedup_led_pin: int | None, buzzer_pin: int | None):
        self.led = _make_led(led_pin, "Green")
        self.dedup_led = _make_led(dedup_led_pin, "Yellow")
        self.buzzer = None

        if buzzer_pin is not None:
            try:
                from gpiozero import TonalBuzzer
                self.buzzer = TonalBuzzer(buzzer_pin)
                logger.info(f"Buzzer on GPIO {buzzer_pin}")
            except Exception as e:
                logger.warning(f"Buzzer init failed (GPIO {buzzer_pin}): {e}")

    def trigger(self):
        """Green LED + buzzer: tag accepted as a new finish."""
        if self.led is None and self.buzzer is None:
            return
        threading.Thread(target=self._run_finish, daemon=True).start()

    def trigger_dedup(self):
        """Yellow LED only: tag seen but suppressed by dedup."""
        if self.dedup_led is None:
            return
        threading.Thread(target=self._run_dedup, daemon=True).start()

    def _run_finish(self):
        from gpiozero.tones import Tone

        if self.led:
            self.led.on()
        if self.buzzer:
            self.buzzer.play(Tone(frequency=_BEEP_FREQ))

        time.sleep(_BEEP_MS / 1000)

        if self.buzzer:
            self.buzzer.stop()

        remaining = (_LED_MS - _BEEP_MS) / 1000
        if remaining > 0:
            time.sleep(remaining)

        if self.led:
            self.led.off()

    def _run_dedup(self):
        self.dedup_led.on()
        time.sleep(_DEDUP_LED_MS / 1000)
        self.dedup_led.off()

    def close(self):
        if self.led:
            self.led.close()
        if self.dedup_led:
            self.dedup_led.close()
        if self.buzzer:
            self.buzzer.close()
