# React 19 Lint Fixes Guide

This document guides AI agents through fixing React 19 / React Compiler lint issues in the vid0 codebase, organized into context-optimized phases.

## Background

After upgrading to `eslint-config-next@16`, new strict React 19 rules from the React Compiler team are enabled. These rules catch patterns that:
- Prevent React Compiler from optimizing components
- Can cause subtle bugs with component re-rendering
- May cause hydration mismatches in SSR

**Current Status:** Rules are set to `"warn"` in `eslint.config.mjs` to allow deployment while tracking issues.

**Goal:** Fix all 37 React-specific warnings to enable full React Compiler optimization.

---

## Issue Summary

| Rule | Count | Severity |
|------|-------|----------|
| `react-hooks/refs` | 18 | Medium |
| `react-hooks/set-state-in-effect` | 15 | Medium |
| `react-hooks/static-components` | 2 | Low |
| `react-hooks/preserve-manual-memoization` | 1 | Low |
| `react-hooks/purity` | 1 | Low |

---

## Phase Overview

| Phase | Focus Area | Issues | Files |
|-------|------------|--------|-------|
| 1 | Quick Wins | 2 | 2 |
| 2 | Motion Primitives | 5 | 5 |
| 3 | UI Components | 7 | 5 |
| 4 | Sidebar Components | 6 | 3 |
| 5 | Chat Components | 4 | 3 |
| 6 | App Components | 3 | 3 |
| 7 | Lib Providers | 3 | 2 |

**Verification after each phase:**
```bash
bun run lint 2>&1 | grep -E "react-hooks/(refs|set-state|static|purity|preserve)"
```

---

## Phase 1: Quick Wins (2 issues, 2 files)

**Context:** Simple, isolated fixes that don't require understanding complex patterns.

### 1.1 `react-hooks/purity` — `components/ui/sidebar.tsx` (Line 611)

**Rule:** Don't call impure functions like `Math.random()` during render — causes hydration mismatches.

**Current (bad):**
```tsx
const width = React.useMemo(() => {
  return `${Math.floor(Math.random() * 40) + 50}%`
}, [])
```

**Fix:** Use `useId()` for deterministic value:
```tsx
const id = useId()
const width = useMemo(() => {
  // Hash the ID to get a stable number
  const hash = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return `${(hash % 40) + 50}%`
}, [id])
```

### 1.2 `react-hooks/preserve-manual-memoization` — `app/components/chat-input/suggestions.tsx` (Line 94)

**Rule:** Manual `useMemo` dependencies should match what React Compiler infers.

**Current (bad):**
```tsx
const suggestionsList = useMemo(
  () => (/* JSX */),
  [
    handleSuggestionClick,
    activeCategoryData?.highlight,
    activeCategoryData?.items,
    activeCategoryData?.label,
  ]
)
```

**Fix:** Use the whole object as dependency:
```tsx
const suggestionsList = useMemo(
  () => (/* JSX */),
  [handleSuggestionClick, activeCategoryData]
)
```

---

## Phase 2: Motion Primitives (5 issues, 5 files)

**Context:** All files in `components/motion-primitives/`. Shared patterns for animation components.

### Pattern A: `set-state-in-effect` for prop sync

**Rule:** Don't call `setState` synchronously in `useEffect` body — causes extra re-renders.

**Fix Pattern:** Sync during render (React 19 pattern):
```tsx
const [localValue, setLocalValue] = useState(prop)
if (prop !== undefined && localValue !== prop) {
  setLocalValue(prop)
}
```

### 2.1 `animated-background.tsx` (Line 45)

**Current (bad):**
```tsx
useEffect(() => {
  if (defaultValue !== undefined) {
    setActiveId(defaultValue)
  }
}, [defaultValue])
```

**Fix:**
```tsx
const [activeId, setActiveId] = useState(defaultValue)
if (defaultValue !== undefined && activeId !== defaultValue) {
  setActiveId(defaultValue)
}
```

### 2.2 `morphing-dialog.tsx` (Lines 188, 233)

**Issue:** `setMounted(true)` in useEffect for hydration

**Current (bad):**
```tsx
useEffect(() => {
  setMounted(true)
  return () => setMounted(false)
}, [])
```

**Fix:** Use `useSyncExternalStore` for hydration-safe mounting:
```tsx
import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

function useHydrated() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// In component:
const mounted = useHydrated()
```

Or add eslint-disable as this is a known React pattern:
```tsx
// eslint-disable-next-line react-hooks/set-state-in-effect -- hydration pattern
useEffect(() => { setMounted(true) }, [])
```

### 2.3 `magnetic.tsx` (Line 81)

**Issue:** Analyze the specific setState call and either derive the value or move to event handler.

### 2.4 `toolbar-expandable.tsx` (Line 111)

**Issue:** Analyze the specific setState call and either derive the value or move to event handler.

