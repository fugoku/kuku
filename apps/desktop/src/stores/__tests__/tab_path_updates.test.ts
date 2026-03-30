import { describe, expect, it } from "vitest";

import { getTabIdsForDeletedPath, renameTabsForMovedPathInList } from "~/stores/tab_path_updates";

describe("tab path updates", () => {
  it("renames editor and diff tabs for file and folder moves", () => {
    const renamedFileTabs = renameTabsForMovedPathInList(
      [
        { id: "editor", type: "editor", filePath: "notes/a.md", fileName: "a.md" },
        { id: "diff", type: "diff", filePath: "diff://notes/a.md", fileName: "Diff: a.md" },
      ],
      "notes/a.md",
      "notes/b.md",
      false,
    );

    expect(renamedFileTabs).toEqual([
      { id: "editor", type: "editor", filePath: "notes/b.md", fileName: "b.md" },
      { id: "diff", type: "diff", filePath: "diff://notes/b.md", fileName: "Diff: b.md" },
    ]);

    const renamedFolderTabs = renameTabsForMovedPathInList(
      [
        { id: "editor", type: "editor", filePath: "notes/archive/a.md", fileName: "a.md" },
        {
          id: "diff",
          type: "diff",
          filePath: "diff://notes/archive/b.md",
          fileName: "Diff: b.md",
        },
      ],
      "notes/archive",
      "notes/renamed",
      true,
    );

    expect(renamedFolderTabs).toEqual([
      { id: "editor", type: "editor", filePath: "notes/renamed/a.md", fileName: "a.md" },
      {
        id: "diff",
        type: "diff",
        filePath: "diff://notes/renamed/b.md",
        fileName: "Diff: b.md",
      },
    ]);
  });

  it("collects editor and diff tabs affected by file and folder deletion", () => {
    const tabs = [
      { id: "editor", type: "editor", filePath: "notes/archive/a.md", fileName: "a.md" },
      { id: "diff", type: "diff", filePath: "diff://notes/archive/b.md", fileName: "Diff: b.md" },
      { id: "graph", type: "graph", filePath: null, fileName: "Graph" },
    ];

    expect(getTabIdsForDeletedPath(tabs, "notes/archive/a.md", false)).toEqual(["editor"]);
    expect(getTabIdsForDeletedPath(tabs, "notes/archive", true)).toEqual(["editor", "diff"]);
  });
});
