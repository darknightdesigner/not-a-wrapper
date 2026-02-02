#!/bin/bash
# Sync skills from .agents/skills/ to tool-specific directories
# Run from project root: ./.agents/skills/sync-agent-skills/scripts/sync-skills.sh

set -e

# Find project root (directory containing .agents/)
find_project_root() {
  local dir="$PWD"
  while [[ "$dir" != "/" ]]; do
    if [[ -d "$dir/.agents/skills" ]]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  echo "Error: Could not find .agents/skills/ directory" >&2
  exit 1
}

PROJECT_ROOT=$(find_project_root)
cd "$PROJECT_ROOT"

AGENTS_SKILLS=".agents/skills"
TOOL_DIRS=(".cursor/skills" ".claude/skills" ".codex/skills")

echo "🔄 Syncing skills from $AGENTS_SKILLS/"
echo ""

# Create tool directories if they don't exist
for tool_dir in "${TOOL_DIRS[@]}"; do
  mkdir -p "$tool_dir"
done

# Track changes
created=0
removed=0
skipped=0

# Create symlinks for each skill
for skill_path in "$AGENTS_SKILLS"/*/; do
  # Skip if no skills exist
  [[ -d "$skill_path" ]] || continue
  
  skill_name=$(basename "$skill_path")
  
  for tool_dir in "${TOOL_DIRS[@]}"; do
    link_path="$tool_dir/$skill_name"
    target="../../$AGENTS_SKILLS/$skill_name"
    
    if [[ -L "$link_path" ]]; then
      # Symlink exists, check if it points to the right place
      current_target=$(readlink "$link_path")
      if [[ "$current_target" == "$target" ]]; then
        skipped=$((skipped + 1))
        continue
      fi
      # Wrong target, remove and recreate
      rm "$link_path"
    elif [[ -e "$link_path" ]]; then
      # Something else exists (file/dir), remove it
      echo "⚠️  Removing non-symlink: $link_path"
      rm -rf "$link_path"
    fi
    
    ln -s "$target" "$link_path"
    echo "✅ Created: $link_path -> $target"
    created=$((created + 1))
  done
done

# Remove broken symlinks
for tool_dir in "${TOOL_DIRS[@]}"; do
  for link in "$tool_dir"/*; do
    [[ -L "$link" ]] || continue
    if [[ ! -e "$link" ]]; then
      echo "🗑️  Removed broken: $link"
      rm "$link"
      removed=$((removed + 1))
    fi
  done
done

echo ""
echo "Done! Created: $created, Removed: $removed, Unchanged: $skipped"
