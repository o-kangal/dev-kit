#!/usr/bin/env bash
# Installs the kit into Claude Code's user directory, after showing what it will do and asking:
#   ~/.claude/skills/dev-kit -> <kit>/skills/dev-kit
#   ~/.claude/CLAUDE.md      -> <kit>/global/CLAUDE.md
# Both are symbolic links, so `git pull` in the kit updates them. Nothing is copied, downloaded or
# run as root; a file already at a target is moved aside to <name>.bak-<timestamp>, never deleted.
#
# Usage: ./install.sh [--dry-run] [--yes] [--uninstall]
#   --dry-run    show the plan and change nothing
#   --yes        don't ask (for scripts; required when there is no terminal to answer in)
#   --uninstall  remove the links this script made (asks too)
set -euo pipefail

kit=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
claude=${CLAUDE_CONFIG_DIR:-$HOME/.claude}
version=$(cat "$kit/VERSION")

dry_run=false yes=false uninstall=false
for arg in "$@"; do
  case $arg in
    --dry-run) dry_run=true ;;
    --yes | -y) yes=true ;;
    --uninstall) uninstall=true ;;
    -h | --help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (see --help)" >&2; exit 2 ;;
  esac
done

# Colors only on a terminal, and never with NO_COLOR (https://no-color.org).
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  bold=$'\e[1m' dim=$'\e[2m' green=$'\e[32m' yellow=$'\e[33m' red=$'\e[31m' cyan=$'\e[36m' reset=$'\e[0m'
else
  bold='' dim='' green='' yellow='' red='' cyan='' reset=''
fi
ok="${green}✓${reset}" warn="${yellow}!${reset}" fail="${red}✗${reset}"
home() { echo "${1/#$HOME/\~}"; }
section() { printf '\n%s%s%s\n' "$bold" "$1" "$reset"; }

# What gets installed: target, source, and what it is for.
targets=("$claude/skills/dev-kit" "$claude/CLAUDE.md")
sources=("$kit/skills/dev-kit" "$kit/global/CLAUDE.md")
purposes=(
  "The /dev-kit skill: set up, extend and update projects together with you."
  "Global preferences, loaded in every Claude Code session (language, commit approval, pinned dependencies, ...)."
)

# The state of one target:
#   linked  already points into this kit
#   stale   a link from an earlier install: into another copy of the kit, or to the same place in
#           a kit that has moved (the link is broken); replaced without a backup, it holds nothing
#   taken   anything else (your own file or link); moved aside before linking
#   free    nothing there
state() {
  local target=$1 source=$2 suffix=${2#"$kit"/}
  if [ -L "$target" ]; then
    local points
    points=$(readlink "$target")
    if [ "$points" = "$source" ]; then echo linked; return; fi
    if [ "${points%/"$suffix"}" != "$points" ]; then
      local root=${points%/"$suffix"}
      if [ ! -e "$target" ] || [ -f "$root/bin/dev-kit.mjs" ]; then echo stale; return; fi
    fi
    echo taken
  elif [ -e "$target" ]; then echo taken
  else echo free; fi
}

if $uninstall; then mode=uninstaller; else mode=installer; fi
printf '\n%s┌──────────────────────────────────────────┐%s\n' "$cyan" "$reset"
printf '%s│%s  %s%-38s%s  %s│%s\n' "$cyan" "$reset" "$bold" "dev-kit $version $mode" "$reset" "$cyan" "$reset"
printf '%s└──────────────────────────────────────────┘%s\n' "$cyan" "$reset"

if ! $uninstall; then
  section "What this kit is"
  cat <<EOF
  A development system for Claude Code projects, ready on day one:
  an agent-ready plan (AGENTS.md, SPEC.md, TASKS.md and the next-task skill),
  Claude permissions, CI with secret scanning and CodeQL, Dependabot, rulesets,
  security docs, and modules for TypeScript, Rust and Cloudflare Pages.

  In a project, say ${bold}/dev-kit init${reset} (or "add the dev kit to this project").
  Claude looks at the repository, decides every choice with you, and writes
  nothing before you approve the plan.
EOF

  section "Requirements"
  missing=false
  if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ]; then
    echo "  $ok node $(node --version)"
  else
    echo "  $fail node 22 or newer ${dim}(the kit's renderer is a Node script)${reset}"; missing=true
  fi
  if command -v git >/dev/null; then echo "  $ok git $(git --version | cut -d' ' -f3)"; else echo "  $fail git"; missing=true; fi
  if command -v claude >/dev/null; then echo "  $ok claude ${dim}(Claude Code)${reset}"; else echo "  $warn claude not on PATH ${dim}(the links work once Claude Code is installed)${reset}"; fi
  if command -v gh >/dev/null; then echo "  $ok gh ${dim}(licenses, GitHub settings)${reset}"; else echo "  $warn gh missing ${dim}(optional: licenses and GitHub settings)${reset}"; fi
  if command -v docker >/dev/null || command -v podman >/dev/null; then echo "  $ok docker/podman ${dim}(actionlint checks)${reset}"; else echo "  $warn docker missing ${dim}(optional: actionlint checks are skipped)${reset}"; fi
  if $missing; then printf '\n  %s Install the missing requirements, then run this again.\n\n' "$fail"; exit 1; fi
