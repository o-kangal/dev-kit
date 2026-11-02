# dev-kit

The development system from [AnkyLock](https://github.com/o-kangal/AnkyLock), packaged so a new project starts with it on day one: an agent-ready plan (`AGENTS.md`, `SPEC.md`, `TASKS.md` and a `next-task` skill for [Claude Code](https://claude.com/claude-code)), tight Claude permissions, CI with secret scanning and CodeQL, Dependabot, branch rulesets, security docs, and optional modules for TypeScript, Rust and Cloudflare Pages.

It has two halves:

- **Templates and a renderer** (`modules/`, `bin/dev-kit.mjs`): plain files, one directory per module, rendered with a dependency-free Node script. It never overwrites a file, and it can tell a project which of its kit files have fallen behind.
- **A Claude Code skill** (`skills/dev-kit`): runs the renderer and does the parts that need judgement, such as choosing modules, filling in the project-specific sections from the code and the conversation, and merging kit updates into files the project has changed. It makes every choice together with you. It says what it found, explains the options and recommends one, and writes nothing until you have approved the plan.

## Install

```bash
git clone git@github.com:o-kangal/dev-kit.git ~/Coding/dev-kit
~/Coding/dev-kit/install.sh
```

`install.sh` links `~/.claude/skills/dev-kit` and `~/.claude/CLAUDE.md` (global preferences that hold in every project) into the clone. It moves any existing file there aside first. `git pull` updates both; `./install.sh --uninstall` removes the links.

## Use

In Claude Code, inside the project:

| Command | What it does |
|---|---|
| `/dev-kit init` (or "add the dev kit to this project") | Looks at the repository and walks you through the decisions: stack and modules, names and URLs, license, visibility. After you approve the plan it renders the templates, drafts the `TODO(dev-kit)` sections with you, and lists the GitHub and deploy steps for you to run. |
| `/dev-kit add <module>` / `remove <module>` | Changes the modules when the stack changes, for example from plain HTML to TypeScript, and merges the shared files (`ci.yml`, settings). |
| `/dev-kit update` | Summarizes the kit's changes since the project's version (`.dev-kit.json`), then merges them file by file, keeping the project's own changes. |
| `/dev-kit status` | Shows which kit files differ from the current templates. |

The renderer also works on its own:

```bash
node bin/dev-kit.mjs list
node bin/dev-kit.mjs init ../my-app --modules cloudflare-pages --var NAME=MyApp --var "DESCRIPTION=..." \
  --var REPO=o-kangal/my-app --var SITE_URL=https://my-app.example --var CF_PROJECT=my-app --dry-run
node bin/dev-kit.mjs init ../my-app --modules ts      # add a module later
node bin/dev-kit.mjs init ../my-app --remove ts       # drop one (files are reported, not deleted)
node bin/dev-kit.mjs check ../my-app --diff
```

## Modules

Modules come in layers that combine freely:

- **Language modules** (`ts`, `rust`) bring the checks for one language.
- **Deploy modules** (`cloudflare-pages`) publish a directory, whatever made it: plain HTML, a framework build, any language's output.
- **Frameworks** (React, Astro, …) are not modules. The framework's own scaffolder sets them up, and their rules go into project skills.

So a plain HTML site is `cloudflare-pages` alone, an Astro site is `ts` + `cloudflare-pages`, and a Rust/WASM site is `rust` + `cloudflare-pages`.

A module is added when a real project needs it, built from what that project needed. Templates nobody uses go stale without anyone noticing.

| Module | Adds |
|---|---|
| `core` (always) | `AGENTS.md`, `SPEC.md`, `TASKS.md`, `.claude/skills/next-task`, `.claude/settings.json`, CI with gitleaks, CodeQL, Dependabot for Actions, rulesets for `main` and `v*` tags, `docs/github-settings.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `README.md`, `.editorconfig`, `.gitignore`, `.gitleaks.toml` |
| `ts` | pnpm + strict TypeScript: `tsconfig.json`, `eslint.config.js`, `.npmrc`; CI job (typecheck, lint, test, build, audit); Dependabot for npm |
| `rust` | CI job (fmt, clippy, test, cargo deny); `deny.toml`; Dependabot for Cargo |
| `cloudflare-pages` | Deploy of `DIST_DIR` to Cloudflare Pages from CI after every check passes on `main`, with an optional `BUILD_COMMAND`; wrangler through `npx`, so no `package.json` is needed; a CI job that checks the published folder when there is no `ts`; a post-deploy check that the live page is exactly the built one; `docs/deploy.md` |

Files a project rewrites after setup (`AGENTS.md`, `SPEC.md`, `TASKS.md`, `README.md`, …) are listed as `owned` in their `module.json`. `check` skips them unless you pass `--all`.

## Writing templates

Every file under `modules/<name>/files/` lands at the same path in the project.

- `{{VAR}}` is replaced by a variable. Names are upper case, so GitHub's `${{ github.ref }}` is left alone. A module declares its variables in `module.json` (`description`, optional `default`). `DATE`, `YEAR`, `DEV_KIT_VERSION`, `CODEQL_LANGUAGES` and `ALLOWED_ACTIONS` are filled automatically from the enabled modules.
- `{{#ts}}` … `{{/ts}}` keeps lines only when `ts` is enabled, and `{{^ts}}` … `{{/ts}}` only when it isn't. With an upper-case name (`{{#BUILD_COMMAND}}`) the block depends on whether the variable is empty. A marker goes on its own line, or opens and closes within one line. Blocks nest.
- `settings.json` and `dependabot.yml` next to `module.json` are fragments. The renderer merges them into `.claude/settings.json` and `.github/dependabot.yml`.
- `module.json` also takes `requires`, `codeql` (CodeQL languages), `actions` (third-party actions to allow) and `owned`. A variable with `"default": ""` may stay empty. Use `requires` only when a module cannot work without another one, not because the first project that used it had both.

A new module is a new directory. Add a test case if it changes `ci.yml`, then run `node --test`.

## Releasing

1. `node scripts/refresh-pins.mjs --write` moves the action pins in `modules/` to the newest release of their major version. Dependabot doesn't look inside templates. Check the gitleaks and actionlint image pins and the wrangler version in `deploy.yml` by hand.
2. `node --test`, and actionlint over `node scripts/render-all.mjs rendered` (CI does both).
3. Bump `VERSION`, date the `CHANGELOG.md` section, commit, and tag `vX.Y.Z`.

## License

[MIT](LICENSE)
