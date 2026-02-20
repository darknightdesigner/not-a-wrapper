# Google Gemini — Replay Invariants for Multi-Model Chat

> **Status**: Research Complete
> **Date**: February 13, 2026
> **Author**: AI Research Agent
> **Related**: `provider-aware-history-adaptation.md` (parent research), `app/api/chat/utils.ts`
> **Scope**: Gemini API function call pairing, thought/reasoning handling, role alternation, and @ai-sdk/google conversion behavior

---

## Sources Consulted

| Source | URL / Location |
|--------|----------------|
| Gemini API — Function Calling docs | https://ai.google.dev/gemini-api/docs/function-calling |
| Gemini API — Thinking docs | https://ai.google.dev/gemini-api/docs/thinking |
| Gemini API — Thought Signatures docs | https://ai.google.dev/gemini-api/docs/thought-signatures |
| Google AI Forum — Function call turn ordering error | https://discuss.ai.google.dev/t/46213 |
| gemini-cli #3814 — Function response parity error | https://github.com/google-gemini/gemini-cli/issues/3814 |
| gemini-cli #7410 — Function response count mismatch | https://github.com/google-gemini/gemini-cli/issues/7410 |
| gemini-cli #14183 — Function response after function call | https://github.com/google-gemini/gemini-cli/issues/14183 |
| vercel/ai #8450 — UNEXPECTED_TOOL_CALL on Vertex | https://github.com/vercel/ai/issues/8450 |
| vercel/ai #4412 — Tool calling broken with Gemini | https://github.com/vercel/ai/issues/4412 |
| @ai-sdk/google source — convert-to-google-generative-ai-messages.ts | https://github.com/vercel/ai/blob/main/packages/google/src/convert-to-google-generative-ai-messages.ts |
| @ai-sdk/google CHANGELOG.md | https://github.com/vercel/ai/blob/main/packages/google/CHANGELOG.md |

---

## 1. functionCall / functionResponse Pairing Rules

### Verdict: STRICT (not permissive)

The parent research document (`provider-aware-history-adaptation.md`) states Gemini is "permissive but penalizes missing tool results." **This is incorrect.** Gemini enforces **strict** validation on function call/response pairing and will reject requests with `400 INVALID_ARGUMENT` errors.

### Rule 1: Count Parity

The number of `functionResponse` parts in the response turn **must exactly equal** the number of `functionCall` parts in the preceding model turn.

**Error message:**
```
400 INVALID_ARGUMENT: "Please ensure that the number of function response parts
is equal to the number of function call parts of the function call turn."
```

**Implication:** You cannot send a `functionCall` without its matching `functionResponse`, and you cannot send extra `functionResponse` parts.

### Rule 2: Turn Ordering

Function call turns must come **immediately after** a user turn or a function response turn. Function response turns must come **immediately after** a function call turn.

**Error messages:**
```
400: "Please ensure that function call turns come immediately after a user turn
or after a function response turn."

400: "Please ensure that function response turn comes immediately after a
function call turn."
```

### Rule 3: Strict Role Alternation

The Gemini API enforces strict alternation between `user` and `model` roles. Consecutive turns with the same role trigger `400 INVALID_ARGUMENT` errors.

- Even-indexed content items (0, 2, 4, ...) must be `role: "user"`
- Odd-indexed content items (1, 3, 5, ...) must be `role: "model"`
- The API uses **index-based validation** in addition to explicit role values
- `functionResponse` parts are sent with `role: "user"` (not a separate "function" role)
- `functionCall` parts are in `role: "model"` turns

**Error message (when consecutive user messages are sent):**
```
400 INVALID_ARGUMENT (various messages about role ordering)
```

**Critical implication:** If our adapter strips all model content (e.g., removes tool-only assistant messages), it can create consecutive user turns, which Gemini will reject.

### Rule 4: Parallel Function Call Response Order

When the model returns parallel function calls (FC1 + FC2 in a single turn), the function responses must be sent together in one user turn, **not interleaved** with function calls.

**Correct:** `FC1, FC2` → `FR1, FR2` (all responses in one turn)
**Wrong:** `FC1, FR1, FC2, FR2` (interleaved — causes 400 error)

### Summary Table

| Scenario | Result |
|----------|--------|
| functionCall with matching functionResponse | Valid |
| functionCall WITHOUT functionResponse | **400 error** |
| functionResponse WITHOUT functionCall | **400 error** |
| More functionResponses than functionCalls | **400 error** |
| Fewer functionResponses than functionCalls | **400 error** |
| functionCall after model turn (no user/FR between) | **400 error** |
| Consecutive user turns | **400 error** |
| Consecutive model turns | **400 error** |

