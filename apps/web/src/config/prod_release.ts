const version = "0.4.0";
const pubDate = "2026-05-08T07:06:46.000Z";
const signature =
  "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVUQ0tHMWVSVVIycEFRcDVhaVhKS0hBZWV6K2U0MXRpM0RFNFJYSjFmbUpvWEhDSkVxY01CUlQrTVhUdWpGVmFzNUFtdUh5UHl2Ylo2Y1B1MVRPZm1aOFcwRFY2SExQRGdjPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzc4MjI0MDA1CWZpbGU6S3VrdS5hcHAudGFyLmd6Ckc4TnF4YkFNWS9RZEZiUGRLR3lVUnRPNExaVTVXMnZMV3V2cXBaUkhGYkpnUnBXbXptY0RUYXgzMWk3dXpML0xRelhZcy96UUxyWWhvOEFjMjdGaEJnPT0K";

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
