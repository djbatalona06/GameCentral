# Getting Meridian into the app stores

Meridian is one web build that ships three ways:

| How | What players do | Built by |
|---|---|---|
| Website / installable web app (PWA) | Open the link, then "Add to Home Screen" | `npm run build`, then host the `dist/` folder anywhere |
| **Android app** (Google Play) | Install from Play | Capacitor project in `android/`, built by GitHub Actions |
| **iPhone / iPad app** (App Store) | Install from the App Store | Capacitor project in `ios/`, needs a Mac (or GitHub's Mac runners) |

Both apps play in **portrait and landscape**, run full screen, use the phone's haptic engine, and map the Android **Back** button to "go back / pause".

## What is already done
- `capacitor.config.ts`: app id `com.gamecentral.meridian`, the name, a dark splash screen, and a hidden status bar.
- `android/` and `ios/` projects with icons and splash screens. To regenerate them from `resources/`, run `npm run icons`.
- `src/platform/native.ts`: haptics, the Back button, pausing when the app is hidden, and skipping the service worker inside the app.
- `.github/workflows/meridian-android.yml`: runs the tests and builds a **debug APK** on every change. You can download it from the run's "Artifacts" and install it on your phone.
- `.github/workflows/meridian-ios.yml`: checks that the iOS app **compiles** on a Mac runner.

## What you have to do (needs your accounts and your money)
1. **Accounts**
   - Google Play Console: a one-time $25 fee. Identity checks can take a few days.
   - Apple Developer Program: $99 a year. This is required for TestFlight and the App Store.
2. **Android signing key** (once; keep it forever, because losing it means you can never update the app):
   ```bash
   keytool -genkeypair -v -keystore meridian-release.jks -alias meridian -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 meridian-release.jks > keystore.b64     # macOS: base64 -i meridian-release.jks -o keystore.b64
   ```
   Then in GitHub, go to **Settings → Secrets and variables → Actions** and add:
   - `ANDROID_KEYSTORE_BASE64`: the contents of `keystore.b64`
   - `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`meridian`) and `ANDROID_KEY_PASSWORD`

   The next push to `main` builds a signed **`app-release.aab`**. Upload that file to Play Console.

   Never commit the `.jks` file or the passwords.
3. **iOS**: open the project on a Mac with `npm run cap:sync && npm run ios:open`. In Xcode, pick your team under **Signing & Capabilities**, then **Product → Archive**, then upload to App Store Connect. Use TestFlight first.
4. **Store listing.** Both stores ask for these:
   - **Privacy policy URL.** Meridian collects **no personal data**: there are no accounts and no analytics, and saves stay on the device. The draft below is enough. Host it on a public page such as GitHub Pages.
   - **Content rating questionnaire**: stylised violence against human enemies, no blood, no in-app purchases, no gambling. Expect about Teen / PEGI 12.
   - **Screenshots**: phone portrait *and* landscape (Play needs at least 2; Apple needs 6.7" and 5.5" iPhone sizes). Take them in the debug build with `?debug&chapter=N`.
   - **Data safety (Play) / App privacy (Apple)**: "No data collected".

## Draft store text
**Short description (80 characters):** Climb, sneak and shoot through a lost navigator's trail to a drowned city.

**Full description:**
> Salvage diver Ines Calder finds a 400-year-old astrolabe in a shipwreck, and with it the trail of Catalina de Ordaz, a navigator who hid a city from the world. Climb sea cliffs and monastery towers, sneak through caravan camps and searchlit shipyards, race the Gilt Company across the salt flats, and fight along the roof of a speeding night train.
>
> • Act I: seven chapters of climbing, stealth, cover shooting and puzzles
> • Play in portrait or landscape, with touch, gamepad or keyboard
> • Full accessibility suite: presets for vision, hearing and motor, remappable controls, one-handed touch layouts, subtitles, colour-blind modes, and puzzles that never need sound
> • No ads, no accounts, works offline

**Privacy policy (draft):**
> Meridian does not collect, store or share any personal information. Game saves and settings are stored only on your device. The app makes no network requests during play.

## Checklist before each release
- [ ] `npm test` and `npm run e2e` pass
- [ ] Bump `versionCode` and `versionName` in `android/app/build.gradle`, and the version and build in Xcode
- [ ] Bump `CACHE` in `public/sw.js` (for web players)
- [ ] Play through Ch1–7 on a real phone, in both orientations
- [ ] Screenshots updated
