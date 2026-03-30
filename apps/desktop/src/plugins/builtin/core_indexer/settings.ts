import { invoke } from "@tauri-apps/api/core";
import { createStore, unwrap } from "solid-js/store";

import type { SearchService } from "./service";
import type { IndexerConfig } from "./types";

const DEFAULT_INDEXER_CONFIG: IndexerConfig = {
  incrementalUpdates: true,
  reindexOnVaultOpen: true,
  resolutionPolicy: "closest-folder",
};

const [indexerConfig, setIndexerConfig] = createStore<IndexerConfig>({ ...DEFAULT_INDEXER_CONFIG });

async function loadIndexerConfig(service: SearchService): Promise<void> {
  try {
    const raw = await invoke<Record<string, unknown>>("plugin_get_settings", {
      pluginId: "core-indexer",
    });
    const merged = {
      ...DEFAULT_INDEXER_CONFIG,
      ...(typeof raw.incrementalUpdates === "boolean"
        ? { incrementalUpdates: raw.incrementalUpdates }
        : {}),
      ...(typeof raw.reindexOnVaultOpen === "boolean"
        ? { reindexOnVaultOpen: raw.reindexOnVaultOpen }
        : {}),
    } satisfies IndexerConfig;
    setIndexerConfig(merged);
    await service.setConfig(merged);
  } catch {
    setIndexerConfig({ ...DEFAULT_INDEXER_CONFIG });
    await service.setConfig({ ...DEFAULT_INDEXER_CONFIG });
  }
}

async function updateIndexerConfig<K extends keyof IndexerConfig>(
  service: SearchService,
  key: K,
  value: IndexerConfig[K],
): Promise<void> {
  setIndexerConfig(key, value);
  const next = unwrap(indexerConfig);
  await invoke("plugin_save_settings", {
    pluginId: "core-indexer",
    settings: next,
  });
  await service.setConfig(next);
}

export { DEFAULT_INDEXER_CONFIG, indexerConfig, loadIndexerConfig, updateIndexerConfig };
