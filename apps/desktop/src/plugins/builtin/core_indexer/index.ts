import { lazy } from "solid-js";

import type { KukuPlugin } from "~/plugins/types";

import { createSearchService, type SearchService } from "./service";
import { resetIndexerStatus, startStatusPolling } from "./status_store";

const IndexerSettingsView = lazy(() =>
  import("./indexer_settings").then((m) => ({ default: m.IndexerSettings })),
);

let searchServiceRef: SearchService | null = null;

const coreIndexerPlugin: KukuPlugin = {
  id: "core-indexer",
  name: "Core Indexer",
  version: "0.1.0",
  description: "Search indexing service and status tracking",

  views: [
    {
      id: "core-indexer.settings",
      label: "Indexer",
      location: { slot: "settingsSection" },
      order: 30,
      component: IndexerSettingsView,
    },
  ],

  commands: [
    {
      id: "core-indexer.rebuildIndex",
      label: "Rebuild Search Index",
      category: "Indexer",
      execute: () => {
        if (!searchServiceRef) return;
        void searchServiceRef.requestRebuild();
      },
    },
  ],

  activate(ctx) {
    const service = createSearchService();
    searchServiceRef = service;
    ctx.services.register("search", service);

    const stopPolling = startStatusPolling(service);
    ctx.track(stopPolling);

    ctx.events.on("vault:closed", () => {
      resetIndexerStatus();
    });

    ctx.track(() => {
      searchServiceRef = null;
    });
  },
};

export { coreIndexerPlugin };