### Pattern B: `static-components`

**Rule:** Don't create component definitions during render — causes remount every render.

### 2.5 `morphing-popover.tsx` (Line 127)

**Current (bad):**
```tsx
if (asChild && isValidElement(children)) {
  const MotionComponent = motion.create(children.type) // Created each render!
  return <MotionComponent {...props} />
}
```

**Fix:** Memoize the component creation:
```tsx
const MotionComponent = useMemo(
  () => motion.create(children.type as React.ComponentType),
  [children.type]
)
```

Or restructure to use motion directly:
```tsx
return (
  <motion.div layoutId={`popover-trigger-${context.uniqueId}`}>
    {cloneElement(children, childProps)}
  </motion.div>
)
```

---

## Phase 3: UI Components (7 issues, 5 files)

**Context:** All files in `components/ui/`. Similar patterns to motion-primitives.

### 3.1 `morphing-dialog.tsx` (Lines 188, 233)
**Same fix as Phase 2.2** — Use `useSyncExternalStore` or eslint-disable.

### 3.2 `morphing-popover.tsx` (Line 127)
**Same fix as Phase 2.5** — Memoize component creation.

### 3.3 `file-upload.tsx` (Line 171)
**Same fix as Phase 2.2** — `setMounted(true)` hydration pattern.

### 3.4 `image.tsx` (Line 41)

**Issue:** Creating object URL in effect and setting to state

**Current:**
```tsx
useEffect(() => {
  const url = URL.createObjectURL(blob)
  setObjectUrl(url)
  return () => URL.revokeObjectURL(url)
}, [data])
```

**Fix:** This is correct for cleanup. Add eslint-disable:
```tsx
useEffect(() => {
  const url = URL.createObjectURL(blob)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- cleanup required for URL.revokeObjectURL
  setObjectUrl(url)
  return () => URL.revokeObjectURL(url)
}, [data])
```

### 3.5 `reasoning.tsx` (Lines 62, 165)

**Issue 1 (Line 62):** `set-state-in-effect` — Analyze and fix per pattern.

**Issue 2 (Line 165):** `refs` — Using `contentRef.current?.scrollHeight` in style during render.

**Current (bad):**
```tsx
style={{ maxHeight: isOpen ? contentRef.current?.scrollHeight : "0px" }}
```

**Fix:** Use state for measured height:
```tsx
const [contentHeight, setContentHeight] = useState(0)

useLayoutEffect(() => {
  if (contentRef.current) {
    setContentHeight(contentRef.current.scrollHeight)
  }
}, [children]) // Re-measure when content changes

// In JSX
style={{ maxHeight: isOpen ? contentHeight : 0 }}
```

---

## Phase 4: Sidebar Components (6 issues, 3 files)

**Context:** All files in `app/components/layout/sidebar/`. Identical pattern across all three.

### Common Pattern: `refs` for prop sync

**Rule:** Don't read and write refs during render to sync external props.

**Current (bad) — in all 3 files:**
```tsx
if (!isEditing && lastChatTitleRef.current !== chat.title) {
  lastChatTitleRef.current = chat.title
  setEditTitle(chat.title || "")
}
```

**Fix:** Use useEffect for prop synchronization:
```tsx
useEffect(() => {
  if (!isEditing) {
    setEditTitle(chat.title || "")
  }
}, [chat.title, isEditing])
```

### 4.1 `project-chat-item.tsx` (Lines 28-29)
Apply the fix above.

### 4.2 `sidebar-item.tsx` (Lines 26-27)
Apply the fix above.

### 4.3 `sidebar-project-item.tsx` (Lines 36-37)
Apply the fix above.

---

## Phase 5: Chat Components (4 issues, 3 files)

**Context:** All files in `app/components/chat/`. Core chat functionality.

### 5.1 `chat.tsx` (Line 214)

**Issue:** `refs` — Using `hasSentFirstMessageRef.current` to conditionally redirect during render.

**Current (bad):**
```tsx
if (status === "ready" && messages.length === 0 && !hasSentFirstMessageRef.current) {
  return redirect("/")
}
```

**Fix:** Convert to state and move to useEffect:
```tsx
const [hasSentFirstMessage, setHasSentFirstMessage] = useState(false)

useEffect(() => {
  if (status === "ready" && messages.length === 0 && !hasSentFirstMessage) {
    router.push("/")
  }
}, [status, messages.length, hasSentFirstMessage, router])
```

### 5.2 `quote-button.tsx` (Line 23)

**Issue:** `refs` — Accessing `messageContainerRef.current?.getBoundingClientRect()` during render.

**Current (bad):**
```tsx
const containerRect = messageContainerRef.current?.getBoundingClientRect()
const position = containerRect ? { ... } : null
```

