// The bridge between the game and the phone when it runs as a store app (Capacitor).
// In a normal browser every function here falls back to web APIs, so the same build works
// as a website, an installed web app (PWA) and a native Android/iOS app.

import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { StatusBar } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";

export const isNative = (): boolean => Capacitor.isNativePlatform();

/**
 * A short buzz. Native apps use the phone's haptic engine (much nicer than a raw vibration);
 * browsers use the vibration API where it exists (Android Chrome; iPhone Safari has none).
 */
export function vibrate(pattern: number | number[]): void {
  if (!isNative()) {
    navigator.vibrate?.(pattern);
    return;
  }
  const total = Array.isArray(pattern) ? pattern.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) : pattern;
  const style = total >= 70 ? ImpactStyle.Heavy : total >= 25 ? ImpactStyle.Medium : ImpactStyle.Light;
  void Haptics.impact({ style }).catch(() => undefined);
}

/** Native-only setup: full screen, the hardware Back button, and pausing when the app is hidden. */
export async function initNative(handlers: { back: () => void; pause: () => void }): Promise<void> {
  if (!isNative()) return;
  await StatusBar.hide().catch(() => undefined);
  await App.addListener("backButton", handlers.back);
  await App.addListener("pause", handlers.pause);
  await SplashScreen.hide().catch(() => undefined);
}
