import { describe, expect, it } from "vitest";
import { formatTime, parseTime } from "./index.js";

describe("formatTime", () => {
  it("pads to HH:MM:SS", () => {
    expect(formatTime(0)).toBe("00:00:00");
    expect(formatTime(9)).toBe("00:00:09");
    expect(formatTime(75)).toBe("00:01:15");
    expect(formatTime(3661)).toBe("01:01:01");
  });
  it("floors fractional seconds", () => {
    expect(formatTime(9.9)).toBe("00:00:09");
  });
});

describe("parseTime", () => {
  it("parses HH:MM:SS", () => {
    expect(parseTime("01:01:01")).toBe(3661);
  });
  it("parses MM:SS", () => {
    expect(parseTime("01:15")).toBe(75);
  });
  it("returns null for garbage", () => {
    expect(parseTime("nope")).toBeNull();
    expect(parseTime("")).toBeNull();
  });
  it("round-trips with formatTime", () => {
    for (const s of [0, 7, 65, 3725]) expect(parseTime(formatTime(s))).toBe(s);
  });
});
