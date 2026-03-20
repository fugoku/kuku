import type { KukuPlugin } from "~/plugins/types";

import { createSearchService } from "./service";
import { resetIndexerStatus, startStatusPolling } from "./status_store";

const coreIndexerPlugin: KukuPlugin = {
  id: "core-indexer",
  name: "Core Indexer",
  version: "0.1.0",
  description: "Search indexing service and status tracking",

  activate(ctx) {
    const service = createSearchService();
    ctx.services.register("search", service);

    const stopPolling = startStatusPolling(service);
    ctx.track(stopPolling);

    ctx.events.on("vault:closed", () => {
      resetIndexerStatus();
    });
  },
};

export { coreIndexerPlugin };