**Fix:** Use state + useLayoutEffect:
```tsx
const [containerRect, setContainerRect] = useState<DOMRect | null>(null)

useLayoutEffect(() => {
  if (messageContainerRef.current) {
    setContainerRect(messageContainerRef.current.getBoundingClientRect())
  }
}, [mousePosition]) // Re-measure when needed
```

### 5.3 `conversation.tsx` (Line 50)

**Issue:** `refs` — Passing ref to a map function that may read it during render.

**Fix:** Restructure to avoid passing refs through render callbacks, or use state.

---

## Phase 6: App Components (3 issues, 3 files)

**Context:** Remaining app components in various directories.

### 6.1 `app/components/history/command-history.tsx` (Line 355)

**Issue:** `refs` — Checking `hasPrefetchedRef.current` during render for prefetch logic.

**Current (bad):**
```tsx
if (isOpen && !hasPrefetchedRef.current) {
  // prefetch logic during render
}
```

**Fix:** Move to useEffect:
```tsx
useEffect(() => {
  if (isOpen && !hasPrefetchedRef.current) {
    hasPrefetchedRef.current = true
    const recentChats = chatHistory.slice(0, 10)
    recentChats.forEach((chat) => router.prefetch(`/c/${chat.id}`))
  }
}, [isOpen, chatHistory, router])
```

### 6.2 `app/components/multi-chat/multi-conversation.tsx` (Line 118)

**Issue:** `set-state-in-effect` — Analyze the specific setState call and fix per pattern.

### 6.3 `components/prompt-kit/file-upload.tsx` (Line 171)

**Issue:** `set-state-in-effect` — `setMounted(true)` hydration pattern.

**Fix:** Same as Phase 2.2 — Use `useSyncExternalStore` or eslint-disable.

---

## Phase 7: Lib Providers (3 issues, 2 files)

**Context:** State management providers in `lib/chat-store/`.

### Common Pattern: `set-state-in-effect` for external data sync

**Rule:** Don't sync external data to local state in useEffect.

**Fix Options:**

**Option A — Set state during render (React 19 pattern):**
```tsx
const [localChats, setLocalChats] = useState(chats)
if (chats.length > 0 && localChats !== chats) {
  setLocalChats(chats)
}
```

**Option B — Derive the value:**
```tsx
const displayChats = chats.length > 0 ? chats : localChats
```

### 7.1 `lib/chat-store/chats/provider.tsx` (Line 90)

**Current (bad):**
```tsx
useEffect(() => {
  if (chats.length > 0) {
    setLocalChats(chats)
  }
}, [chats])
```

Apply Option A or B above.

### 7.2 `lib/chat-store/messages/provider.tsx` (Lines 69, 76)

Same pattern — apply Option A or B.

---

## Verification & Completion

### After Each Phase
```bash
bun run lint 2>&1 | grep -c "react-hooks"
```

### Final Verification
```bash
bun run lint
bun run typecheck
```

**Target:** 0 warnings from `react-hooks/*` rules.

### Enable Strict Mode

Once all issues are resolved, update `eslint.config.mjs` to change rules from `"warn"` to `"error"`:

```js
// In eslint.config.mjs
"react-hooks/refs": "error",
"react-hooks/set-state-in-effect": "error",
"react-hooks/static-components": "error",
"react-hooks/purity": "error",
"react-hooks/preserve-manual-memoization": "error",
```

---

## Quick Reference: Fix Patterns

### Pattern: Ref During Render → State + useEffect
```tsx
// Bad: ref.current in render
const value = ref.current?.something

// Good: state + useLayoutEffect
const [value, setValue] = useState(null)
useLayoutEffect(() => {
  if (ref.current) setValue(ref.current.something)
}, [dependency])
```

### Pattern: Ref for Conditional → State
```tsx
// Bad: ref for conditional rendering
if (ref.current) return <A />

// Good: state for conditional rendering
const [flag, setFlag] = useState(false)
if (flag) return <A />
```

### Pattern: setState in useEffect → Render-time sync
```tsx
// Bad: sync in effect
useEffect(() => {
  setLocal(prop)
}, [prop])

// Good: sync during render
const [local, setLocal] = useState(prop)
if (local !== prop) setLocal(prop)
```

### Pattern: Mounted state → useSyncExternalStore
```tsx
// Bad: setMounted in effect
useEffect(() => { setMounted(true) }, [])

// Good: useSyncExternalStore
const mounted = useSyncExternalStore(
  () => () => {},
  () => true,
  () => false
)
```

### Pattern: Dynamic Component → Memoize
```tsx
// Bad: create component in render
const Comp = motion.create(type)

// Good: memoize creation
const Comp = useMemo(() => motion.create(type), [type])
```

---

## Resources

- [React Compiler Documentation](https://react.dev/learn/react-compiler)
- [Rules of React](https://react.dev/reference/rules)
- [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects)
