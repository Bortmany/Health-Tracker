# Taking Cut native (App Store / Play Store)

The app already works on phones two ways today:

1. **Installable web app (live now):** open the site in Safari (iPhone) or Chrome (Android) → Share → "Add to Home Screen". It gets its own icon and runs full-screen like an app. Health data is manual entry.
2. **True store apps (this guide):** wrap the existing web app with Capacitor to publish on the App Store and Play Store and read Apple Health / Health Connect automatically.

## What you need first

| Requirement | Cost | Why |
|---|---|---|
| Apple Developer account | $99/year | Publishing to the App Store + HealthKit access |
| Google Play developer account | $25 once | Publishing to the Play Store |
| A Mac with Xcode (or a cloud build service like Ionic Appflow) | — | Apple only allows iOS builds from macOS |

## Steps (run from the repo root)

```bash
# 1. Install Capacitor into the web app
npm install @capacitor/core -w apps/web
npm install -D @capacitor/cli -w apps/web

# 2. Initialize (appId must be unique, reverse-domain style)
cd apps/web
npx cap init Cut com.yourdomain.cut --web-dir dist

# 3. Build the web app, then add the native projects
npm run build
npx cap add ios       # requires macOS
npx cap add android

# 4. Point the app at the live server: in capacitor.config.ts set
#    server: { url: 'https://YOUR-RENDER-URL', cleartext: false }
#    (or ship the bundle offline and let /api calls hit the server)

# 5. Open in the native IDEs to run/sign/publish
npx cap open ios
npx cap open android
```

## Health data

Health data is only readable on-device — Apple and Google provide no server API — which is why the app has `POST /api/health-sync`: the native app reads the data locally and pushes it to your server. Device data never overwrites anything you typed in by hand; it only fills in blanks.

- **iOS:** add a HealthKit plugin (e.g. `@perfood/capacitor-healthkit`), request read access to weight, steps, active energy, and sleep, then POST batches of `{ date, weight, steps, calories, sleep }` to `/api/health-sync` (max 90 days per call).
- **Android:** same pattern with a Health Connect plugin (e.g. `capacitor-health-connect`).
- Enable the HealthKit capability in Xcode and add the usage-description strings, or App Review will reject the build.

## Auth note

The app uses a login cookie. Capacitor's webview sends cookies for the `server.url` origin normally, so pointing the config at the live site (step 4) keeps login working with no code changes.
