import { describe, expect, it } from "vitest";

import {
  createDiffTabPath,
  getDiffEntry,
  getSourceFilePathFromDiffPath,
  isDiffTabPath,
  registerDiff,
  removeDiffEntry,
} from "~/stores/diff_store";

describe("diff store", () => {
  it("registers, overwrites, and removes diff entries by source path", () => {
    const firstPath = registerDiff("notes/a.md", "old", "new", { type: "doc", content: [] });
    const secondPath = registerDiff("notes/a.md", "older", "newer", {
      type: "doc",
      content: [
        { type: "diffBlock", attrs: { diffType: "modified" }, content: [{ type: "paragraph" }] },
      ],
    });

    expect(firstPath).toBe("diff://notes/a.md");
    expect(secondPath).toBe(firstPath);
    expect(getDiffEntry(firstPath)).toMatchObject({
      sourceFilePath: "notes/a.md",
      oldMarkdown: "older",
      newMarkdown: "newer",
    });

    removeDiffEntry(firstPath);
    expect(getDiffEntry(firstPath)).toBeUndefined();
  });

  it("exposes diff path helpers", () => {
    const diffPath = createDiffTabPath("notes/topic.md");

    expect(diffPath).toBe("diff://notes/topic.md");
    expect(isDiffTabPath(diffPath)).toBe(true);
    expect(isDiffTabPath("notes/topic.md")).toBe(false);
    expect(getSourceFilePathFromDiffPath(diffPath)).toBe("notes/topic.md");
    expect(getSourceFilePathFromDiffPath("notes/topic.md")).toBeNull();
  });
});
