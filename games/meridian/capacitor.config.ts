// Capacitor wraps the web build (dist/) in native Android and iOS apps for the stores.
// Build with: npm run build && npx cap sync   (see docs/store-release.md)
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.gamecentral.meridian",
  appName: "Meridian",
  webDir: "dist",
  backgroundColor: "#0d1117",
  android: {
    // Game assets are generated at runtime; no mixed-content or cleartext traffic needed.
    allowMixedContent: false,
  },
  ios: {
    contentInset: "never",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#0d1117",
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
      style: "DARK",
    },
  },
};

export default config;
