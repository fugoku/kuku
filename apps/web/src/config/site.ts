export const siteUrl = {
  development: "http://localhost:4321",
  production: "https://www.kuku.mom",
} as const;

export function getSiteUrl(): string {
  return process.env.NODE_ENV === "production" ? siteUrl.production : siteUrl.development;
}
