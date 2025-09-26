# AGENTS.md

1. Install deps: `npm install` (app). Rust gate (not readable in sandbox) use `cargo build` in `finish-gate-server`.
2. Dev server: `npm run dev`; Build: `npm run build`; Preview: `npm run preview`.
3. Type check: `npm run check`; Lint: `npm run lint`; Format: `npm run format` (tabs, single quotes, width 100, no trailing commas).
4. Tests: No JS test framework configured; add `vitest` if needed. Rust: `cargo test` / `cargo test name` (assumed).
5. Run a single (future) vitest: `npx vitest run path/to/file.test.ts -t "case"`.
6. Imports: Node/Svelte/3rd party first, then internal `$lib/...`, then relative; keep groups separated by one blank line; no unused imports.
7. Use strict TypeScript; explicit return types for exported functions, endpoints, and reusable utilities; prefer `const` and narrow types.
8. Validation: Use `zod` schemas at API boundaries; never trust client input.
9. Error handling: Fail fast; wrap DB / external calls in try/catch; return proper HTTP status or `throw error(code, message)` from `@sveltejs/kit`.
10. Never silently swallow errors; log unexpected ones with minimal sensitive data.
11. Avoid `any`; prefer generics or `unknown` + refinement; enable incremental refactors preserving strict mode.
12. State: Use Svelte stores in `src/lib/stores`; keep derived/computed logic pure.
13. Naming: kebab-case for files/routes; PascalCase for components; camelCase for functions/variables; UPPER_SNAKE for constants/env vars.
14. Side effects only in entrypoints (`+server.ts`, `hooks`, `main.rs`); keep modules pure for testability.
15. Database access centralized (see `lib/server/db.ts`); do not duplicate query logic in routes.
16. Auth: Use `keycloak.ts` helpers; never embed raw tokens in logs.
17. Networking: Use `kcFetch` wrapper for authenticated requests; prefer async/await over promise chains.
18. Formatting/ESLint: Prettier is source of truth; do not override stylistic rules; disable lint rules only with justification.
19. Performance: Avoid unnecessary reactive `$:` blocks; memoize expensive derivations; batch DOM updates.
20. Add missing tests before complex refactors; update this file if build/lint/test scripts change.