---

## 2. Thought / Reasoning Part Handling

### Key Insight: Gemini Has Native Thought Support

Unlike OpenAI (which rejects foreign reasoning parts) or Mistral/Perplexity (which have no reasoning support), Gemini has **native thought/reasoning support** via the `thought: true` flag on content parts.

### How Thoughts Work in Gemini

1. **Thought summaries**: Summarized versions of the model's internal reasoning, enabled via `includeThoughts: true` in the request config. Returned as parts with `thought: true`.

2. **Thought signatures**: Encrypted representations of the model's internal thought process. Used to maintain reasoning context across multi-turn conversations. Returned as `thoughtSignature` fields on content parts.

### Thought Signature Rules by Model Family

| Model | Signatures on functionCall | Signatures on text/other | Validation |
|-------|---------------------------|--------------------------|------------|
| **Gemini 3 Pro/Flash** | Always on first FC part | On last part if model thinks | **Mandatory** for FC in current turn — 400 error if missing |
| **Gemini 2.5 Pro** | On first part (any type) | On first part (any type) | **Optional** — no error if missing, but quality degrades |
| **Gemini 2.5 Flash** | On first part (any type) | On first part (any type) | **Optional** |
| **Gemini 2.0 Flash** | Not applicable (retiring March 2026) | N/A | N/A |

### Thought Signature Validation Scope

**Critical detail:** Gemini only validates thought signatures for the **current turn**, not previous turns. The API finds the most recent user message with standard content (not a `functionResponse`) and validates all model `functionCall` turns after it.

This means:
- Thought signatures from **previous conversation turns** are not validated
- You can safely strip thought signatures from older turns without causing errors
- Only the **active function-calling loop** needs valid signatures

### Dummy Signatures for Cross-Provider Transfer

Google provides two special dummy signature values for when you're transferring history from a different model that doesn't include thought signatures:

```
"context_engineering_is_the_way_to_go"
"skip_thought_signature_validator"
```

Either value can be used in the `thoughtSignature` field to skip validation when injecting function call parts that weren't generated by Gemini.

### Reasoning Parts from Other Providers

When replaying history where a **different provider** generated reasoning/thinking parts:
- The `@ai-sdk/google` provider converts `reasoning` type parts to `{ text: ..., thought: true }` — Gemini's native thought format
- This means reasoning from Anthropic or OpenAI models **can be preserved** in Gemini replay as thought parts
- However, these won't have valid `thoughtSignature` values, so they'll be treated as informational context, not as part of Gemini's internal reasoning chain

---

## 3. Model-Specific Differences

### Gemini 3 Series (Pro, Flash)

- **Thinking**: Always enabled. Cannot fully disable (Gemini 3 Flash has `minimal` level, but model may still think).
- **Thought signatures**: **Mandatory** for function calling. First FC part in each step must include its signature.
- **Thinking levels**: `minimal`, `low`, `medium` (Flash only), `high` (default, dynamic)
- **Error on missing signature**: `Function call <FC> in the <index> content block is missing a thought_signature`

### Gemini 2.5 Series (Pro, Flash, Flash-Lite)

- **Thinking**: Dynamic by default. Can be disabled on Flash (`thinkingBudget: 0`). Cannot be disabled on Pro.
- **Thought signatures**: Optional. Only returned when thinking is enabled and function calling is used.
- **Thinking budgets**: 0–24576 tokens (Flash), 128–32768 tokens (Pro)
- **No error on missing signature** — quality may degrade but no validation failure.

### Gemini 2.0 (Flash, Flash-Lite)

- **Status**: Retiring March 31, 2026. Migrate to 2.5 or 3.
- **No thinking support**.
- **Standard function call pairing rules** apply.

### Cross-Model Summary for Adapter Design

| Concern | Gemini 3 | Gemini 2.5 | Gemini 2.0 |
|---------|----------|------------|------------|
| Reasoning parts in history | Convert to `thought: true` | Convert to `thought: true` | Strip (no thought support) |
| Tool call pairing | Strict + signature required | Strict | Strict |
| Thought signatures from prior turns | Not validated | Not validated | N/A |
| Thought signatures in current FC turn | **Mandatory** | Optional | N/A |

---

## 4. @ai-sdk/google Conversion Behavior

### Source: `convert-to-google-generative-ai-messages.ts`

