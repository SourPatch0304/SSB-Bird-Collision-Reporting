import { describe, expect, it } from "vitest";
import { validateMediaCount, validateMediaSize, validateMediaType } from "../src/services/mediaService";

describe("media validation", () => {
  it("rejects NumMedia 0", () => {
    expect(validateMediaCount(0)).toEqual({ valid: false, message: "Please send at least one photo." });
  });

  it("rejects NumMedia > 5", () => {
    expect(validateMediaCount(6)).toEqual({ valid: false, message: "Please send up to 5 photos." });
  });

  it("rejects non jpeg/png", () => {
    expect(validateMediaType("application/pdf").valid).toBe(false);
  });

  it("rejects over MAX_MEDIA_BYTES", () => {
    expect(validateMediaSize(9_000_000, 8_000_000).valid).toBe(false);
  });
});
