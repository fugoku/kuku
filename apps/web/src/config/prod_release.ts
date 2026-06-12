const version = "0.5.6";
const pubDate = "2026-06-12T10:23:05.000Z";
const signature =
  "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVUQ0tHMWVSVVIycE81QW9hU1NnblhXNlk1cDZCdnJ5OGk1bU8xa2hNUnZZa254STl1cU1NN2pScVFUeU1VUUJGNFVqTUxKOTdYTWNWZHc1U2VncHdQTHIrUXhVL21FRmdzPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzgxMjU5Nzg0CWZpbGU6S3VrdS5hcHAudGFyLmd6Cjh5UXFya1R1d0k3NnVnQ2RnTUhvWjdwa216UmJiZm5zc3JQM2NYNk1ROGsyS3c2WFM5Q05ZTHZrcnRTZmxIdG5TYlpXWnQ0TjVXYzV5VVE3LzN3SUR3PT0K";

const githubRepo = "kuku-mom/kuku";
const webUrl = "https://kuku.mom";
const siteUrl = "https://www.kuku.mom";
const apiBaseUrl = "https://api.kuku.mom";

function githubReleaseAssetUrl(assetName: string): string {
  return `https://github.com/${githubRepo}/releases/download/${version}/${assetName}`;
}

export const prodRelease = {
  version,
  pubDate,
  signature,
  githubRepo,
  webUrl,
  siteUrl,
  apiBaseUrl,
  notes: `Kuku ${version}`,
  assets: {
    macDmg: `Kuku_${version}_aarch64.dmg`,
    updaterTarGz: "Kuku.app.tar.gz",
  },
} as const;

export const prodReleaseLinks = {
  github: `https://github.com/${prodRelease.githubRepo}`,
  downloadMac: githubReleaseAssetUrl(prodRelease.assets.macDmg),
  updaterTarGz: githubReleaseAssetUrl(prodRelease.assets.updaterTarGz),
} as const;

export const prodReleaseManifest = {
  version: prodRelease.version,
  notes: prodRelease.notes,
  pub_date: prodRelease.pubDate,
  platforms: {
    "darwin-aarch64": {
      signature: prodRelease.signature,
      url: prodReleaseLinks.updaterTarGz,
    },
  },
} as const;
