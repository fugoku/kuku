const version = "0.5.2";
const pubDate = "2026-05-13T06:36:18.000Z";
const signature =
  "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVUQ0tHMWVSVVIycEEwbjIrNWpJSVJ0cVFyMkZqSWNndmV4ZXAxc1ZoWXg0dlFEZGpTV2tOaVl0Rmc1SXZ3QWtEVUg5M1l2WUR1cnNrdmxRNVN2NDFaNVNrL0hmNzRac0F3PQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzc4NjU0MTc4CWZpbGU6S3VrdS5hcHAudGFyLmd6Cmo5ak1ETld3WjdERU1GODBFU01FV25salQvMkhiM1RDTEJObUZjMmZ0Y1BTZzczb3pUSG0wc0Z1Y2RKTFJmOFpxcm1HRGZTV1BIeDJ4L3E4SXZ2M0RRPT0K";

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
