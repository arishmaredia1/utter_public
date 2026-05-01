import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tag } from "../Tag";

describe("Tag", () => {
  it("renders the default label for each kind", () => {
    render(<Tag kind="ready" />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });
  it("uses an override label when provided", () => {
    render(<Tag kind="uploading" label="Upload 64%" />);
    expect(screen.getByText("Upload 64%")).toBeInTheDocument();
  });
});
