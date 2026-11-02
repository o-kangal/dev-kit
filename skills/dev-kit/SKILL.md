---
name: dev-kit
description: Set up a project with the dev-kit development system (AGENTS.md, SPEC.md, TASKS.md, the next-task skill, Claude permissions, CI with gitleaks and CodeQL, Dependabot, rulesets, security docs, optional TypeScript / Rust / Cloudflare Pages modules) together with the user, deciding every choice with them; add or remove modules later; or update a project to the newest kit. Use when the user says "/dev-kit", "add the dev kit to this project", "set up our workflow here", "bootstrap this project", "start a new project", "update the dev kit", or starts work in a repository without AGENTS.md and TASKS.md.
argument-hint: "init | add <module> | remove <module> | update | status"
---

# dev-kit

The kit lives in its own repository (o-kangal/dev-kit). This skill is a symlink into it, so find the kit's root first and use its script for every file it renders:

```bash
KIT=$(dirname "$(dirname "$(readlink -f ~/.claude/skills/dev-kit)")")
node "$KIT/bin/dev-kit.mjs" list
```

The script renders templates and never overwrites an existing file. Your part is everything that needs judgement, and **the user makes every choice with you**: you investigate, explain, recommend; they decide. Nothing is written to the project before they have approved the plan.

Mode: `$ARGUMENTS`. Without one, use `update` if the project has `.dev-kit.json`, else `init`. "Add the dev kit to this project" means `init`.

Before any mode, check the kit is current: `git -C "$KIT" fetch -q && git -C "$KIT" status -sb`. If it is behind, say so and offer `git -C "$KIT" pull --ff-only`.

## How to decide things with the user

These rules hold for every choice in this skill:

- **Say what you found first.** Each question starts from what you saw in the repository ("there is a `package.json` with Vite 5 and no tests"), so the user decides on facts, not on a form.
- **Explain each option in one or two lines**: what it adds, what it costs, what it rules out later. Mark your recommendation and give the reason that applies to *this* project. Recommendations are proposals; never pick silently, even when one answer seems obvious.
- **Small rounds, by topic**, at most four questions each (AskUserQuestion), in the order below. Later questions depend on earlier answers, so don't ask them all at once. A free-text answer, a "not sure" or a counter-question is normal: discuss it, then ask again.
- **Unknown is a valid answer.** If a decision isn't ripe (the framework of a rewrite, say), set up only what doesn't depend on it, record it as an Open Decision in TASKS.md, and tell the user how to add the rest later (`/dev-kit add <module>`).
- **Never invent facts.** Names, URLs, domains, dates, claims in docs: ask.
- Talk in the user's language; files are written in English.

## init

### 1. Investigate, then open the conversation

Find out what is already there, without changing anything:

- `git remote get-url origin`, `git log --oneline | head -20`, `git status`, `ls -a`, the README.
- Stack: `package.json` (dependencies, scripts, `packageManager`), lockfiles, `Cargo.toml`, other manifests (`pyproject.toml`, `go.mod`, …), plain HTML/CSS/JS, the build output directory.
- Deployment: Cloudflare (`wrangler.toml`, a Git integration mentioned in docs), workflows in `.github/`, a domain in the code or README.
- Existing `AGENTS.md`, `SPEC.md`, `TASKS.md`, `CLAUDE.md`, `.claude/`, `.github/`: the script keeps them; their content is merged in step 5.
- `node "$KIT/bin/dev-kit.mjs" list` for the modules and their variables.

Then give the user a short picture: what the project is today, what the kit would add, which files would be kept and merged, and the decisions ahead. Ask whether to continue.

### 2. Decide the stack and the modules

Explain the three layers, because this is where the choice usually goes wrong:

- **Language modules** (`ts`, `rust`) bring the checks for that language: types, lint, tests, dependency policy, a CI job.
- **Deploy modules** (`cloudflare-pages`) publish a directory and don't care how it was made: plain HTML, a framework build, any language's output. They take a build command and an output directory.
- **Frameworks** (React, Astro, Svelte, …) aren't kit modules. The project is scaffolded by the framework's own tool (`pnpm create vite`, `pnpm create astro`); its specific rules can become a project skill later. If the stack itself is still open (a rewrite in another framework or language), discuss it now, or leave it as an Open Decision and choose only the modules that hold either way.

Questions in this round: the modules (multi-select, with a recommendation built from step 1). If the modules a project needs don't exist in the kit (Python, Go, another host), say so, set up `core`, and offer to add the module to the kit afterwards ("Changing the kit itself").

### 3. Decide the details

Only what the chosen modules need, each with a proposed value from step 1:

- `NAME`, `DESCRIPTION`, `REPO`.
- For `cloudflare-pages`: `SITE_URL`, `CF_PROJECT`, `BUILD_COMMAND` (empty for files deployed as they are) and `DIST_DIR`. A site without a build needs its pages in their own folder, never the repository root, which would publish `.git` and the docs. If that means moving files, say so here.
- **License**: MIT (permissive), AGPL-3.0 (changes must stay open, also when run as a service), or none (all rights reserved). For a site or portfolio, also ask whether the content (texts, images, CV) stays all rights reserved while the code is MIT.
- **Visibility**: public (free rulesets, CodeQL, secret scanning; everything in history becomes visible, so check it for personal data first) or private.

### 4. Agree on the plan, then render

