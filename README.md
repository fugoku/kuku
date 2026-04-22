# Kuku

> [한국어](README_ko.md)

A local-first markdown editor, with a self-hostable server and infrastructure code to run it.

- **Desktop** — macOS app built with Tauri + SolidJS.
- **Web** — Astro-based kuku.mom (landing · auth · dashboard), deployed on Cloudflare Pages.
- **Server** — Go + Postgres. OAuth (Google / GitHub), email OTP, Gemini-backed AI, self-hosting friendly.

## Repository layout

```
apps/
  desktop/     Tauri desktop app (SolidJS frontend + Rust backend)
  web/         Astro marketing + auth site
  server/      Go API server (Connect RPC)
crates/
  kuku-ai/       AI model integration
  kuku-contract/ Proto-defined RPC contract (Rust)
  kuku-indexer/  File indexing
packages/
  contract/    Shared proto contract (gen/go + gen/ts)
infra/docker/
  local/       Local test environment (web + server + postgres + mailpit)
  preview/     Pre-production staging
  prod/        Production (externally managed DB, SES)
  server/      Shared server Dockerfile (distroless/static)
scripts/
  release.sh           Production release build + bundle + notarization
  release-preview.sh   Preview channel build
```

## License

[MIT](LICENSE) © kuku-mom

## Contributing

Issues and PRs are welcome. For large changes, please open an issue to discuss first.

---

<sub>Translated from the Korean original with Claude Opus.</sub>
