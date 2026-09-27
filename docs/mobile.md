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

## What's already done in this repo

The code is iOS-ready — no more setup steps in the code itself:

- Capacitor (the wrapper that turns the web app into a real iOS app) is
  installed in `apps/web`.
- `apps/web/capacitor.config.json` holds the app's identity (`com.cut.app`,
  name "Cut"). **One thing to edit:** replace the placeholder in
  `server.url` with the app's real live URL once Railway is confirmed.
- Apple Health sync is wired in (`apps/web/src/native/healthSync.js`): when
  the app runs on a real iPhone it reads the last 30 days of weight, steps,
  active calories and sleep once a day and sends them to
  `POST /api/health-sync`. On the website this code does nothing.
- Ready-made commands in `apps/web`: `npm run ios:add` (create the Xcode
  project — Mac only), `npm run ios:sync` (rebuild and copy into the iOS
  project), `npm run ios:open` (open in Xcode).

## Steps that still need a Mac

Apple only allows iOS builds on macOS, so these run there (or in a cloud
build service like Ionic Appflow):

```bash
# 0. Get the code and put the real live URL in apps/web/capacitor.config.json
npm install

# 1. Create the native iOS project
cd apps/web
npm run ios:add

# 2. Install the Apple Health plugin the sync code talks to
npm install @perfood/capacitor-healthkit
npm run ios:sync

# 3. Open in Xcode to run on a phone, sign, and publish
npm run ios:open
```

For Android later: `npx cap add android` plus a Health Connect plugin — same
pattern.

## Health data

Health data is only readable on-device — Apple and Google provide no server API — which is why the app has `POST /api/health-sync`: the native app reads the data locally and pushes it to your server. Device data never overwrites anything you typed in by hand; it only fills in blanks.

- **iOS:** add a HealthKit plugin (e.g. `@perfood/capacitor-healthkit`), request read access to weight, steps, active energy, and sleep, then POST batches of `{ date, weight, steps, calories, sleep }` to `/api/health-sync` (max 90 days per call).
- **Android:** same pattern with a Health Connect plugin (e.g. `capacitor-health-connect`).
- Enable the HealthKit capability in Xcode and add the usage-description strings, or App Review will reject the build.

## Auth note

The app uses a login cookie. Capacitor's webview sends cookies for the `server.url` origin normally, so pointing the config at the live site (step 4) keeps login working with no code changes.
