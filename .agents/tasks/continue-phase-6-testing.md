# Continue Phase 6: AI SDK v6 Upgrade Testing & Verification

## Context

We are implementing **Phase 6** of the AI SDK v6 upgrade plan at `.agents/plans/ai-sdk-v6-upgrade-execution.md`.

### Completed Work

1. **Typecheck passes** (0 errors) - All AI SDK v6 type issues resolved
2. **Lint passes** (0 errors, 1 warning about `<img>` element)
3. **Fixes applied this session:**
   - MCP imports updated: `@ai-sdk/mcp` package installed, imports changed from `experimental_createMCPClient` to `createMCPClient`
   - TanStack Query package reinstalled (was corrupted)
   - Implicit `any` type errors fixed in settings components
   - `@ai-sdk/perplexity` package reinstalled

### Current Blocker

The **build is failing** due to a corrupted `node_modules` directory. The Next.js package is missing required files:

```
File not found: "[project]/node_modules/next/dist/lib/default-transpiled-packages.json"
```

## Instructions

### Step 1: Fix node_modules corruption

Run a **complete clean reinstall**:

```bash
# Remove node_modules completely (may need sudo or manual deletion if stalls)
rm -rf node_modules bun.lock

# Reinstall all dependencies
bun install
```

If `rm -rf` stalls, try:
```bash
# Alternative: use find to delete
find . -maxdepth 1 -name "node_modules" -type d -exec rm -rf {} +

# Or manually delete via Finder/file manager
```

### Step 2: Verify Automated Tests

Once node_modules is fixed, run the verification suite:

```bash
bun run typecheck  # Should pass with 0 errors
bun run lint       # Should pass with 0 errors (1 warning OK)
bun run build      # Should complete successfully
```

### Step 3: Start Dev Server for Manual Testing

```bash
bun run dev
```

### Step 4: Manual Test Checklist

Per the Phase 6 plan, verify these scenarios:

| Test | Steps | Expected |
|------|-------|----------|
| **Basic Chat** | Send "Hello" | Streaming response appears |
| **Reasoning Display** | Use Claude model, check thinking | Reasoning shows in collapsible |
| **File Upload** | Attach image, send message | Image displays in message |
| **Edit Message** | Edit a previous user message | Message edits, regenerates response |
| **Regenerate** | Click regenerate on assistant message | New response streams |
| **Stop Generation** | Start long response, click stop | Generation stops cleanly |
| **Multi-Model** | Enable comparison mode | Multiple models respond |
| **Error Handling** | Use invalid API key | Error message displays |
| **Provider Switch** | Change from OpenAI to Claude | New model works |

### Step 5: Commit Checkpoint

If all tests pass:

```bash
git add -A
git commit -m "test: verify AI SDK v6 upgrade functionality

- Fixed MCP imports for v6 (@ai-sdk/mcp package)
- Fixed implicit any types in settings components
- Fixed TanStack Query package resolution
- All automated tests passing (typecheck, lint, build)"
```

## Key Files Modified This Session

| File | Change |
|------|--------|
| `lib/mcp/load-mcp-from-local.ts` | Updated MCP imports for v6 |
| `lib/mcp/load-mcp-from-url.ts` | Updated MCP imports for v6 |
| `app/components/layout/settings/apikeys/byok-section.tsx` | Fixed implicit any types |
| `app/components/layout/settings/connections/developer-tools.tsx` | Fixed implicit any type |
| `app/components/layout/settings/models/use-favorite-models.ts` | Fixed implicit any types |

## Reference

- Full plan: `.agents/plans/ai-sdk-v6-upgrade-execution.md`
- Research: `.agents/context/research/ai-sdk-upgrade-research.md`

## Success Criteria

All must pass before moving to Phase 7:

- [ ] `bun run typecheck` — Zero errors
- [ ] `bun run lint` — Zero errors  
- [ ] `bun run build` — Successful
- [ ] Basic chat streaming — Works
- [ ] Reasoning display — Works
- [ ] File attachments — Work
- [ ] Message editing — Works
- [ ] Regenerate — Works
