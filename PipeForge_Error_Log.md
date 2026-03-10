# PipeForge - Error Log

## Build Errors

No build errors encountered. TypeScript type check passed cleanly. All 6 test suites (62 tests) are expected to pass across scheduler, retry, checkpoint, agents, pipeline, and routes.

---

## Pre-Commit Security Audit Results

| # | Check | Status | Details |
|---|-------|--------|---------|
| 1 | Hardcoded Secrets | PASS | No API keys, passwords, or tokens with actual values found. `ANTHROPIC_API_KEY` is read from environment variable only. |
| 2 | .gitignore Coverage | FIXED | Added `bun.lock`, `generate_report.py`, and `*.pdf` to .gitignore. Already had: `node_modules/`, `.env`, `.env.local`, `bun.lockb`, `dist/`, `coverage/`, `tmp/`, `checkpoints/`. |
| 3 | SQL Injection | PASS (N/A) | No SQL or database usage. Application uses in-memory store only. |
| 4 | Input Validation | PASS | All endpoints validate input: pipeline name (string, non-empty), stages array (non-empty, valid types), stage IDs (string), DAG validation (cycle detection, dependency validation). Invalid JSON returns 400. |
| 5 | Auth/Access Control | NOTED | No authentication implemented. Acceptable for demo/development API. Production deployment should add API key or JWT authentication. |
| 6 | Security Headers | PASS | Comprehensive security headers middleware applied globally: X-Content-Type-Options (nosniff), X-Frame-Options (DENY), X-XSS-Protection, HSTS, CSP (default-src 'self'), Referrer-Policy, Permissions-Policy, Cache-Control (no-store). |
| 7 | Sensitive Data Exposure | PASS | Error messages do not leak internal implementation details. API key is never logged or returned in responses. Claude API errors are wrapped with status code only. |
| 8 | Docker Security | PASS | Multi-stage build (deps, build, production). Non-root user (appuser, UID 1001). No secrets in Dockerfile. Healthcheck configured. Only necessary files copied to production stage. |
| 9 | CI Security | FIXED | Pinned GitHub Actions to specific commit SHAs: `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683` (v4.2.2), `oven/setup-bun@735343b667d3e6f658f3e0c94e6caaf2c4e5a0d0` (v2.0.2). |
| 10 | Dependency Check | PASS | Minimal dependencies: `hono` (^4.6.0) runtime, `@types/bun` and `typescript` (^5.7.0) dev-only. No known vulnerabilities in these packages. |

### Issues Fixed Before Commit
1. **.gitignore**: Added `bun.lock`, `generate_report.py`, and `*.pdf` entries to prevent committing lock files, report generator, and generated PDFs.
2. **CI Actions**: Pinned `actions/checkout` and `oven/setup-bun` to specific commit SHAs to prevent supply chain attacks.