fi

if $dry_run; then section "Plan ${dim}(dry run: nothing will change)${reset}"; else section "Plan"; fi
changes=0
for i in "${!targets[@]}"; do
  target=${targets[$i]} source=${sources[$i]}
  current=$(state "$target" "$source")
  printf '  %s%s%s\n' "$bold" "$(home "$target")" "$reset"
  if $uninstall; then
    if [ "$current" = linked ] || [ "$current" = stale ]; then
      echo "    ${yellow}remove${reset} the link to $(home "$(readlink "$target")")"; changes=$((changes + 1))
    else
      echo "    ${dim}nothing to do: not a link this kit made${reset}"
    fi
    continue
  fi
  echo "    ${dim}${purposes[$i]}${reset}"
  case $current in
    linked) echo "    $ok already linked to $(home "$source")" ;;
    free) echo "    ${green}link${reset} → $(home "$source")"; changes=$((changes + 1)) ;;
    stale)
      if [ -e "$target" ]; then why="another copy of the kit"; else why="a kit that is no longer there"; fi
      echo "    ${yellow}update${reset} an earlier install: it points to $why ($(home "$(readlink "$target")"))"
      echo "      → $(home "$source") ${dim}(no backup needed: it is only a link)${reset}"; changes=$((changes + 1)) ;;
    taken)
      echo "    $warn something is already there: ${yellow}move it aside${reset} to $(home "$target").bak-<timestamp>"
      echo "      then ${green}link${reset} → $(home "$source")"; changes=$((changes + 1)) ;;
  esac
done

if [ "$changes" = 0 ]; then printf '\n  %s Nothing to change.\n\n' "$ok"; exit 0; fi
if $dry_run; then printf '\n  %d change(s) planned. Run without --dry-run to apply them.\n\n' "$changes"; exit 0; fi

if ! $yes; then
  if [ ! -t 0 ]; then
    printf '\n  %s No terminal to answer in. Run this in a terminal, or pass --yes to apply without asking.\n\n' "$warn"
    exit 1
  fi
  printf '\n  %sApply %d change(s)?%s [y/N] ' "$bold" "$changes" "$reset"
  read -r answer
  case $answer in
    [yY] | [yY][eE][sS]) ;;
    *) printf '  Nothing changed.\n\n'; exit 0 ;;
  esac
fi

if $uninstall; then section "Uninstalling"; else section "Installing"; fi
for i in "${!targets[@]}"; do
  target=${targets[$i]} source=${sources[$i]}
  current=$(state "$target" "$source")
  if $uninstall; then
    if [ "$current" = linked ] || [ "$current" = stale ]; then rm "$target" && echo "  $ok removed $(home "$target")"; fi
    continue
  fi
  case $current in
    linked) echo "  $ok $(home "$target") ${dim}(unchanged)${reset}" ;;
    stale) ln -sfn "$source" "$target" && echo "  $ok updated $(home "$target") → $(home "$source")" ;;
    taken | free)
      if [ "$current" = taken ]; then
        backup="$target.bak-$(date +%Y%m%d%H%M%S)"
        mv "$target" "$backup" && echo "  $ok moved the old one to $(home "$backup")"
      fi
      mkdir -p "$(dirname "$target")"
      ln -s "$source" "$target" && echo "  $ok linked $(home "$target") → $(home "$source")"
      ;;
  esac
done

section "Done"
if $uninstall; then
  echo "  The kit is no longer linked. Backups (*.bak-*) stay where they are."
else
  cat <<EOF
  ${bold}Next${reset}
  • Start a new Claude Code session: the global preferences load at session start.
  • In a project, run ${bold}/dev-kit init${reset}.
  • Update the kit later with ${bold}git -C $(home "$kit") pull${reset}; the links follow it.
  • Undo with ${bold}$(home "$kit")/install.sh --uninstall${reset}.
EOF
fi
echo
