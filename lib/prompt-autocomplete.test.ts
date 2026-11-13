import { describe, expect, it } from "vitest"
import {
  acceptCompletion,
  keepShownOrder,
  streamCompletions,
  toAutocompleteQuery,
} from "./prompt-autocomplete"

async function collect(chunks: string[], query: string) {
  async function* source() {
    yield* chunks
  }
  const completions: string[] = []
  for await (const completion of streamCompletions(source(), query)) {
    completions.push(completion)
  }
  return completions
}

describe("prompt autocomplete", () => {
  it("completes only short single-line prompts that are not commands", () => {
    expect(toAutocompleteQuery("  how do")).toBe("how do")
    expect(toAutocompleteQuery("h")).toBeNull()
    expect(toAutocompleteQuery("/search")).toBeNull()
    expect(toAutocompleteQuery("@notion")).toBeNull()
    expect(toAutocompleteQuery("two\nlines")).toBeNull()
    expect(toAutocompleteQuery("x".repeat(51))).toBeNull()
  })

  it("streams distinct lines that extend the typed text, in the user's casing", async () => {
    const chunks = [
      "1. how do i bake bre",
      'ad.\n"how do i fix a flat tire"\nwhat is love\nhow do i bake bread\n',
      "how do I\n- how do i learn spanish\nhow do i tie a tie",
    ]
    expect(await collect(chunks, "how do I")).toEqual([
      "how do I bake bread",
      "how do I fix a flat tire",
      "how do I learn spanish",
    ])
  })

  it("appends only the continuation to the draft", () => {
    expect(acceptCompletion("  How do", "How do", "how do i cook rice")).toBe(
      "  How do i cook rice"
    )
  })

  it("keeps shown rows in their slots when results refresh", () => {
    expect(keepShownOrder(["b", "d", "e"], ["a", "b", "c"])).toEqual([
      "d",
      "b",
      "e",
    ])
    expect(keepShownOrder(["x", "y"], [])).toEqual(["x", "y"])
  })
})
