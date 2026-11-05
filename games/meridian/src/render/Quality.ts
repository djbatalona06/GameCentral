// Quality tiers. Every visual feature that costs frame time is switched here, in one table,
// so a phone can hold 30 fps on Low/Medium while a desktop gets the full look on High/Ultra.

export type Tier = "low" | "medium" | "high" | "ultra";

export interface TierSpec {
  /** Highest device-pixel-ratio rendered (dynamic resolution can go lower). */
  maxDpr: number;
  /** Procedural material texture size in pixels. */
  textureSize: number;
  /** "blob" = a soft dark disc under characters only (no shadow map). */
  shadows: "blob" | "pcf1024" | "pcf2048" | "cascaded";
  /** Anisotropic filtering level for surface textures (1 = off). */
  anisotropy: number;
  fxaa: boolean;
  bloom: boolean;
  ssao: boolean;
  /** Weather particles alive at once. */
  particles: number;
  /** Grass blades per square metre. */
  grassDensity: number;
  /** Characters further than this many metres skip animation updates (they hold their pose). */
  animDistance: number;
}

export const TIERS: Record<Tier, TierSpec> = {
  low: { maxDpr: 1, textureSize: 256, shadows: "blob", anisotropy: 1, fxaa: false, bloom: false, ssao: false, particles: 200, grassDensity: 3.5, animDistance: 35 },
  medium: { maxDpr: 1.5, textureSize: 256, shadows: "pcf1024", anisotropy: 2, fxaa: true, bloom: false, ssao: false, particles: 400, grassDensity: 6, animDistance: 50 },
  high: { maxDpr: 2, textureSize: 512, shadows: "pcf2048", anisotropy: 4, fxaa: true, bloom: true, ssao: false, particles: 600, grassDensity: 8, animDistance: 80 },
  ultra: { maxDpr: 2, textureSize: 512, shadows: "cascaded", anisotropy: 8, fxaa: true, bloom: true, ssao: true, particles: 900, grassDensity: 10, animDistance: 120 },
};

/** What the browser tells us about the device (all optional: browsers hide some of it). */
export interface DeviceHints {
  /** navigator.deviceMemory, in GB (Chrome and Android only, rounded down to a power of two). */
  memoryGb?: number;
  /** iPhone or iPad. Apple hides the GPU name, but every recent one handles Medium. */
  ios?: boolean;
  /** The WebGL renderer string, for example "Adreno (TM) 619". */
  gpu?: string;
}

/** GPUs old or small enough that shadows and sharper textures would cost more than they give. */
const WEAK_GPU = /Adreno[^0-9]*[2-5]\d\d\b|Mali-4\d\d|Mali-T\d+|PowerVR|SGX|Software|SwiftShader/i;

/** Picks a tier for "Auto": phones get Low or Medium, computers get High. */
export function autoTier(cores: number, mobile: boolean, hints: DeviceHints = {}): Tier {
  if (!mobile) return cores >= 8 ? "high" : "medium";
  if (hints.ios) return "medium";
  if (hints.gpu && WEAK_GPU.test(hints.gpu)) return "low";
  if (hints.memoryGb !== undefined && hints.memoryGb <= 3) return "low";
  if (cores >= 8) return "medium";
  // Six cores and 4 GB or more is a 2020+ mid-range phone: it can afford real shadows.
  return cores >= 6 && (hints.memoryGb ?? 0) >= 4 ? "medium" : "low";
}
