#!/usr/bin/env bash
# scripts/sync-payclaw-client.sh
#
# Syncs lib/payclaw.ts from the provisioning-agent repo.
#
# Local dev:   set PROVISIONING_REPO=/path/to/provisioning-agent
# Vercel/CI:   set GITHUB_TOKEN if the repo is private; otherwise clones publicly.
set -euo pipefail

DEST="lib/payclaw.ts"
GITHUB_URL="https://github.com/flowglad/provisioning-agent.git"
SRC_PATH="packages/cli/src/client.ts"

# ── Local dev: use on-disk repo if available ─────────────────────────────────
if [ -n "${PROVISIONING_REPO:-}" ] && [ -d "$PROVISIONING_REPO" ]; then
  echo "[sync-payclaw] Using local repo: $PROVISIONING_REPO"
  (cd "$PROVISIONING_REPO" && git pull origin main)
  cp "$PROVISIONING_REPO/$SRC_PATH" "$DEST"

  # ── Drift check ──────────────────────────────────────────────────────────────
  # Runs typecheck to verify local Zod schemas still match upstream types.
  # See lib/payclaw/__tests__/type-drift.test.ts for the assertions.
  if command -v bun >/dev/null 2>&1; then
    echo "[sync-payclaw] Running typecheck for drift detection..."
    if ! bun run typecheck 2>&1 | tail -20; then
      echo ""
      echo "[sync-payclaw] ⚠️  Typecheck failed — upstream types may have changed."
      echo "[sync-payclaw]    Review lib/payclaw/__tests__/type-drift.test.ts"
      echo "[sync-payclaw]    Update lib/payclaw/schemas.ts to match new upstream shapes."
    fi
  fi

  echo "[sync-payclaw] Done — $DEST updated from local repo"
  exit 0
fi

# ── Vercel / CI: clone a fresh shallow copy from GitHub ──────────────────────
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

CLONE_URL="$GITHUB_URL"
if [ -n "${GITHUB_TOKEN:-}" ]; then
  CLONE_URL="https://${GITHUB_TOKEN}@github.com/flowglad/provisioning-agent.git"
fi

echo "[sync-payclaw] Cloning provisioning-agent (shallow)..."
git clone --depth=1 --quiet "$CLONE_URL" "$TMP_DIR"

cp "$TMP_DIR/$SRC_PATH" "$DEST"

# ── Drift check ──────────────────────────────────────────────────────────────
# Runs typecheck to verify local Zod schemas still match upstream types.
# See lib/payclaw/__tests__/type-drift.test.ts for the assertions.
if command -v bun >/dev/null 2>&1; then
  echo "[sync-payclaw] Running typecheck for drift detection..."
  if ! bun run typecheck 2>&1 | tail -20; then
    echo ""
    echo "[sync-payclaw] ⚠️  Typecheck failed — upstream types may have changed."
    echo "[sync-payclaw]    Review lib/payclaw/__tests__/type-drift.test.ts"
    echo "[sync-payclaw]    Update lib/payclaw/schemas.ts to match new upstream shapes."
  fi
fi

echo "[sync-payclaw] Done — $DEST updated from GitHub ($(git -C "$TMP_DIR" rev-parse --short HEAD))"
