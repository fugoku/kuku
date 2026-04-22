# Kuku

> [English README](README.md)

로컬 우선 마크다운 에디터와 셀프 호스팅 가능한 서버 및 인프라 코드.

- **데스크톱** — Tauri + SolidJS 로 만든 macOS 앱.
- **웹** — Astro 기반 kuku.mom (랜딩 · 인증 · 대시보드), Cloudflare Pages 에 배포
- **서버** — Go + Postgres. OAuth(Google / GitHub), 이메일 OTP, Gemini 기반 AI, 셀프 호스팅 친화

## 레포지토리 구조

```
apps/
  desktop/     Tauri 데스크톱 앱 (SolidJS 프론트 + Rust 백엔드)
  web/         Astro 마케팅 + 인증 사이트
  server/      Go API 서버 (Connect RPC)
crates/
  kuku-ai/       AI 모델 연동
  kuku-contract/ 프로토 정의된 RPC 계약 (Rust)
  kuku-indexer/  파일 인덱싱
packages/
  contract/    공유 프로토 계약 (gen/go + gen/ts)
infra/docker/
  local/       로컬 테스트 환경 (web + server + postgres + mailpit)
  preview/     테스트용 환경
  prod/        프로덕션 (외부 관리 DB, SES)
  server/      공용 서버 Dockerfile (distroless/static)
scripts/
  release.sh           프로덕션 릴리즈 빌드 + 번들 + 공증
  release-preview.sh   프리뷰 채널 빌드
```

## 라이선스

[MIT](LICENSE) © kuku-mom

## 기여

이슈와 PR 환영. 큰 변경은 먼저 이슈로 의논 부탁드립니다.