The `@ai-sdk/google` provider converts `LanguageModelV3Prompt` (the output of `convertToModelMessages()`) into Google's native format. Here is the exact conversion logic:

### Assistant Message Parts → `role: "model"`

| SDK Part Type | Gemini Output | Notes |
|---------------|---------------|-------|
| `text` | `{ text: string, thoughtSignature? }` | Empty text parts are **filtered out** |
| `reasoning` | `{ text: string, thought: true, thoughtSignature? }` | **Converted to native Gemini thought format** |
| `tool-call` | `{ functionCall: { name, args }, thoughtSignature? }` | Direct mapping |
| `file` | `{ inlineData: { mimeType, data }, thoughtSignature? }` | Only base64 data, not URLs |

### Tool Message → `role: "user"`

| SDK Part Type | Gemini Output | Notes |
|---------------|---------------|-------|
| `tool-result` (text) | `{ functionResponse: { name, response: { name, content } } }` | Standard mapping |
| `tool-result` (image) | `{ inlineData: ... } + { text: "Tool executed successfully..." }` | Multi-part |
| `tool-result` (denied) | `{ functionResponse: { name, response: { name, content: reason } } }` | Uses denial reason |

### Key Observations

1. **Reasoning parts are NOT stripped** — they are converted to Gemini's native `thought: true` format. This is a significant finding: `@ai-sdk/google` already handles cross-provider reasoning gracefully.

2. **thoughtSignature passthrough** — The SDK extracts `thoughtSignature` from `providerOptions.google` (or `providerOptions[providerOptionsName]`) and attaches it to every part. This is automatic when using the SDK's standard chat history management.

3. **No pairing validation** — The SDK does **not** validate that `functionCall` parts have matching `functionResponse` parts. It converts whatever it receives and sends it. The Gemini API then validates and rejects mismatches.

4. **Tool messages become `role: "user"`** — Tool results are wrapped in `functionResponse` parts with `role: "user"`. This satisfies Gemini's role alternation requirement (model turn with FC → user turn with FR).

5. **Empty text parts are dropped** — If a `text` part has `length === 0`, it becomes `undefined` and is filtered out. If ALL parts are empty, the model turn may have an empty parts array, which could cause issues.

---

## 5. Exact Error Messages for Violations

### Function Call Pairing Errors

```
400 INVALID_ARGUMENT:
"Please ensure that the number of function response parts is equal to the
number of function call parts of the function call turn."
```

```
400 INVALID_ARGUMENT:
"Please ensure that function call turns come immediately after a user turn
or after a function response turn."
```

```
400 INVALID_ARGUMENT:
"Please ensure that function response turn comes immediately after a
function call turn."
```

### Role Errors

