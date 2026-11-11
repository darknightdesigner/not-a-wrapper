import { describe, expect, it } from "vitest"
import { getComposerActionQueryMatches } from "./composer-action-registry"

describe("Composer action registry", () => {
  it("returns the default @ actions and filters their searchable text", () => {
    expect(getComposerActionQueryMatches("").map(({ id }) => id)).toEqual([
      "add-files",
      "web-search",
    ])
    expect(getComposerActionQueryMatches("w").map(({ id }) => id)).toEqual([
      "web-search",
    ])
    expect(getComposerActionQueryMatches("upload").map(({ id }) => id)).toEqual(
      ["add-files"]
    )
    expect(getComposerActionQueryMatches("zzzzzzzz")).toEqual([])
  })

  it("matches multi-word queries as one ordered substring", () => {
    expect(
      getComposerActionQueryMatches("add photos").map(({ id }) => id)
    ).toEqual(["add-files"])
    expect(
      getComposerActionQueryMatches("ADD PHOTOS").map(({ id }) => id)
    ).toEqual(["add-files"])
    expect(
      getComposerActionQueryMatches("files upload").map(({ id }) => id)
    ).toEqual(["add-files"])
    expect(getComposerActionQueryMatches("photos add")).toEqual([])
  })
})
