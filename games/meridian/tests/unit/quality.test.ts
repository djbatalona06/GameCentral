import { describe, expect, it } from "vitest";
import { autoTier } from "../../src/render/Quality";

describe("autoTier", () => {
  it("gives computers High with 8+ cores and Medium otherwise", () => {
    expect(autoTier(8, false)).toBe("high");
    expect(autoTier(4, false)).toBe("medium");
  });

  it("gives iPhones Medium", () => {
    expect(autoTier(6, true, { ios: true })).toBe("medium");
  });

  it("keeps old or small Android GPUs on Low", () => {
    expect(autoTier(8, true, { gpu: "Adreno (TM) 506" })).toBe("low");
    expect(autoTier(8, true, { gpu: "Mali-T830" })).toBe("low");
    expect(autoTier(8, true, { memoryGb: 2 })).toBe("low");
  });

  it("lets a 2020+ mid-range Android phone have real shadows", () => {
    expect(autoTier(8, true, { gpu: "Adreno (TM) 619", memoryGb: 4 })).toBe("medium");
    expect(autoTier(6, true, { gpu: "Mali-G68", memoryGb: 6 })).toBe("medium");
  });

  it("stays on Low when nothing is known and cores are few", () => {
    expect(autoTier(4, true)).toBe("low");
    expect(autoTier(6, true)).toBe("low");
  });
});
