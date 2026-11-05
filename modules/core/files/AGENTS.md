# AGENTS.md - Engineering Constraints & Agent Context

<!-- Created from dev-kit {{DEV_KIT_VERSION}}. Agents may not edit this file (.claude/settings.json); change it yourself. -->

## System & Architecture Overview
- **Product:** {{NAME}} — {{DESCRIPTION}}
- **Stack:** <!-- TODO(dev-kit): runtimes, frameworks, hosting; versions that matter. -->
- **Primary Language Invariant:** All source code, interfaces, comments, commit messages and error messages are written in **English (en-US)**.

---

## Directory Layout & Domain Boundaries

```
.
<!-- TODO(dev-kit): the tree, with one line per directory saying what lives there and what may not. -->
```

---

## Deterministic CLI Commands

Always run these commands from the repository root:

{{#ts}}
- **Install Dependencies:** `pnpm install --frozen-lockfile`
- **Development:** `pnpm dev`
- **Type Check:** `pnpm run typecheck`
- **Linter:** `pnpm run lint`
- **Tests:** `pnpm run test`
- **Production Build:** `pnpm run build`
{{/ts}}
{{#rust}}
- **Rust Format:** `cargo fmt --all --check`
- **Rust Lint:** `cargo clippy --workspace --all-targets -- -D warnings`
- **Rust Tests:** `cargo test --workspace`
- **Rust Dependency Policy:** `cargo deny check`
{{/rust}}
{{^ts}}
{{^rust}}
<!-- TODO(dev-kit): install, dev, lint, test and build commands. -->
{{/rust}}
{{/ts}}

---

## Architectural Invariants & Data Rules

<!-- TODO(dev-kit): the rules the code must never break, numbered, each concrete enough to test.
     SPEC.md holds the behaviour; this section holds what must stay true while it changes. -->

1. ...

---

## Hard Guardrails (Agent Prohibitions)

{{#ts}}
- **DO NOT** use TypeScript `any`. Use precise types, or `unknown` with type guards.
- **DO NOT** install dependencies with `pnpm add` (denied in `.claude/settings.json`). Write them into `package.json` by hand at an exact version (`npm view <pkg> version`), then run `pnpm install`.
{{/ts}}
{{#rust}}
- **DO NOT** install crates with `cargo add` (denied). Write them into `Cargo.toml` by hand at a current version (`cargo search <crate>`), under a license `deny.toml` allows.
{{/rust}}
- **DO NOT** pin a GitHub Action by tag. Pin it to a full commit SHA with the tag in a comment; Dependabot keeps the pins current.
- **DO NOT** add a third-party GitHub Action without telling the owner. GitHub blocks it until the owner lists it under `project.actions` in `.dev-kit.json` and applies `docs/github-settings.md`.
- **DO NOT** commit secrets, tokens or `.env` files. gitleaks runs on every push.
- **DO NOT** commit or link to `docs/private/`. It holds personal notes and stays git-ignored.
- **DO NOT** invent facts in content, docs or metadata (names, dates, numbers, links). Ask instead.
- **DO NOT** weaken a check to make it pass (skipped tests, `eslint-disable`, lowered CI thresholds) without saying so in the report.
<!-- TODO(dev-kit): project-specific prohibitions. -->

---

## Known Pitfalls

<!-- Things that cost time once, so they don't cost it again. The next-task skill reads this list
     before every task. Add an entry whenever a task hits a non-obvious problem. -->

- None yet.

---

## Agent Task Execution Protocol

Tasks come from `TASKS.md`, one at a time (the `next-task` skill runs this loop):

1. **Context Discovery:** Read the task's Read-Only Context Files and the SPEC.md sections it points to.
2. **Plan & Boundary Check:** List the files you'll touch; stay inside the task's Target Files; check the invariants above.
3. **Implementation:** Clean, minimal code. No dead code, no premature abstractions. Tests for the rules the task names.
4. **Verification:** Run the task's Verification commands, then the repo-wide checks above. Zero errors, zero new warnings.
5. **Report & Commit:** Mark the task completed in TASKS.md, report, propose a conventional commit message and wait for approval before committing and pushing.
