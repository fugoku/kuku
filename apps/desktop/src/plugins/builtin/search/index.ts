import { lazy } from "solid-js";

import { openTab } from "~/stores/files";
import type { KukuPlugin } from "~/plugins/types";

import { isSearchOmnibarOpen, openSearchOmnibar } from "./omnibar_state";
import { setSearchService } from "./runtime";
import type { SearchService } from "../core_indexer/service";

const SearchTabView = lazy(() => import("./search_tab"));
const SearchOmnibarView = lazy(() => import("./omnibar"));

const searchPlugin: KukuPlugin = {
  id: "search",
  name: "Search",
  version: "0.1.0",
  description: "Vault search tab",
  dependencies: ["core-indexer"],

  views: [
    {
      id: "search.tab",
      label: "Search",
      location: { slot: "centerTab" },
      tabType: "search",
      component: SearchTabView,
    },
    {
      id: "search.omnibar",
      label: "Search Omnibar",
      location: { slot: "overlay" },
      component: SearchOmnibarView,
      isActive: () => isSearchOmnibarOpen(),
    },
  ],

  commands: [
    {
      id: "search.openOmnibar",
      label: "Quick Search",
      category: "Search",
      defaultKeys: ["$mod+KeyP"],
      global: true,
      execute: () => openSearchOmnibar(),
    },
    {
      id: "search.openAdvanced",
      label: "Search in Files",
      category: "Search",
      defaultKeys: ["$mod+Shift+KeyF"],
      global: true,
      execute: () => openTab("Search", null, "search"),
    },
  ],

  activate(ctx) {
    const service = ctx.services.get<SearchService>("core-indexer.search");
    if (!service) {
      throw new Error("core-indexer.search service not found");
    }

    setSearchService(service);
    ctx.track(() => setSearchService(null));
  },
};

export { searchPlugin };
