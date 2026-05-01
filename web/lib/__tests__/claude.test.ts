import { describe, expect, it } from "vitest";
import { buildSystemPrompt, parseCitations } from "../claude";

const segs = [
  { start: 0, end: 5, text: "Hello." },
  { start: 65, end: 70, text: "Action items: ship by Friday." },
];

describe("buildSystemPrompt", () => {
  it("emits one HH:MM:SS line per segment", () => {
    const sys = buildSystemPrompt({ title: "Sync", segments: segs });
    expect(sys).toContain("[00:00:00] Hello.");
    expect(sys).toContain("[00:01:05] Action items: ship by Friday.");
  });
  it("includes a clear citation instruction", () => {
    const sys = buildSystemPrompt({ title: "Sync", segments: segs });
    expect(sys).toMatch(/cite.+\[HH:MM:SS\]/i);
  });
});

describe("parseCitations", () => {
  it("returns text segments and citations alternating", () => {
    const out = parseCitations("Look at [00:01:05] for details.");
    expect(out).toEqual([
      { type: "text", text: "Look at " },
      { type: "cite", seconds: 65, label: "00:01:05" },
      { type: "text", text: " for details." },
    ]);
  });
  it("handles HH:MM:SS and MM:SS", () => {
    const out = parseCitations("at [01:05] and [01:02:03]");
    expect(out.filter((p) => p.type === "cite")).toEqual([
      { type: "cite", seconds: 65, label: "01:05" },
      { type: "cite", seconds: 3723, label: "01:02:03" },
    ]);
  });
  it("ignores malformed brackets", () => {
    const out = parseCitations("[hi] or [99:99:99x]");
    expect(out.every((p) => p.type === "text")).toBe(true);
  });
});
