import type { MermaidConfig } from "mermaid";

const MERMAID_RENDERER_CACHE_VERSION = "mermaid-preview-renderer-v1";
const MERMAID_API_SIGNATURE = "mermaid-render-api-v1";
const MERMAID_WIDTH_BUCKET_SIZE = 128;
const MERMAID_HEIGHT_CACHE_LIMIT = 200;
const MERMAID_CONFIG_CACHE_LIMIT = 32;

type MermaidFontReadyCacheValue = Promise<void> | "ready";

interface MermaidRenderCacheKeyInput {
  configSignature: string;
  fontSignature: string;
  language: string;
  securitySignature: string;
  source: string;
  width: number;
}

interface MermaidRenderCacheKeyParts {
  configSignature: string;
  fontSignature: string;
  language: string;
  mermaidApiSignature: string;
  rendererCacheVersion: string;
  securitySignature: string;
  sourceHash: string;
  widthBucket: number;
}

interface MermaidRenderCacheKeyResult {
  key: string;
  parts: MermaidRenderCacheKeyParts;
}

interface MermaidHeightCacheEntry {
  height: number;
  updatedAt: number;
  widthBucket: number;
}

const heightCache = new Map<string, MermaidHeightCacheEntry>();
const configCache = new Map<string, MermaidConfig>();
let fontReadyCachesByDocument = new WeakMap<Document, Map<string, MermaidFontReadyCacheValue>>();

function createMermaidRenderCacheKey(
  input: MermaidRenderCacheKeyInput,
): MermaidRenderCacheKeyResult {
  const parts: MermaidRenderCacheKeyParts = {
    configSignature: input.configSignature,
    fontSignature: input.fontSignature,
    language: normalizeMermaidCacheLanguage(input.language),
    mermaidApiSignature: MERMAID_API_SIGNATURE,
    rendererCacheVersion: MERMAID_RENDERER_CACHE_VERSION,
    securitySignature: input.securitySignature,
    sourceHash: hashString(normalizeMermaidCacheSource(input.source)),
    widthBucket: getMermaidWidthBucket(input.width),
  };
  const key = [
    parts.rendererCacheVersion,
    parts.mermaidApiSignature,
    parts.language,
    parts.sourceHash,
    parts.configSignature,
    parts.securitySignature,
    parts.fontSignature,
    String(parts.widthBucket),
  ].join(":");

  return { key, parts };
}

function getMermaidWidthBucket(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return MERMAID_WIDTH_BUCKET_SIZE;
  return Math.max(
    MERMAID_WIDTH_BUCKET_SIZE,
    Math.round(width / MERMAID_WIDTH_BUCKET_SIZE) * MERMAID_WIDTH_BUCKET_SIZE,
  );
}

function readCachedMermaidHeight(key: string): number | null {
  const entry = heightCache.get(key);
  if (!entry) return null;
  heightCache.delete(key);
  heightCache.set(key, entry);
  return entry.height;
}

function writeCachedMermaidHeight(key: string, height: number, widthBucket: number): void {
  if (!Number.isFinite(height) || height <= 0) return;
  setLruEntry(heightCache, key, {
    height: Math.round(height),
    updatedAt: Date.now(),
    widthBucket,
  });
  pruneLruMap(heightCache, MERMAID_HEIGHT_CACHE_LIMIT);
}

function getCachedMermaidConfig(signature: string, build: () => MermaidConfig): MermaidConfig {
  const cached = configCache.get(signature);
  if (cached) {
    configCache.delete(signature);
    configCache.set(signature, cached);
    return cached;
  }

  const config = build();
  setLruEntry(configCache, signature, config);
  pruneLruMap(configCache, MERMAID_CONFIG_CACHE_LIMIT);
  return config;
}

function getCachedMermaidFontReady(
  doc: Document,
  fontSignature: string,
  load: () => Promise<void>,
): Promise<void> {
  let cache = fontReadyCachesByDocument.get(doc);
  if (!cache) {
    cache = new Map();
    fontReadyCachesByDocument.set(doc, cache);
  }

  const cached = cache.get(fontSignature);
  if (cached === "ready") return Promise.resolve();
  if (cached) return cached;

  const pending = load().then(
    () => {
      cache.set(fontSignature, "ready");
    },
    (error: unknown) => {
      cache.delete(fontSignature);
      throw error;
    },
  );
  cache.set(fontSignature, pending);
  return pending;
}

function clearMermaidPreviewRuntimeCache(): void {
  heightCache.clear();
  configCache.clear();
  fontReadyCachesByDocument = new WeakMap();
}

function hashStableValue(value: unknown): string {
  return hashString(stableStringify(value));
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}

function normalizeMermaidCacheLanguage(language: string): string {
  return language.trim().toLowerCase();
}

function normalizeMermaidCacheSource(source: string): string {
  return source.trim().replace(/\r\n?/g, "\n");
}

function setLruEntry<T>(map: Map<string, T>, key: string, value: T): void {
  if (map.has(key)) {
    map.delete(key);
  }
  map.set(key, value);
}

function pruneLruMap<T>(map: Map<string, T>, limit: number): void {
  while (map.size > limit) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) return;
    map.delete(oldestKey);
  }
}

function getMermaidRuntimeCacheCountsForTest(doc: Document): {
  config: number;
  fontReady: number;
  height: number;
} {
  return {
    config: configCache.size,
    fontReady: fontReadyCachesByDocument.get(doc)?.size ?? 0,
    height: heightCache.size,
  };
}

export {
  clearMermaidPreviewRuntimeCache,
  createMermaidRenderCacheKey,
  getCachedMermaidConfig,
  getCachedMermaidFontReady,
  getMermaidRuntimeCacheCountsForTest,
  getMermaidWidthBucket,
  hashStableValue,
  readCachedMermaidHeight,
  writeCachedMermaidHeight,
};
export type { MermaidRenderCacheKeyResult };
