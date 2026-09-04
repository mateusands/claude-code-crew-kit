#!/usr/bin/env bash
#
# Installs this kit into a project: .claude/ gets the skills, subagents, commands,
# workflows and default permissions; the project root gets AGENTS.md, CLAUDE.md,
# START.md; .claude/ also receives the mcp/ servers.
#
# It also writes .claude/crewwatch-version, recording which version of the kit
# landed. That matters because the kit is meant to be SPECIALIZED in place
# (START.md Step 4) — once you have edited the skills for your project, the stamp
# is the only way to tell what you started from.
#
# 🔴 This is an installer, not a re-sync. It refuses to run over an existing
# install, because overwriting would destroy exactly the specialization that
# makes the kit worth anything. To adopt upstream changes, diff them against your
# stamped commit and port what you want, by hand.
#
# Usage:
#   ./install.sh                      # into the current directory
#   ./install.sh /path/to/project     # into an explicit target

set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_ROOT="${1:-$(pwd)}"

if [ ! -f "$SOURCE_DIR/START.md" ] || [ ! -d "$SOURCE_DIR/skills" ]; then
  echo "Error: $SOURCE_DIR does not look like a CrewWatch checkout (no START.md or skills/)." >&2
  exit 1
fi

if [ ! -d "$TARGET_ROOT" ]; then
  echo "Error: target $TARGET_ROOT does not exist." >&2
  exit 1
fi

DEST="$TARGET_ROOT/.claude"

if [ -d "$DEST/skills" ]; then
  echo "Error: $DEST/skills already exists — this kit is already installed here." >&2
  echo >&2
  echo "install.sh never overwrites: your skills have been specialized for this project," >&2
  echo "and that work is the point. To pick up upstream changes, compare them against the" >&2
  echo "commit you installed from and port what you want:" >&2
  echo >&2
  if [ -f "$DEST/crewwatch-version" ]; then
    echo "  $(grep '^commit=' "$DEST/crewwatch-version" || true)   # from $DEST/crewwatch-version" >&2
    echo "  git -C $SOURCE_DIR diff <that-commit>..HEAD" >&2
  else
    echo "  git -C $SOURCE_DIR log --oneline    # no version stamp found; pick your baseline" >&2
  fi
  exit 1
fi

mkdir -p "$DEST"
cp -r "$SOURCE_DIR/skills" "$SOURCE_DIR/agents" "$SOURCE_DIR/commands" "$SOURCE_DIR/workflows" "$DEST/"
cp "$SOURCE_DIR/settings.json" "$SOURCE_DIR/crew-info.md.template" "$DEST/"

# Root files: never clobber one the project already has.
copy_if_absent() {
  if [ -e "$2" ]; then
    echo "  kept existing $(basename "$2") (not overwritten)"
  else
    cp "$1" "$2"
  fi
}
mkdir -p "$TARGET_ROOT/.github"
copy_if_absent "$SOURCE_DIR/pull-request.md.template" "$TARGET_ROOT/.github/pull_request_template.md"
copy_if_absent "$SOURCE_DIR/.crew-kit-config.example" "$TARGET_ROOT/.crew-kit-config.example"

# The real .crew-kit-config says which agents THIS machine reaches and who is at the
# keyboard. Committed, it means two people fighting over one file every session. The
# entry is added here rather than left to the reader, because the cost of forgetting
# is a personal roster in someone else's history.
if [ -f "$TARGET_ROOT/.gitignore" ] && grep -qx '\.crew-kit-config' "$TARGET_ROOT/.gitignore"; then
  :
else
  printf '\n# Your roster and your models — never committed (see .crew-kit-config.example)\n.crew-kit-config\n' >> "$TARGET_ROOT/.gitignore"
  echo "  added .crew-kit-config to .gitignore"
fi
copy_if_absent "$SOURCE_DIR/AGENTS.md.template" "$TARGET_ROOT/AGENTS.md"
copy_if_absent "$SOURCE_DIR/CLAUDE.md.template" "$TARGET_ROOT/CLAUDE.md"
copy_if_absent "$SOURCE_DIR/START.md" "$TARGET_ROOT/START.md"

# 🔴 Under .claude/, not at the project root. Every .mcp.json example this kit ships
# already says `.claude/mcp/<server>/server.mjs`, and every relative link inside mcp/**
# points at ../agents, ../skills and ../workflows — which land in .claude/. Installed at
# the root those six links resolved to directories that do not exist there, and the
# agy-runner subagent became unreachable: someone ran the kit for a day without knowing
# it existed. The project root only ever needed .mcp.json itself.
if [ -e "$DEST/mcp" ]; then
  echo "  kept existing .claude/mcp/ (not overwritten)"
else
  cp -r "$SOURCE_DIR/mcp" "$DEST/mcp"
fi

# The MIT licence requires its notice to travel with copies or substantial portions,
# and an install copies most of this kit into another repository. Shipping the servers,
# the skills and the workflows while leaving the notice behind puts the person who
# installed it out of compliance through no fault of their own — the tool never gave
# them the file. It sits beside crewwatch-version because the two answer the same
# question: where this came from, and under what terms.
cp "$SOURCE_DIR/LICENSE" "$DEST/LICENSE-crewwatch"

VERSION="$(git -C "$SOURCE_DIR" describe --tags --always 2>/dev/null || echo unknown)"
COMMIT="$(git -C "$SOURCE_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
SOURCE_URL="$(git -C "$SOURCE_DIR" remote get-url origin 2>/dev/null || echo "$SOURCE_DIR")"
[ "$COMMIT" = unknown ] && echo "Warning: $SOURCE_DIR is not a git checkout — recording the version as unknown." >&2

{
  echo "source=$SOURCE_URL"
  echo "version=$VERSION"
  echo "commit=$COMMIT"
  echo "date=$(date -u +%Y-%m-%d)"
} > "$DEST/crewwatch-version"

echo "Installed the kit into $TARGET_ROOT ($VERSION, $COMMIT)."
echo
echo "The kit's MIT notice is at .claude/LICENSE-crewwatch. It covers the kit only, not your"
echo "project — keep it if you publish a repository that contains these files."
echo
echo "Copy .crew-kit-config.example to .crew-kit-config and fill in your roster — it is gitignored."
echo
echo "The MCP servers are at .claude/mcp/. Copy the .mcp.json you want to the project root and"
echo "point it at .claude/mcp/<server>/server.mjs — that is where the servers actually live."
echo
echo "Next: SECURITY.md.template is not installed by default — copy it yourself if this repo is public."
echo "Then, in the project, tell the agent:  \"Read START.md and follow it.\""
