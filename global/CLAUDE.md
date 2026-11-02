# Global preferences

<!-- Managed in o-kangal/dev-kit (global/CLAUDE.md), linked to ~/.claude/CLAUDE.md by install.sh.
     Edit it there and commit, so every machine gets the change. Project rules live in each
     project's AGENTS.md; these are the ones that hold everywhere. -->

## Language
- Talk to me in Turkish, including headings, reports and questions, with correct Turkish characters.
- Everything that goes into a repository is English: code, comments, UI strings in source, commit messages, PR texts, docs. Don't translate identifiers or commands.

## Working rhythm
- Plans live in the project's `TASKS.md`; work through them with the `next-task` skill, one task per run. Don't start the next task unasked.
- After a task is verified: show the proposed conventional commit message and wait for my approval. Once approved, check `git status` / `git add -n .` for secrets and build output, commit, and push. Never commit mid-task or before approval.
- New repository, or one without `AGENTS.md` and `TASKS.md`: offer `/dev-kit init`. Project set up with an older kit (`.dev-kit.json`): mention `/dev-kit update` once.
- Things that change state outside the repository (GitHub settings, secrets, DNS, cloud dashboards, publishing): write the exact command and let me run it with `!`, unless I ask you to.

## Engineering defaults
- Dependencies at exact versions. Look the version up (`npm view <pkg> version`, `cargo search <crate>`) and write it into the manifest by hand instead of `pnpm add` / `cargo add`.
- GitHub Actions pinned to a full commit SHA with the tag in a comment; workflow `permissions` least-privilege.
- Strict TypeScript, no `any`.
- Never force-push, rewrite published history, skip hooks, or disable commit signing.
- Never invent facts in content (CVs, docs, metadata, changelogs). Ask when you don't know.
- Don't weaken a check to make it pass; if one must change, say so in the report.
