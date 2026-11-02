#!/usr/bin/env bash
# Links the kit into Claude Code's user directory:
#   ~/.claude/skills/dev-kit -> <kit>/skills/dev-kit
#   ~/.claude/CLAUDE.md      -> <kit>/global/CLAUDE.md
# Existing files that aren't these links are moved aside to <name>.bak-<timestamp> first.
# Usage: ./install.sh [--uninstall]
set -euo pipefail

kit=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
claude=${CLAUDE_CONFIG_DIR:-$HOME/.claude}
links=("skills/dev-kit:$kit/skills/dev-kit" "CLAUDE.md:$kit/global/CLAUDE.md")

for entry in "${links[@]}"; do
  target="$claude/${entry%%:*}"
  source="${entry#*:}"
  if [ "${1:-}" = --uninstall ]; then
    if [ -L "$target" ] && [ "$(readlink "$target")" = "$source" ]; then
      rm "$target" && echo "removed  $target"
    fi
    continue
  fi
  if [ -L "$target" ] && [ "$(readlink "$target")" = "$source" ]; then
    echo "ok       $target"
    continue
  fi
  if [ -e "$target" ] || [ -L "$target" ]; then
    backup="$target.bak-$(date +%Y%m%d%H%M%S)"
    mv "$target" "$backup" && echo "moved    $target -> $backup"
  fi
  mkdir -p "$(dirname "$target")"
  ln -s "$source" "$target" && echo "linked   $target -> $source"
done
