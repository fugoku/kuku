import { describe, expect, it } from "vitest";

import { filterGraphState, type GraphState } from "./graph_types";

function graphState(): GraphState {
  return {
    nodes: [
      {
        id: "Knowledge/wiki/concepts/auth.md",
        name: "Auth",
        filePath: "Knowledge/wiki/concepts/auth.md",
        folder: "Knowledge/wiki/concepts",
        clusterIndex: 0,
        linkCount: 2,
        isOrphan: false,
      },
      {
        id: "Knowledge/memory/session.md",
        name: "Session",
        filePath: "Knowledge/memory/session.md",
        folder: "Knowledge/memory",
        clusterIndex: 1,
        linkCount: 1,
        isOrphan: false,
      },
      {
        id: "Projects/auth.md",
        name: "Project Auth",
        filePath: "Projects/auth.md",
        folder: "Projects",
        clusterIndex: 2,
        linkCount: 1,
        isOrphan: false,
      },
    ],
    links: [
      { source: "Knowledge/wiki/concepts/auth.md", target: "Knowledge/memory/session.md" },
      { source: "Knowledge/wiki/concepts/auth.md", target: "Projects/auth.md" },
    ],
    adjacencyMap: {
      "Knowledge/wiki/concepts/auth.md": ["Knowledge/memory/session.md", "Projects/auth.md"],
      "Knowledge/memory/session.md": ["Knowledge/wiki/concepts/auth.md"],
      "Projects/auth.md": ["Knowledge/wiki/concepts/auth.md"],
    },
    clusters: ["Knowledge/wiki/concepts", "Knowledge/memory", "Projects"],
    isIndexing: false,
    lastIndexedAt: 1,
    error: null,
  };
}

describe("filterGraphState", () => {
  it("keeps only matching nodes and recalculates the visible subgraph", () => {
    const filtered = filterGraphState(graphState(), (node) =>
      node.filePath.toLowerCase().startsWith("knowledge/"),
    );

    expect(filtered.nodes.map((node) => node.filePath)).toEqual([
      "Knowledge/wiki/concepts/auth.md",
      "Knowledge/memory/session.md",
    ]);
    expect(filtered.links).toEqual([
      { source: "Knowledge/wiki/concepts/auth.md", target: "Knowledge/memory/session.md" },
    ]);
    expect(filtered.adjacencyMap).toEqual({
      "Knowledge/wiki/concepts/auth.md": ["Knowledge/memory/session.md"],
      "Knowledge/memory/session.md": ["Knowledge/wiki/concepts/auth.md"],
    });
    expect(filtered.nodes.map((node) => [node.filePath, node.linkCount, node.isOrphan])).toEqual([
      ["Knowledge/wiki/concepts/auth.md", 1, false],
      ["Knowledge/memory/session.md", 1, false],
    ]);
    expect(filtered.clusters).toEqual(["Knowledge/memory", "Knowledge/wiki/concepts"]);
  });
});
