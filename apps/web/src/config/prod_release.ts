const version = "0.5.3";
const pubDate = "2026-06-04T09:27:05.000Z";
const signature =
  "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVUQ0tHMWVSVVIycFBUbG5FTWRRR09OR0VWR3F3R08vZVV3UUlJQjFVbWNMeHFZY2x6bkU0bUsvWmlHNkUzWmFQVEtvQnRGRFpZRk5RRjNkdnZST01vZEhQNjBhTFU0ZncwPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzgwNTY1MjI0CWZpbGU6S3VrdS5hcHAudGFyLmd6Ci9jek8rVitMblBQWjVLU3BoeUk0c05jaGEwSCs1QWtNSkd2TGJTa0NNVGF2TU1lbCtHYjBhQzVTQ2J3dmduajlMN3E3YU5KMTZ3bmZYLzJBQW1PV0RnPT0K";

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
