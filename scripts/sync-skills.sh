#!/bin/bash

# Sync skills from .agents/skills/ to tool-specific directories
# This keeps .agents/ as the single source of truth

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

SOURCE_DIR="$PROJECT_ROOT/.agents/skills"
CLAUDE_DIR="$PROJECT_ROOT/.claude/skills"
CURSOR_DIR="$PROJECT_ROOT/.cursor/skills"
CODEX_DIR="$PROJECT_ROOT/.codex/skills"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔄 Syncing skills from .agents/skills/"
echo ""

# Function to sync skills to a target directory
sync_to_target() {
    local target_dir="$1"
    local tool_name="$2"
    
    if [ -d "$target_dir" ] || [ "$3" == "--create" ]; then
        mkdir -p "$target_dir"
        
        # Copy each skill directory
        for skill_dir in "$SOURCE_DIR"/*/; do
            if [ -d "$skill_dir" ]; then
                skill_name=$(basename "$skill_dir")
                
                # Copy SKILL.md (required)
                if [ -f "$skill_dir/SKILL.md" ]; then
                    mkdir -p "$target_dir/$skill_name"
                    cp "$skill_dir/SKILL.md" "$target_dir/$skill_name/"
                    echo -e "${GREEN}✓${NC} Synced $skill_name to $tool_name"
                fi
                
                # Optionally copy references/ if exists
                if [ -d "$skill_dir/references" ]; then
                    cp -r "$skill_dir/references" "$target_dir/$skill_name/"
                fi
            fi
        done
    else
        echo -e "${YELLOW}⚠${NC} Skipping $tool_name (directory doesn't exist)"
    fi
}

# Sync to Claude Code
echo "📦 Syncing to .claude/skills/"
sync_to_target "$CLAUDE_DIR" "Claude Code" "--create"

# Sync to Cursor (if directory exists)
echo ""
echo "📦 Checking .cursor/skills/"
sync_to_target "$CURSOR_DIR" "Cursor"

# Sync to Codex (if directory exists)
echo ""
echo "📦 Checking .codex/skills/"
sync_to_target "$CODEX_DIR" "Codex"

echo ""
echo "✅ Skill sync complete!"
echo ""
echo "Source of truth: .agents/skills/"
echo "Edit skills in .agents/skills/ and run this script to sync."
