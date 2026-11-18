# Security Policy

## Reporting a vulnerability

Please report vulnerabilities **privately**, through GitHub: on the repository's **Security** tab, choose **Report a vulnerability** ([private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)). Do not open a public issue or pull request for a vulnerability before it is fixed.

Include what you found, how to reproduce it, the version or commit, and the impact you see. You will get an acknowledgement within 7 days and a first assessment within 14 days. Once a fix is released, the advisory is published with credit to you, unless you prefer otherwise.

## Scope

The kit writes files into other people's repositories and Claude Code setups, so it counts as a vulnerability when:

- `install.sh` does more than it promises: it creates anything other than its two symbolic links, deletes or overwrites a file instead of moving it to `<name>.bak-<timestamp>`, downloads or runs code, needs root, or removes links that don't point into this kit.
- The renderer (`bin/dev-kit.mjs`) overwrites a file, or writes outside the target project.
- A template ships an insecure default into the projects it sets up. Examples: a workflow with broader `permissions` than it needs, a `pull_request_target` or other trigger that runs untrusted code with secrets, an action that isn't pinned to a commit SHA, Claude permissions in `settings.json` that allow destructive or exfiltrating commands without asking, or a `.gitignore` / gitleaks setup that lets secrets through.
- The `dev-kit` skill or `global/CLAUDE.md` tells Claude to change state outside the repository (GitHub settings, secrets, publishing) without the user's approval.

Out of scope: issues in GitHub Actions, Docker images or other tools the templates reference, without an effect on the kit (report those upstream), and missing hardening without a concrete attack.

## Supported versions

Only the latest release (and `main`) receives security fixes. Projects set up with an older version get the fixes through `/dev-kit update`.

## For maintainers

Checks that run on every change: the test suite (`node --test`), actionlint over the kit's own workflows and every rendered module combination, and gitleaks over the full history.
