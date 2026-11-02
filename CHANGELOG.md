# Changelog

All notable changes to the kit. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). Projects record the version they were set up with in `.dev-kit.json`; `/dev-kit update` reads this file from there.

## [0.1.0] - 2026-11-02

### Added

- `bin/dev-kit.mjs` with `list`, `init` (never overwrites, `--dry-run`, `--no-settings`) and `check` (`--diff`, `--all`).
- `core` module, extracted from AnkyLock: AGENTS.md, SPEC.md and TASKS.md templates, the `next-task` skill with commit approval, merged `.claude/settings.json`, CI with gitleaks, CodeQL, Dependabot, rulesets, `docs/github-settings.md`, SECURITY, CONTRIBUTING, CHANGELOG, README, `.editorconfig`, `.gitignore`.
- `ts` module: strict `tsconfig.json`, `eslint.config.js`, `.npmrc` with `save-exact`, CI job, Dependabot for npm.
- `rust` module: CI job (fmt, clippy, test, cargo deny), `deny.toml`, Dependabot for Cargo.
- `cloudflare-pages` module, independent of the language: deploy of `DIST_DIR` with an optional `BUILD_COMMAND` (main's newest commit only, after CI), wrangler through `npx`, a `site` CI job when there is no `ts`, `scripts/check-live.mjs`, `docs/deploy.md`.
- Blocks on variables (`{{#VAR}}`), variables that may stay empty, and `init --modules` / `--remove` to change a project's modules later.
- The `dev-kit` user skill (`init`, `add`, `remove`, `update`, `status`). It decides every choice together with the user and writes nothing before the plan is approved. Also `global/CLAUDE.md` and `install.sh`.
