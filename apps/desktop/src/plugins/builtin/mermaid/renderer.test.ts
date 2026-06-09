import { describe, expect, it } from "vitest";

import { mermaidCodeBlockPreviewRenderer } from "./renderer";

describe("mermaid code block preview renderer", () => {
  it("matches mermaid code fence language aliases", () => {
    expect(mermaidCodeBlockPreviewRenderer.matches("mermaid")).toBe(true);
    expect(mermaidCodeBlockPreviewRenderer.matches("mmd")).toBe(true);
    expect(mermaidCodeBlockPreviewRenderer.matches("MERMAID")).toBe(true);
  });

  it("does not match unrelated code fence languages", () => {
    expect(mermaidCodeBlockPreviewRenderer.matches("typescript")).toBe(false);
    expect(mermaidCodeBlockPreviewRenderer.matches("")).toBe(false);
  });
});

