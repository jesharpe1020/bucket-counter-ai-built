# Project Specification

## 1. Overview
A mobile-friendly bucket counter app for grave diggers that uses a phone’s built-in sensors to detect excavator swivel motions from the grave to the load truck and automatically increments a counter. Designed to work entirely client-side, with no internet connection required, and to run as a PWA for easy installation on mobile devices.

## 2. Target Audience
- Grave diggers and cemetery workers operating excavators.
- Site supervisors who need accurate scoop counts for efficiency and billing.
- Small excavation crews who want a simple, offline tool without complex setup.

## 3. Tech Stack (MVP)
- **Frontend:** Vanilla JavaScript + HTML + TailwindCSS (via CDN for fast styling)
- **Backend:** None (fully client-side)
- **Data Storage:** `localStorage` (persistent counter between sessions)
- **Hosting:** Static hosting (Vercel, Netlify, GitHub Pages)
- **Hardware Access:** `DeviceOrientationEvent` / `DeviceMotionEvent` API
- **Installable as App:** PWA with offline capability

## 4. Core Features (MVP)
1. **Calibration Phase:**
   - User points phone in the direction of the grave → taps **"Set Grave"**.
   - User points phone in the direction of the dirt pile → taps **"Set Dirt Pile"**.
   - User points phone in the direction of the truck → taps **"Set Truck"**.
   - App stores these direction headings for later detection.
2. **Automatic Detection:**
   - Continuously monitors device orientation.
   - When a heading change matches a "grave → truck" swivel within a tolerance range (e.g., ±10°) and passes debounce timing, increment the counter by 1.
3. **Manual Override Controls:**
   - **+ Button** → increment counter by 1.
   - **– Button** → decrement counter by 1.
   - **Reset Button** → set counter to zero.
4. **Persistent Storage:**
   - Counter value saved in `localStorage` so it remains between app sessions.
5. **UI Display:**
   - Large, high-contrast counter number visible in bright daylight.
   - Calibration and control buttons clearly labeled and finger-friendly.

## 5. User Flows
### Starting a Job
1. Open the app (PWA icon on phone).
2. Reset counter to zero (optional).
3. Calibrate directions by setting Grave, Dirt Pile, and Truck headings.
4. Tap "Start" to begin automatic detection.
5. App begins counting whenever "grave → truck" swivel is detected.

### During Job
- Counter automatically increments on detected swivel motions.
- User can manually adjust count using + or – buttons if needed.

### Ending a Job
- Review final count on screen.
- (Optional) Screenshot or manually record number.
- Tap Reset before starting next job.

## 6. UI/UX Guidelines
- **Style:** Minimal, high-contrast design for visibility in outdoor environments.
- **Layout:** Large counter centered on screen, buttons below it.
- **Buttons:** Large tap targets for gloves or dirty hands.
- **Calibration:** Use clear prompts and icons for each step.
- **Offline-First:** All features available without internet.

## 7. Constraints
- Works in modern mobile browsers with motion sensor support.
- Graceful handling of permissions if sensor access is denied.
- Debounce logic to prevent double-counting from minor movements.
- Tolerance ranges adjustable in code for fine-tuning in the field.

## 8. Example Data / Config Storage
```json
{
  "graveHeading": 45,
  "dirtPileHeading": 120,
  "truckHeading": 200,
  "counter": 37
}