Show the plan in one message: modules, variables, license, the files that will be created, the ones that will be kept and how they will be merged, the files that will move. Ask for an explicit go-ahead. Then show the dry run and render, without permissions first, because they deny edits to `AGENTS.md`, which you fill next:

```bash
node "$KIT/bin/dev-kit.mjs" init . --modules <a,b> --var NAME=... --var "DESCRIPTION=..." --var REPO=... --dry-run
node "$KIT/bin/dev-kit.mjs" init . --modules <a,b> --var ... --no-settings
```

`init` records the modules and variables in `.dev-kit.json`; later runs read them from there.

### 5. Fill the project-specific parts, with the user

`grep -rn "TODO(dev-kit)" .` lists them. Draft each from the code, the existing docs and the conversation, show the draft, and adjust it with the user. Ask where you would otherwise guess.

- **AGENTS.md:** stack with versions, directory layout, the real commands (match `package.json` scripts), invariants and project guardrails. Ask the user which rules matter most to them; those are the invariants. Keep the Task Execution Protocol section.
- **SPEC.md:** purpose, scope, flows, numbered business rules. A short SPEC is fine for a small project; don't pad it.
- **TASKS.md:** an existing plan is converted to the kit's format (Status line, Type, Read-Only Context Files, Target Files, Step-by-Step Instructions, Verification, Dependency Graph) without changing its content or order; show the result. Otherwise draft the plan with the user. Decisions left open in steps 2–3 go under Open Decisions.
- Content from kept files (an old `CLAUDE.md`, a hand-written README) moves into the matching new section; say what moved where. Remove a project `CLAUDE.md` only with approval.
- **SECURITY.md:** the Scope section, what the project protects.
- **LICENSE:** `gh api licenses/<key> --jq .body`, with the year and name placeholders (`[year]`, `[fullname]`, …) replaced by the current year and git `user.name`; a `"license"` field in `package.json` if there is one.

### 6. Permissions and project skills

Explain what `.claude/settings.json` will allow and deny (from `"$KIT"/modules/*/settings.json`), in particular that `AGENTS.md` becomes read-only for agents. Ask whether the project needs other `Edit(...)` paths (source folders other than `src/**`, `tests/**`). Then render again to add it: `node "$KIT/bin/dev-kit.mjs" init .`.

Suggest domain skills for `.claude/skills/` where the project has rules the task text can't carry (for example an audit of its encryption code, or how to write a database migration); write them only if the user wants them now.

### 7. Verify

- `grep -rn "TODO(dev-kit)" .` → only the ones you reported as open.
- Workflows lint clean: `docker run --rm -v "$PWD:/repo" -w /repo docker.io/rhysd/actionlint:1.7.12 -color=false` (skip with a note if Docker is missing).
- `node "$KIT/bin/dev-kit.mjs" check .` → nothing differs or is missing.
- JSON files parse (`jq . .claude/settings.json`).

### 8. Report and hand over

Report: modules, files created and kept, what you filled, what is still open. Then the **user steps**, which you don't run because they change things outside the repository:

- the commands in `docs/github-settings.md` (run with `!`; the public-only ones after the repository is public);
- `docs/deploy.md` one-time setup when `cloudflare-pages` is enabled;
- SSH commit signing, if `git config commit.gpgsign` isn't `true`.

Propose one conventional commit (`chore: set up dev-kit <version>`) and wait for approval. If pushing to `main` deploys (an existing Git integration), say so before pushing.

## add / remove

For a project that already has `.dev-kit.json`, when the stack changes (moving from plain HTML to TypeScript, a Rust part, a new host):

1. Discuss the change as in steps 2–3 of init: what the module brings, which variables it needs, what it changes in shared files (`ci.yml`, `dependabot.yml`, `.claude/settings.json`).
2. `node "$KIT/bin/dev-kit.mjs" init . --modules <name> --var ... --dry-run`, then without `--dry-run` (or `--remove <name>`).
3. New files are created; shared files that change are **kept** and listed. Merge them with `check --diff`, keeping the project's own changes. After a removal, the script lists files only the removed module rendered; delete them only with the user's approval.
4. Update AGENTS.md commands with the user (agents can't edit it), verify as in init step 7, propose `chore: add <module> from dev-kit`.

## update

1. Read the kit's `CHANGELOG.md` from the project's version (`.dev-kit.json`) to the kit's `VERSION` and summarize what changed.
2. `node "$KIT/bin/dev-kit.mjs" check . --diff` shows every kit-managed file that differs from the new templates, and the missing ones.
3. For each difference: **template change** (take it), **project customization** (keep it), or both (merge by hand, keeping the project's additions). Go through the non-obvious ones with the user. Project-owned files (AGENTS.md, SPEC.md, TASKS.md, …) aren't compared; apply a structural change the CHANGELOG names to them by hand. Changes to `AGENTS.md` go to the user as a diff.
4. `node "$KIT/bin/dev-kit.mjs" init .` creates missing files and records the new kit version.
5. Verify as in init step 7, report, propose `chore: update dev-kit to <version>`, wait for approval.

## status

Run `check .` and report the project's kit version, the kit's version, and what differs. Change nothing.

## Changing the kit itself

When a project shows that a template is wrong or missing something general (a language or host the kit doesn't have yet), offer to fix it in the kit (`$KIT`), not only in the project. Build a new module from what the real project needed, not from guesses. Edit the templates, add a `CHANGELOG.md` entry, run `node --test` in the kit, and bump `VERSION` for a release. The kit follows the same commit approval rule.
