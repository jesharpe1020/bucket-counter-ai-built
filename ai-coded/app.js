/*
  Bucket Counter App
  - Calibration of headings (grave, truck)
  - Automatic detection of swivel grave -> truck
  - Manual controls and localStorage persistence
  - Works offline and as a PWA (see sw.js and manifest)
*/

(function () {
  'use strict';

  // Storage keys
  const STORAGE_KEYS = {
    counter: 'bc.counter',
    grave: 'bc.graveHeading',
    truck: 'bc.truckHeading',
    tolerance: 'bc.tolerance',
    debounceMs: 'bc.debounceMs'
  };

  // Default config
  const DEFAULTS = {
    toleranceDeg: 15,
    debounceMs: 4000,
  };

  // State
  let currentHeadingDeg = 0; // 0..360
  let isRunning = false;
  let lastIncrementTs = 0;
  let lastHeadingTs = 0;
  let screenWakeLock = null;

  // UI elements
  const el = {
    counterValue: document.getElementById('counterValue'),
    btnInc: document.getElementById('btnInc'),
    btnDec: document.getElementById('btnDec'),
    btnNewGrave: document.getElementById('btnNewGrave'),
    btnResetCalibration: document.getElementById('btnResetCalibration'),
    btnSetGrave: document.getElementById('btnSetGrave'),
    btnSetTruck: document.getElementById('btnSetTruck'),
    graveHeadingLabel: document.getElementById('graveHeadingLabel'),
    truckHeadingLabel: document.getElementById('truckHeadingLabel'),
    btnToggle: document.getElementById('btnToggle'),
    statusText: document.getElementById('statusText'),
    headingText: document.getElementById('headingText'),
    // Debug inputs removed
    btnEnableSensors: null
  };

  const resetCalibration = () => {
    graveHeading = NaN;
    truckHeading = NaN;
    save(STORAGE_KEYS.grave, graveHeading);
    save(STORAGE_KEYS.truck, truckHeading);
    render();
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

  // Screen wake lock helpers (iOS Safari 16.4+)
  const requestScreenWakeLock = async () => {
    try {
      if ('wakeLock' in navigator && !screenWakeLock) {
        screenWakeLock = await navigator.wakeLock.request('screen');
        screenWakeLock.addEventListener('release', () => {
          screenWakeLock = null;
          // If still running and page is visible, try to reacquire
          if (isRunning && document.visibilityState === 'visible') {
            requestScreenWakeLock().catch(() => {});
          }
        });
      }
    } catch (_) {
      // Ignore; on iOS versions without support, do nothing
    }
  };

  const releaseScreenWakeLock = async () => {
    try {
      if (screenWakeLock) {
        await screenWakeLock.release();
        screenWakeLock = null;
      }
    } catch (_) {
      screenWakeLock = null;
    }
  };

  // Persistence-backed values
  let counter = loadNumber(STORAGE_KEYS.counter, 0);
  let graveHeading = loadNumber(STORAGE_KEYS.grave, NaN);
  let truckHeading = loadNumber(STORAGE_KEYS.truck, NaN);
  let toleranceDeg = loadNumber(STORAGE_KEYS.tolerance, DEFAULTS.toleranceDeg);
  let debounceMs = loadNumber(STORAGE_KEYS.debounceMs, DEFAULTS.debounceMs);

  // Initial UI sync
  const render = () => {
    el.counterValue.textContent = String(counter);
    el.graveHeadingLabel.textContent = Number.isFinite(graveHeading) ? Math.round(graveHeading) : '—';
    el.truckHeadingLabel.textContent = Number.isFinite(truckHeading) ? Math.round(truckHeading) : '—';
    el.headingText.textContent = String(Math.round(currentHeadingDeg));
    el.statusText.textContent = isRunning ? 'Detecting…' : 'Idle';
    if (el.btnToggle) {
      el.btnToggle.textContent = isRunning ? 'Turn Off' : 'Pause Detection';
      el.btnToggle.className = isRunning
        ? 'rounded bg-danger/70 px-3 py-2 font-semibold text-white'
        : 'rounded bg-accent/70 px-3 py-2 font-semibold text-white';
    }

    // Debug inputs removed
  };

  // Auto-detect increment: +1
  const increment = () => {
    counter += 1;
    save(STORAGE_KEYS.counter, counter);
    render();
  };

  // Manual controls: ±0.5
  const manualInc = () => {
    counter = Math.max(0, (counter || 0) + 0.5);
    save(STORAGE_KEYS.counter, counter);
    render();
  };

  const manualDec = () => {
    counter = Math.max(0, (counter || 0) - 0.5);
    save(STORAGE_KEYS.counter, counter);
    render();
  };

  const newGrave = () => {
    // Stop detection if running
    if (isRunning) {
      window.removeEventListener('deviceorientation', onDeviceOrientation);
      isRunning = false;
      el.statusText.textContent = 'Idle';
    }
    // Reset count
    counter = 0;
    save(STORAGE_KEYS.counter, counter);
    // Clear calibration
    graveHeading = NaN;
    truckHeading = NaN;
    save(STORAGE_KEYS.grave, graveHeading);
    save(STORAGE_KEYS.truck, truckHeading);
    render();
  };

  // Calibration handlers
  const readFreshHeading = async () => {
    const granted = await ensureSensorPermissions();
    if (!granted) {
      el.statusText.textContent = 'Permission required to read heading';
      // No enable button; user must grant in browser settings
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
      render();
      if (Number.isFinite(graveHeading) && Number.isFinite(truckHeading)) {
        start();
      }
    } catch (_) {}
  };
  const setTruck = async () => {
    try {
      const h = await readFreshHeading();
      truckHeading = h;
      save(STORAGE_KEYS.truck, truckHeading);
      render();
      if (Number.isFinite(graveHeading) && Number.isFinite(truckHeading)) {
        start();
      }
    } catch (_) {}
  };

  // Detection logic
  const maybeDetectSwivel = (headingDeg) => {
    if (!isRunning) return;
    if (!Number.isFinite(graveHeading) || !Number.isFinite(truckHeading)) return;

    const now = Date.now();
    if (now - lastIncrementTs < debounceMs) return; // debounce

    const near = (target) => smallestAngleDelta(headingDeg, target) <= toleranceDeg;

    const nearGrave = near(graveHeading);
    const nearTruck = near(truckHeading);

    // Strategy: count when reaching truck, provided we started from grave
    if (nearTruck) {
      // Assurance: require we were near grave recently (within a window)
      if (lastNearGraveTs && now - lastNearGraveTs < 4000) {
        increment();
        lastIncrementTs = now;
      }
    }

    if (nearGrave) {
      lastNearGraveTs = now;
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
      el.statusText.textContent = 'Permission denied. Enable motion/orientation in browser settings, then Start.';
      render();
      return;
    }
    window.addEventListener('deviceorientation', onDeviceOrientation);
    isRunning = true;
    el.statusText.textContent = 'Detecting…';
    // Keep screen awake while detecting
    requestScreenWakeLock();
    render();
  };

  const stop = () => {
    if (!isRunning) return;
    window.removeEventListener('deviceorientation', onDeviceOrientation);
    isRunning = false;
    el.statusText.textContent = 'Idle';
    releaseScreenWakeLock();
    render();
  };

  // Wire up UI events
  const init = () => {
    render();

    // On iOS (permission-gated), surface status but do not show an enable button

    if (el.btnInc) el.btnInc.addEventListener('click', (e) => { e.preventDefault(); manualInc(); });
    if (el.btnDec) el.btnDec.addEventListener('click', (e) => { e.preventDefault(); manualDec(); });
    if (el.btnNewGrave) el.btnNewGrave.addEventListener('click', newGrave);
    if (el.btnResetCalibration) el.btnResetCalibration.addEventListener('click', resetCalibration);

    el.btnSetGrave.addEventListener('click', setGrave);
    el.btnSetTruck.addEventListener('click', setTruck);

    el.btnToggle.addEventListener('click', () => {
      if (isRunning) {
        stop();
      } else {
        start();
      }
    });

    // Debug inputs removed

    // Enable Sensors button removed

    // Reacquire wake lock when tab becomes visible
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && isRunning) {
        requestScreenWakeLock();
      }
    });
    // Release on navigation away
    window.addEventListener('pagehide', releaseScreenWakeLock);
    window.addEventListener('beforeunload', releaseScreenWakeLock);
  };

  document.addEventListener('DOMContentLoaded', init);
})();


