import { describe, expect, it } from "vitest"
import { parseChatTurnRequest } from "./chat-turn-contract"

const validBody = {
  messages: [
    { id: "u1", role: "user", parts: [{ type: "text", text: "hello" }] },
  ],
  chatId: "3f2c6c1e-8b0d-4a3f-9a6e-1c2b3d4e5f60",
  model: "test-model",
  systemPrompt: "system",
}

describe("parseChatTurnRequest", () => {
  it("accepts a valid turn request and returns it typed", async () => {
    const result = await parseChatTurnRequest({ ...validBody, chatVersion: 3 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.request.chatId).toBe("3f2c6c1e-8b0d-4a3f-9a6e-1c2b3d4e5f60")
    expect(result.request.model).toBe("test-model")
    expect(result.request.chatVersion).toBe(3)
  })

  it("rejects missing required fields with per-field details", async () => {
    await expect(
      parseChatTurnRequest({ messages: validBody.messages })
    ).resolves.toEqual({
      ok: false,
      status: 400,
      code: "INVALID_REQUEST",
      error: "Missing required fields",
      details: { messages: "ok", chatId: "required", model: "required" },
    })
    // A non-object body degrades to the same missing-fields rejection.
    const nonObject = await parseChatTurnRequest("nope")
    expect(nonObject).toMatchObject({ ok: false, status: 400 })
  })

  it("rejects malformed message envelopes before admission", async () => {
    for (const messages of [
      [{ id: "u1", role: "user" }],
      [{ id: "u1", role: "user", parts: null }],
      [{ id: "u1", role: "user", parts: [null] }],
    ]) {
      await expect(
        parseChatTurnRequest({ ...validBody, messages })
      ).resolves.toEqual({
        ok: false,
        status: 400,
        code: "INVALID_REQUEST",
        error: "Messages are invalid",
      })
    }
  })

  it("rejects a turn carrying both edit and regeneration", async () => {
    const result = await parseChatTurnRequest({
      ...validBody,
      edit: {},
      regeneration: {},
    })
    expect(result).toMatchObject({
      ok: false,
      status: 400,
      code: "INVALID_REQUEST",
      error: "Regeneration cannot be combined with edit generation",
      // Flagged unexpected — a client-contract violation the route captures to
      // Sentry, unlike routine bad input which stays silent.
      unexpected: true,
    })
    // Routine bad input is NOT flagged unexpected.
    const missingFields = await parseChatTurnRequest({
      messages: validBody.messages,
    })
    expect(missingFields).not.toHaveProperty("unexpected")
  })

  it("keeps a valid reasoningEffort and drops unknown values (ADR-0026)", async () => {
    const valid = await parseChatTurnRequest({
      ...validBody,
      reasoningEffort: "high",
    })
    expect(valid).toMatchObject({ ok: true })
    expect(valid.ok && valid.request.reasoningEffort).toBe("high")

    // Unknown effort degrades to Default (routine bad input, never a 400).
    const invalid = await parseChatTurnRequest({
      ...validBody,
      reasoningEffort: "ultra",
    })
    expect(invalid).toMatchObject({ ok: true })
    expect(invalid.ok && invalid.request.reasoningEffort).toBeUndefined()
  })

  it("keeps a valid generation budget and rejects invalid spend limits", async () => {
    const valid = await parseChatTurnRequest({
      ...validBody,
      generationBudget: 16_384,
    })
    expect(valid.ok && valid.request.generationBudget).toBe(16_384)

    for (const generationBudget of [0, -1, 1.5, "16384", 2_000_001]) {
      const invalid = await parseChatTurnRequest({
        ...validBody,
        generationBudget,
      })
      expect(invalid).toEqual({
        ok: false,
        status: 400,
        code: "INVALID_GENERATION_BUDGET",
        error:
          "Generation budget must be a positive whole number within the supported range",
      })
    }
  })
})
