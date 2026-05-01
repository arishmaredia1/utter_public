import { describe, expect, it, beforeEach, vi } from "vitest";

beforeEach(() => {
  process.env.R2_ACCOUNT_ID = "abc";
  process.env.R2_ACCESS_KEY_ID = "key";
  process.env.R2_SECRET_ACCESS_KEY = "secret";
  process.env.R2_BUCKET = "utter";
  vi.resetModules();
});

describe("getSignedPlaybackUrl", () => {
  it("returns an https URL with X-Amz-Signature query", async () => {
    const { getSignedPlaybackUrl } = await import("../r2");
    const url = await getSignedPlaybackUrl("recordings/foo.webm");
    expect(url.startsWith("https://")).toBe(true);
    expect(url).toMatch(/X-Amz-Signature=/);
    expect(url).toMatch(/recordings\/foo\.webm/);
  });
});
