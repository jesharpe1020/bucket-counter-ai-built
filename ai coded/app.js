/*
  Bucket Counter App
  - Calibration of headings (grave, dirt pile, truck)
  - Automatic detection of swivel grave -> truck with optional dirt pass
  - Manual controls and localStorage persistence
  - Works offline and as a PWA (see sw.js and manifest)
*/

(function () {
  'use strict';

  // Storage keys
  const STORAGE_KEYS = {
    counter: 'bc.counter',
    grave: 'bc.graveHeading',
    dirt: 'bc.dirtHeading',
    truck: 'bc.truckHeading',
    tolerance: 'bc.tolerance',
    debounceMs: 'bc.debounceMs',
    requireDirtPass: 'bc.requireDirtPass'
  };

  // Default config
  const DEFAULTS = {
    toleranceDeg: 10,
    debounceMs: 1200,
    requireDirtPass: true
  };

  // State
  let currentHeadingDeg = 0; // 0..360
  let isRunning = false;
  let lastIncrementTs = 0;
  let hasPassedDirtSinceGrave = false;
  let lastHeadingTs = 0;

  // UI elements
  const el = {
    counterValue: document.getElementById('counterValue'),
    btnInc: document.getElementById('btnInc'),
    btnDec: document.getElementById('btnDec'),
    btnReset: document.getElementById('btnReset'),
    btnSetGrave: document.getElementById('btnSetGrave'),
    btnSetDirt: document.getElementById('btnSetDirt'),
    btnSetTruck: document.getElementById('btnSetTruck'),
    graveHeadingLabel: document.getElementById('graveHeadingLabel'),
    dirtHeadingLabel: document.getElementById('dirtHeadingLabel'),
    truckHeadingLabel: document.getElementById('truckHeadingLabel'),
    btnToggle: document.getElementById('btnToggle'),
    statusText: document.getElementById('statusText'),
    headingText: document.getElementById('headingText'),
    inputTolerance: document.getElementById('inputTolerance'),
    inputDebounce: document.getElementById('inputDebounce'),
    inputRequireDirt: document.getElementById('inputRequireDirt'),
    btnEnableSensors: document.getElementById('btnEnableSensors')
  };

  // Utilities
  const clampDeg = (deg) => {
    let d = deg % 360;
    if (d < 0) d += 360;
    return d;
  };

  const smallestAngleDelta = (a, b) => {
    let diff = clampDeg(a - b);
    if (diff > 180) diff -= 360;
    return Math.abs(diff);
  };

  const loadNumber = (key, fallback) => {
    const v = localStorage.getItem(key);
    if (v === null || v === undefined) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const loadBool = (key, fallback) => {
    const v = localStorage.getItem(key);
    if (v === null || v === undefined) return fallback;
    return v === 'true';
  };

  const save = (key, value) => localStorage.setItem(key, String(value));

  // Persistence-backed values
  let counter = loadNumber(STORAGE_KEYS.counter, 0);
  let graveHeading = loadNumber(STORAGE_KEYS.grave, NaN);
  let dirtHeading = loadNumber(STORAGE_KEYS.dirt, NaN);
  let truckHeading = loadNumber(STORAGE_KEYS.truck, NaN);
  let toleranceDeg = loadNumber(STORAGE_KEYS.tolerance, DEFAULTS.toleranceDeg);
  let debounceMs = loadNumber(STORAGE_KEYS.debounceMs, DEFAULTS.debounceMs);
  let requireDirtPass = loadBool(STORAGE_KEYS.requireDirtPass, DEFAULTS.requireDirtPass);

  // Initial UI sync
  const render = () => {
    el.counterValue.textContent = String(counter);
    el.graveHeadingLabel.textContent = Number.isFinite(graveHeading) ? Math.round(graveHeading) : '—';
    el.dirtHeadingLabel.textContent = Number.isFinite(dirtHeading) ? Math.round(dirtHeading) : '—';
    el.truckHeadingLabel.textContent = Number.isFinite(truckHeading) ? Math.round(truckHeading) : '—';
    el.headingText.textContent = String(Math.round(currentHeadingDeg));
    el.statusText.textContent = isRunning ? 'Detecting…' : 'Idle';
    if (el.btnToggle) el.btnToggle.textContent = isRunning ? 'Turn Off' : 'Turn On';

    el.inputTolerance.value = String(toleranceDeg);
    el.inputDebounce.value = String(debounceMs);
    el.inputRequireDirt.checked = !!requireDirtPass;
  };

  const increment = () => {
    counter += 1;
    save(STORAGE_KEYS.counter, counter);
    render();
  };

  const decrement = () => {
    counter = Math.max(0, counter - 1);
    save(STORAGE_KEYS.counter, counter);
    render();
  };

  const reset = () => {
    counter = 0;
    save(STORAGE_KEYS.counter, counter);
    render();
  };

  // Calibration handlers
  const readFreshHeading = async () => {
    const granted = await ensureSensorPermissions();
    if (!granted) {
      el.statusText.textContent = 'Permission required to read heading';
      el.btnEnableSensors.classList.remove('hidden');
      throw new Error('sensor-permission-denied');
    }
    return await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        window.removeEventListener('deviceorientation', onceHandler);
        el.statusText.textContent = 'No sensor data. Move phone or tap Start';
        reject(new Error('sensor-timeout'));
      }, 2000);
      const onceHandler = (event) => {
        const h = deriveHeadingFromOrientation(event);
        clearTimeout(timeoutId);
        window.removeEventListener('deviceorientation', onceHandler);
        resolve(h);
      };
      window.addEventListener('deviceorientation', onceHandler, { once: true });
    });
  };

  const setGrave = async () => {
    try {
      const h = await readFreshHeading();
      graveHeading = h;
      save(STORAGE_KEYS.grave, graveHeading);
      hasPassedDirtSinceGrave = false;
      render();
    } catch (_) {}
  };
  const setDirt = async () => {
    try {
      const h = await readFreshHeading();
      dirtHeading = h;
      save(STORAGE_KEYS.dirt, dirtHeading);
      render();
    } catch (_) {}
  };
  const setTruck = async () => {
    try {
      const h = await readFreshHeading();
      truckHeading = h;
      save(STORAGE_KEYS.truck, truckHeading);
      render();
    } catch (_) {}
  };

  // Detection logic
  const maybeDetectSwivel = (headingDeg) => {
    if (!isRunning) return;
    if (!Number.isFinite(graveHeading) || !Number.isFinite(truckHeading)) return;

    const now = Date.now();
    if (now - lastIncrementTs < debounceMs) return; // debounce

    const near = (target) => smallestAngleDelta(headingDeg, target) <= toleranceDeg;

    // Mark pass through dirt after grave
    if (Number.isFinite(dirtHeading) && near(dirtHeading)) {
      if (Number.isFinite(graveHeading)) {
        hasPassedDirtSinceGrave = true;
      }
    }

    const nearGrave = near(graveHeading);
    const nearTruck = near(truckHeading);

    // Strategy: count when reaching truck, provided we started from grave
    // Loose heuristic: if we get to truck and either dirt pass is not required, or we marked it after last grave lock
    if (nearTruck) {
      // if require dirt, ensure we passed it since a grave alignment; otherwise allow direct grave->truck or close
      const conditionOk = requireDirtPass ? hasPassedDirtSinceGrave : true;

      if (conditionOk) {
        // Stronger assurance: we also expect that we were near grave recently (within a window). We can't track full history, but we can mark when we see grave.
        // We track last time near grave; if not recent, we won't count. This reduces false positives.
        if (lastNearGraveTs && now - lastNearGraveTs < 4000) {
          increment();
          lastIncrementTs = now;
          hasPassedDirtSinceGrave = false; // reset for next cycle
        }
      }
    }

    if (nearGrave) {
      lastNearGraveTs = now;
      // When we lock onto grave, reset dirt pass mark for the next swing
      hasPassedDirtSinceGrave = false;
    }
  };

  let lastNearGraveTs = 0;

  // Heading calculation
  // We prefer absolute compass heading (alpha with webkitCompassHeading on iOS) when available.
  const deriveHeadingFromOrientation = (event) => {
    // iOS Safari provides webkitCompassHeading (0 = N, 90 = E)
    const anyEvent = event;
    if (typeof anyEvent.webkitCompassHeading === 'number') {
      return clampDeg(anyEvent.webkitCompassHeading);
    }
    // Otherwise, use alpha (0..360) and attempt to interpret as compass heading
    if (typeof event.alpha === 'number') {
      // alpha is device orientation around Z axis; on most browsers alpha=0 when device is facing north.
      // We'll assume alpha aligns with compass heading in degrees.
      return clampDeg(360 - event.alpha); // invert to match compass clockwise
    }
    return currentHeadingDeg;
  };

  const onDeviceOrientation = (event) => {
    currentHeadingDeg = deriveHeadingFromOrientation(event);
    lastHeadingTs = Date.now();
    render();
    maybeDetectSwivel(currentHeadingDeg);
  };

  const ensureSensorPermissions = async () => {
    // iOS 13+ requires explicit permission, some versions gate BOTH motion and orientation
    try {
      let motionGranted = true;
      let orientationGranted = true;

      const DeviceMotionEventAny = window.DeviceMotionEvent;
      if (
        DeviceMotionEventAny &&
        typeof DeviceMotionEventAny.requestPermission === 'function'
      ) {
        const resp = await DeviceMotionEventAny.requestPermission();
        motionGranted = resp === 'granted';
      }

      const DeviceOrientationEventAny = window.DeviceOrientationEvent;
      if (
        DeviceOrientationEventAny &&
        typeof DeviceOrientationEventAny.requestPermission === 'function'
      ) {
        const resp = await DeviceOrientationEventAny.requestPermission();
        orientationGranted = resp === 'granted';
      }

      return motionGranted && orientationGranted;
    } catch (_) {
      return false;
    }
  };

  const start = async () => {
    if (isRunning) return;
    const granted = await ensureSensorPermissions();
    if (!granted) {
      const insecure =
        location.protocol !== 'https:' &&
        location.hostname !== 'localhost' &&
        location.hostname !== '127.0.0.1';
      el.statusText.textContent = insecure
        ? 'Motion blocked on HTTP. Use HTTPS or enable in Safari settings.'
        : 'Permission denied. Tap Enable Sensors, then move device.';
      el.btnEnableSensors.classList.remove('hidden');
      render();
      return;
    }
    window.addEventListener('deviceorientation', onDeviceOrientation);
    isRunning = true;
    el.statusText.textContent = 'Detecting…';
    render();
  };

  const stop = () => {
    if (!isRunning) return;
    window.removeEventListener('deviceorientation', onDeviceOrientation);
    isRunning = false;
    el.statusText.textContent = 'Idle';
    render();
  };

  // Wire up UI events
  const init = () => {
    render();

    // On iOS (permission-gated), proactively show the enable button
    const needsExplicitPermission =
      (window.DeviceMotionEvent && typeof window.DeviceMotionEvent.requestPermission === 'function') ||
      (window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === 'function');
    if (needsExplicitPermission) {
      el.btnEnableSensors.classList.remove('hidden');
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        el.statusText.textContent = 'Tap Enable Sensors, then Start. For iOS, HTTPS works best.';
      }
    }

    el.btnInc.addEventListener('click', increment);
    el.btnDec.addEventListener('click', decrement);
    el.btnReset.addEventListener('click', reset);

    el.btnSetGrave.addEventListener('click', setGrave);
    el.btnSetDirt.addEventListener('click', setDirt);
    el.btnSetTruck.addEventListener('click', setTruck);

    el.btnToggle.addEventListener('click', () => {
      if (isRunning) {
        stop();
      } else {
        start();
      }
    });

    el.inputTolerance.addEventListener('change', () => {
      const v = Number(el.inputTolerance.value);
      if (Number.isFinite(v) && v >= 2 && v <= 45) {
        toleranceDeg = v;
        save(STORAGE_KEYS.tolerance, toleranceDeg);
      }
      render();
    });
    el.inputDebounce.addEventListener('change', () => {
      const v = Number(el.inputDebounce.value);
      if (Number.isFinite(v) && v >= 250 && v <= 5000) {
        debounceMs = v;
        save(STORAGE_KEYS.debounceMs, debounceMs);
      }
      render();
    });
    el.inputRequireDirt.addEventListener('change', () => {
      requireDirtPass = !!el.inputRequireDirt.checked;
      save(STORAGE_KEYS.requireDirtPass, requireDirtPass);
      render();
    });

    el.btnEnableSensors.addEventListener('click', async () => {
      const ok = await ensureSensorPermissions();
      if (ok) {
        el.btnEnableSensors.classList.add('hidden');
      }
    });
  };

  document.addEventListener('DOMContentLoaded', init);
})();


