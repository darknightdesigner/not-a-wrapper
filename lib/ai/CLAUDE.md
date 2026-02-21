# AI Module — Claude Context

This directory contains AI-related utilities implementing Anthropic's best practices for context management and sub-agent architecture.

> See `@AGENTS.md` for universal guidelines.
> See `@.agents/context/ai-context-engineering-guide.md` for implementation rationale.

## Structure

```
lib/ai/
├── context-management.ts  # Token estimation, compaction, notes
├── sub-agents/
│   ├── types.ts          # Type definitions for all agents
│   ├── orchestrator.ts   # Main orchestration logic
│   └── index.ts          # Exports and placeholder agents
└── index.ts              # Central export point
```

## Context Management

Implements Anthropic's strategies to prevent context rot:

### Token Estimation

```typescript
import { estimateTokens, estimateMessageTokens } from '@/lib/ai'

// Simple text estimation
const tokens = estimateTokens("Hello, world!") // ~3 tokens

// Full message breakdown
const estimate = estimateMessageTokens(messages)
// { total: 5000, byRole: { user: 2000, assistant: 3000, ... } }
```

### Context Compaction

```typescript
import { shouldCompact, compactContext } from '@/lib/ai'

// Check if compaction needed
if (shouldCompact(messages, 100_000)) {
  const { messages: compacted, result } = await compactContext(messages)
  console.log(`Saved ${result.tokensSaved} tokens`)
}
```

### Structured Notes

```typescript
import { formatNote, type StructuredNote } from '@/lib/ai'

const note: StructuredNote = {
  timestamp: new Date().toISOString(),
  category: 'decision',
  content: 'Using Convex for RAG instead of custom vector store'
}

// Formats for NOTES.md
const formatted = formatNote(note)
// "- ✅ **2026-01-14** [decision]: Using Convex for RAG..."
```

## Sub-Agent Architecture

Multi-agent system for specialized task handling:

```
┌─────────────────────────────────────────────────────────────┐
│                    MAIN ORCHESTRATOR                         │
│            (Primary Chat Agent - Claude Opus 4.5)           │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┬─────────────┐
        ▼             ▼             ▼             ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│     CODE      │ │   WRITING     │ │   RESEARCH    │ │     DATA      │
│   ASSISTANT   │ │    EDITOR     │ │   ANALYST     │ │   ANALYST     │
│  (Haiku 4.5)  │ │ (Sonnet 4.5)  │ │ (Sonnet 4.5)  │ │ (Sonnet 4.5)  │
└───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘
```

### Task Classification

```typescript
import { classifyTask } from '@/lib/ai'

const result = classifyTask("Help me debug this React component")
// { type: 'code-assistant', confidence: 0.8, parameters: {} }
```

### Orchestrator Usage

```typescript
import { createOrchestrator } from '@/lib/ai'

const orchestrator = createOrchestrator()
const result = await orchestrator.process({
  userRequest: "Help me write documentation for this function"
})
```

## API Beta Headers

Enable extended features with Anthropic's beta headers:

```typescript
import { createContextManagementHeaders } from '@/lib/ai'

const headers = createContextManagementHeaders({
  contextManagement: true,   // context-management-2025-06-27
  tokenEfficient: true,      // token-efficient-tools-2025-02-19
  extendedContext: true,     // context-1m-2025-08-07 (requires tier 4)
})
```

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Token estimation | ✅ Implemented | Character-based approximation |
| Compaction logic | ✅ Implemented | Placeholder summarization |
| Structured notes | ✅ Implemented | Format helpers only |
| Task classification | ✅ Implemented | Keyword-based (upgrade to LLM later) |
| Orchestrator | 🟡 Placeholder | Implement after Convex migration |
| Sub-agents | 🟡 Placeholder | Implement after Convex migration |
| Actual LLM calls | ❌ TODO | Requires Convex integration |

## Migration Notes

After Convex migration:

1. Replace placeholder summarization with Claude Haiku call
2. Implement actual sub-agent API calls
3. Store summaries/notes in Convex for retrieval
4. Add streaming support for real-time responses
5. Enable vector search for context retrieval

## References

- `.agents/context/ai-context-engineering-guide.md` — Context management best practices
- `.agents/research/tech-stack-evaluation.md` — Sub-agent architecture research
- `AGENTS.md` — Universal agent guidelines
