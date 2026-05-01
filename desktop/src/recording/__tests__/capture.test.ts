import { describe, expect, it } from "vitest";
import { readLevel } from "../capture";

describe("readLevel", () => {
  it("returns 0 for silence", () => {
    const fakeAnalyser = {
      fftSize: 4,
      getByteTimeDomainData(arr: Uint8Array) { arr.fill(128); },
    } as unknown as AnalyserNode;
    expect(readLevel(fakeAnalyser)).toBe(0);
  });
  it("returns >0 for non-zero signal", () => {
    const fakeAnalyser = {
      fftSize: 4,
      getByteTimeDomainData(arr: Uint8Array) { arr[0] = 200; arr[1] = 60; arr[2] = 200; arr[3] = 60; },
    } as unknown as AnalyserNode;
    expect(readLevel(fakeAnalyser)).toBeGreaterThan(0);
  });
});
