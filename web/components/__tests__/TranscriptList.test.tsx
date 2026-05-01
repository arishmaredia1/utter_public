import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TranscriptList } from "../TranscriptList";

const segs = [
  { start: 0, end: 5, text: "Hello." },
  { start: 5, end: 10, text: "World." },
];

describe("TranscriptList", () => {
  it("highlights the active segment based on currentTime", () => {
    render(<TranscriptList segments={segs} currentTime={6} onSeek={() => {}} />);
    const active = screen.getByText("World.").closest("[data-seg]")!;
    expect(active).toHaveAttribute("data-active", "true");
  });
  it("calls onSeek with the segment start when a row is clicked", () => {
    const onSeek = vi.fn();
    render(<TranscriptList segments={segs} currentTime={0} onSeek={onSeek} />);
    fireEvent.click(screen.getByText("World."));
    expect(onSeek).toHaveBeenCalledWith(5);
  });
});