```
400:
"Content with role 'user' can't contain 'functionResponse' part"
```
*(Note: This was a temporary inconsistency in Google's docs — they switched between `role: "function"` and `role: "user"` for functionResponse. As of Feb 2026, the SDK uses `role: "user"` for tool messages.)*

### Thought Signature Errors (Gemini 3 Only)

```
400:
"Function call <FunctionCallName> in the <N>. content block is missing a
thought_signature"
```

### UNEXPECTED_TOOL_CALL (via AI SDK)

```
finishReason: "UNEXPECTED_TOOL_CALL"
```
*(Occurs when Gemini returns a function call that doesn't match the provided tool declarations — usually a schema conversion issue in `@ai-sdk/google`, not a history replay issue.)*

---

## 6. Implications for Our Adapter Design

### Correction to Parent Research Document

The parent document's table (Section 2.1) describes Google Gemini as:
> "Permissive (thoughts are optional in replay) ... `functionCall` + `functionResponse` pairing is expected but not strictly enforced"

**This must be updated.** Gemini's function call pairing is **strictly enforced** with 400 errors. The only "permissive" aspect is thought signatures from previous turns (not the current turn).

### What the Google Adapter Should Do

#### Must Do

1. **Preserve functionCall + functionResponse pairs** — If both exist, keep both. If either is missing, **drop both** (the orphaned one will cause a 400).

2. **Maintain strict role alternation** — After filtering parts, verify that the message sequence alternates between user and model roles. If stripping tool parts creates consecutive same-role turns, merge or insert placeholder content.

3. **Handle orphaned tool calls** — If a `tool-invocation` part exists without a matching `tool-result`, drop the tool invocation (or synthesize a placeholder `functionResponse`).

4. **Handle orphaned tool results** — If a `tool-result` exists without a matching `tool-invocation`, drop it.

5. **Preserve count parity for parallel tool calls** — If a model turn has N function calls, the following user turn must have exactly N function responses. If any are missing, either synthesize placeholders or drop the entire tool exchange.

#### Should Do

6. **Preserve reasoning parts** — Unlike our current behavior (stripping all reasoning for non-Anthropic), Gemini can consume reasoning parts natively as `thought: true` text. The `@ai-sdk/google` SDK already converts `reasoning` parts to this format. **Preserving them improves response quality.**

7. **Preserve thought signatures when available** — If the history was generated by a Gemini model and contains `thoughtSignature` in `providerOptions.google`, ensure they pass through. The SDK handles this automatically.

8. **Use dummy signatures for cross-provider FC replay** — When replaying function call history from a non-Gemini provider into Gemini 3, and the function calls don't have thought signatures, inject `"skip_thought_signature_validator"` as the `thoughtSignature`. This prevents 400 errors on Gemini 3 models.

#### Can Skip

9. **Thought signature validation for old turns** — Gemini only validates signatures for the current turn (most recent user message with text → all FC steps after it). Historical turns don't need valid signatures.

10. **`step-start` parts** — These are SDK artifacts with no Gemini representation. Safe to strip.

11. **`source-url` parts** — No Gemini representation. Safe to strip (they aren't included in `convertToModelMessages` anyway).

### Proposed Adapter Logic (Pseudocode)

```typescript
function adaptForGoogle(messages: UIMessage[]): UIMessage[] {
  const adapted = messages
    // 1. Filter role: "tool" messages that have no matching tool-invocation
    //    (orphaned tool results)
    // 2. For each assistant message:
    //    a. Keep text parts (always)
    //    b. Keep reasoning parts (Gemini consumes them as thought: true)
    //    c. Keep tool-invocation parts ONLY if matching tool-result exists
    //    d. Strip step-start, source-url
    // 3. For each tool message:
    //    a. Keep ONLY if matching tool-invocation exists in prior assistant msg
    //    b. Ensure count parity (N calls = N responses)
    // 4. Verify role alternation: no consecutive user or model turns
    //    - If stripping created consecutive same-role, merge or insert placeholder
    // 5. For empty assistant messages after filtering, inject { text: "" } fallback

  return adapted
}
```

### Key Difference from Current Sanitization

| Aspect | Current (`sanitizeMessagesForProvider`) | Proposed Google Adapter |
|--------|----------------------------------------|------------------------|
| Reasoning parts | **Stripped** (treated same as all non-Anthropic) | **Preserved** (Gemini converts to native `thought: true`) |
| Tool invocations (paired) | **Stripped** | **Preserved** (if pair is complete) |
| Tool invocations (orphaned) | **Stripped** | **Stripped** (same, but targeted) |
| Tool results | **Stripped** (role: "tool" filtered) | **Preserved** (if pair is complete) |
| Role alternation check | **Not performed** | **Required** (Gemini is strict) |
| Thought signatures | **Not handled** | **Pass through / inject dummy for Gemini 3** |

### Expected Impact

- **Better response quality**: Preserving reasoning and tool context gives Gemini more information for follow-up turns
- **Fewer wasted tokens**: Only strip what's actually invalid, not everything
- **Prevention of silent failures**: Role alternation validation catches issues before they hit the API
- **Gemini 3 readiness**: Thought signature handling prepares us for Gemini 3 models' stricter requirements

---

## 7. Open Questions

1. **Does the AI SDK automatically inject dummy thought signatures when converting cross-provider history for Gemini 3?** — Needs empirical testing. If not, our adapter may need to inject `"skip_thought_signature_validator"` for tool-call parts in cross-provider replays to Gemini 3 models.

2. **How does `convertToModelMessages()` handle UIMessage tool parts that span separate messages?** — The SDK's conversion creates separate `tool` role messages. Need to verify this maintains correct ordering for Gemini's validation.

3. **Are there token cost differences between sending `thought: true` parts vs stripping them?** — Thought parts count as input tokens. For long conversations with extensive reasoning, this could increase costs. Need to assess the quality/cost tradeoff.

4. **Does Gemini accept `thought: true` parts that it didn't generate?** — The SDK converts foreign `reasoning` parts to `thought: true`, but does Gemini actually process them correctly, or does it ignore/reject them? Needs empirical testing.

---

*This research updates and corrects the Google Gemini section of the parent document. The Google adapter should be implemented with strict pairing validation and reasoning preservation, making it meaningfully different from the default strip-all adapter.*
