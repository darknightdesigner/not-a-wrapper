import { undo } from "prosemirror-history"
import { EditorState, TextSelection } from "prosemirror-state"
import { describe, expect, it } from "vitest"
import {
  createPromptInputDocument,
  createPromptInputPlugins,
  deleteComposerEntityBackward,
  deleteComposerEntityForward,
  getPromptInputEntitySelectionDecorations,
  promptInputEntitiesEqual,
  promptInputSchema,
  readPromptInputActionQuery,
  readPromptInputActionQuerySession,
  readPromptInputDocument,
  readPromptInputEntities,
  replacePromptInputActionQuery,
  type PromptInputEntity,
} from "./prompt-input-editor"

const webSearchEntity: PromptInputEntity = {
  id: "web-search",
  kind: "capability",
  label: "Web search",
  iconUrl: null,
}

describe("PromptInput structured document", () => {
  const createEditorState = () =>
    EditorState.create({
      doc: createPromptInputDocument("", [webSearchEntity]),
      plugins: createPromptInputPlugins(() => "Ask anything"),
      schema: promptInputSchema,
    })

  it("keeps a submitted paragraph outside the preceding list", () => {
    const { nodes, marks } = promptInputSchema
    const paragraph = (text: string) =>
      nodes.paragraph.create(null, text ? promptInputSchema.text(text) : null)
    const list = nodes.bullet_list.create(null, [
      nodes.list_item.create(null, [
        paragraph("item"),
        nodes.bullet_list.create(
          null,
          nodes.list_item.create(null, paragraph("nested"))
        ),
      ]),
    ])
    const document = nodes.doc.create(null, [
      nodes.heading.create({ level: 1 }, promptInputSchema.text("Heading 1")),
      nodes.heading.create({ level: 2 }, promptInputSchema.text("Heading 2")),
      list,
      nodes.paragraph.create(
        null,
        promptInputSchema.text("italic paragraph", [marks.em.create()])
      ),
    ])
    const source = readPromptInputDocument(document)
    expect(source).toBe(
      "# Heading 1\n## Heading 2\n- item\n  - nested\n\n*italic paragraph*"
    )
    expect(createPromptInputDocument(source).eq(document)).toBe(true)
  })

  it("separates non-one ordered lists without inventing empty paragraphs", () => {
    const { nodes } = promptInputSchema
    const paragraph = (text = "") =>
      nodes.paragraph.create(null, text ? promptInputSchema.text(text) : null)
    const list = nodes.ordered_list.create(
      { order: 3 },
      nodes.list_item.create(null, paragraph("third"))
    )
    for (const content of [
      [paragraph("before"), list, paragraph("after")],
      [
        nodes.bullet_list.create(
          null,
          nodes.list_item.create(null, [
            paragraph("outer"),
            list,
            paragraph("after nested"),
          ])
        ),
      ],
      [paragraph("before"), paragraph(), list, paragraph(), paragraph("after")],
      [paragraph(), list, paragraph()],
      [
        nodes.heading.create({ level: 1 }, promptInputSchema.text("Heading")),
        paragraph(),
        list,
        paragraph(),
        nodes.heading.create({ level: 2 }, promptInputSchema.text("Next")),
      ],
    ]) {
      const document = nodes.doc.create(null, content)
      const source = readPromptInputDocument(document)
      expect(createPromptInputDocument(source).eq(document), source).toBe(true)
    }
    expect(
      readPromptInputDocument(
        nodes.doc.create(null, [paragraph("one"), paragraph("two")])
      )
    ).toBe("one\ntwo")
  })

  it("keeps cleared formatting editable without emitting sendable markers", () => {
    for (const value of ["# x", "## x", "### x", "- x", "1. x"]) {
      const document = createPromptInputDocument(value)
      let state = EditorState.create({ doc: document })
      state = state.apply(
        state.tr.delete(
          TextSelection.atStart(document).from,
          TextSelection.atEnd(document).to
        )
      )
      expect(readPromptInputDocument(state.doc), value).toBe("")
      expect(state.doc.firstChild?.type).toBe(document.firstChild?.type)
      state = state.apply(state.tr.insertText("again"))
      expect(readPromptInputDocument(state.doc)).toBe(
        value.replace("x", "again")
      )
    }
  })

  it("preserves blank draft whitespace without link or block syntax", () => {
    const heading = promptInputSchema.nodes.heading.create({ level: 2 }, [
      promptInputSchema.text(" \t", [
        promptInputSchema.marks.link.create({ href: "https://example.com" }),
      ]),
      promptInputSchema.nodes.hard_break.create(),
    ])
    const document = promptInputSchema.nodes.doc.create(null, heading)
    expect(readPromptInputDocument(document)).toBe(" \t\n")
    expect(readPromptInputDocument(createPromptInputDocument(" \n\n "))).toBe(
      " \n\n "
    )
  })

  it("keeps capability entities typed while serializing only user-authored text", () => {
    const document = createPromptInputDocument("first line\nsecond line", [
      webSearchEntity,
    ])

    expect(readPromptInputDocument(document)).toBe("first line\nsecond line")
    expect(readPromptInputEntities(document)).toEqual([webSearchEntity])
    expect(document.firstChild?.firstChild?.type.name).toBe(
      "composerEntityCursorTarget"
    )
    expect(document.firstChild?.child(1).type.name).toBe("composerEntity")
  })

  it("recognizes an @ action query only at a text boundary before the caret", () => {
    const withSelectionAtEnd = (value: string) => {
      const document = createPromptInputDocument(value)
      const state = EditorState.create({
        doc: document,
        schema: promptInputSchema,
      })
      return state.apply(
        state.tr.setSelection(
          TextSelection.create(document, document.content.size - 1)
        )
      )
    }

    const mention = (from: number, query: string, to: number) => ({
      from,
      query,
      to,
      trigger: "@",
    })

    expect(readPromptInputActionQuery(withSelectionAtEnd("@web"))).toEqual(
      mention(1, "web", 5)
    )
    expect(readPromptInputActionQuery(withSelectionAtEnd("hello @w"))).toEqual(
      mention(7, "w", 9)
    )
    expect(
      readPromptInputActionQuery(withSelectionAtEnd("@add photos"))
    ).toEqual(mention(1, "add photos", 12))
    expect(readPromptInputActionQuery(withSelectionAtEnd("@a @b c"))).toEqual(
      mention(4, "b c", 8)
    )
    expect(readPromptInputActionQuery(withSelectionAtEnd("hello@w"))).toBeNull()
    expect(readPromptInputActionQuery(withSelectionAtEnd("@ "))).toBeNull()
    expect(readPromptInputActionQuery(withSelectionAtEnd("@ web"))).toBeNull()

    // "+" is a mention trigger with identical boundary rules.
    expect(readPromptInputActionQuery(withSelectionAtEnd("+web s"))).toEqual({
      from: 1,
      query: "web s",
      to: 7,
      trigger: "+",
    })
    expect(readPromptInputActionQuery(withSelectionAtEnd("2+2"))).toBeNull()
  })

  it("keeps slash commands space-terminated and lets a later slash own the tail", () => {
    const withSelectionAtEnd = (value: string) => {
      const document = createPromptInputDocument(value)
      const state = EditorState.create({
        doc: document,
        schema: promptInputSchema,
      })
      return state.apply(
        state.tr.setSelection(
          TextSelection.create(document, document.content.size - 1)
        )
      )
    }

    expect(readPromptInputActionQuery(withSelectionAtEnd("/web"))).toEqual({
      from: 1,
      query: "web",
      to: 5,
      trigger: "/",
    })
    // Space ends the slash query entirely — unlike "@" it never spans words.
    expect(readPromptInputActionQuery(withSelectionAtEnd("/web s"))).toBeNull()
    // A later "/" that starts a word owns the tail: while its query is
    // stale, the earlier "@" mention must not reactivate.
    expect(readPromptInputActionQuery(withSelectionAtEnd("@add /web"))).toEqual(
      {
        from: 6,
        query: "web",
        to: 10,
        trigger: "/",
      }
    )
    expect(
      readPromptInputActionQuery(withSelectionAtEnd("@add /web s"))
    ).toBeNull()
    expect(readPromptInputActionQuery(withSelectionAtEnd("a/b"))).toBeNull()
  })

  it("keys session identity to trigger position and symbol", () => {
    let state = EditorState.create({
      doc: createPromptInputDocument(""),
      plugins: createPromptInputPlugins(() => "Ask anything"),
      schema: promptInputSchema,
    })
    const dispatch = (transaction: Parameters<typeof state.apply>[0]) => {
      state = state.apply(transaction)
    }

    dispatch(state.tr.insertText("@"))
    const opened = readPromptInputActionQuerySession(state)
    expect(opened.active).toBe(true)

    // Refining the query in place is the SAME session (Escape dismissal must
    // survive it because session identity is keyed by position and symbol).
    dispatch(state.tr.insertText("w"))
    const refined = readPromptInputActionQuerySession(state)
    expect(refined).toMatchObject({ active: true, query: "w", id: opened.id })

    // Removing the trigger closes the session but keeps the id, so reopening
    // at the same position still counts as a new session.
    dispatch(state.tr.delete(1, 3))
    expect(readPromptInputActionQuerySession(state)).toMatchObject({
      active: false,
      id: opened.id,
    })
    dispatch(state.tr.insertText("@"))
    expect(readPromptInputActionQuerySession(state).id).toBe(opened.id + 1)
  })

  it("keeps activation valid for the published range after the caret moves", () => {
    const document = createPromptInputDocument("hello @web search")
    let state = EditorState.create({
      doc: document,
      plugins: createPromptInputPlugins(() => "Ask anything"),
      schema: promptInputSchema,
    })
    state = state.apply(
      state.tr.setSelection(
        TextSelection.create(document, document.content.size - 1)
      )
    )
    const query = readPromptInputActionQuery(state)
    expect(query).toMatchObject({ query: "web search" })

    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 1))
    )
    const dispatch = (transaction: Parameters<typeof state.apply>[0]) => {
      state = state.apply(transaction)
    }
    expect(
      replacePromptInputActionQuery(
        state,
        dispatch,
        { ...query!, id: 1 },
        webSearchEntity
      )
    ).toBe(true)
    expect(readPromptInputDocument(state.doc)).toBe("hello ")
    expect(readPromptInputEntities(state.doc)).toEqual([webSearchEntity])
  })

  it("replaces the exact @ query range with one typed capability entity", () => {
    const document = createPromptInputDocument("hello @w")
    let state = EditorState.create({
      doc: document,
      plugins: createPromptInputPlugins(() => "Ask anything"),
      schema: promptInputSchema,
    })
    state = state.apply(
      state.tr.setSelection(
        TextSelection.create(document, document.content.size - 1)
      )
    )
    const query = readPromptInputActionQuery(state)
    expect(query).not.toBeNull()

    const dispatch = (transaction: Parameters<typeof state.apply>[0]) => {
      state = state.apply(transaction)
    }
    expect(
      replacePromptInputActionQuery(
        state,
        dispatch,
        { ...query!, id: 1 },
        webSearchEntity
      )
    ).toBe(true)

    expect(readPromptInputDocument(state.doc)).toBe("hello ")
    expect(readPromptInputEntities(state.doc)).toEqual([webSearchEntity])
    expect(readPromptInputActionQuery(state)).toBeNull()
    expect(state.doc.firstChild?.child(1).type.name).toBe(
      "composerEntityCursorTarget"
    )
    expect(state.doc.firstChild?.child(2).type.name).toBe("composerEntity")
    expect(state.doc.firstChild?.child(3).text).toBe(" ")
  })

  it("keeps @ typing and action activation as separate undo steps", () => {
    let state = EditorState.create({
      doc: createPromptInputDocument(""),
      plugins: createPromptInputPlugins(() => "Ask anything"),
      schema: promptInputSchema,
    })
    const dispatch = (transaction: Parameters<typeof state.apply>[0]) => {
      state = state.apply(transaction)
    }

    dispatch(state.tr.insertText("@"))
    dispatch(state.tr.insertText("w"))
    const query = readPromptInputActionQuery(state)
    expect(query).not.toBeNull()
    expect(
      replacePromptInputActionQuery(
        state,
        dispatch,
        { ...query!, id: 1 },
        webSearchEntity
      )
    ).toBe(true)

    expect(undo(state, dispatch)).toBe(true)
    expect(readPromptInputDocument(state.doc)).toBe("@w")
    expect(readPromptInputActionQuery(state)).toMatchObject({ query: "w" })

    expect(undo(state, dispatch)).toBe(true)
    expect(readPromptInputDocument(state.doc)).toBe("")
  })

  it("keeps the entity spacer out of the draft without stripping user whitespace", () => {
    const document = createPromptInputDocument("  draft", [webSearchEntity])

    expect(document.firstChild?.textContent).toBe("   draft")
    expect(readPromptInputDocument(document)).toBe("  draft")
  })

  it("compares entity identity and attributes instead of array identity", () => {
    expect(
      promptInputEntitiesEqual([webSearchEntity], [{ ...webSearchEntity }])
    ).toBe(true)
    expect(
      promptInputEntitiesEqual(
        [webSearchEntity],
        [{ ...webSearchEntity, label: "Search the web" }]
      )
    ).toBe(false)
  })

  it("decorates an entity selected by the native text range", () => {
    const state = createEditorState()
    const selected = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 3, 2))
    )

    const decorations = getPromptInputEntitySelectionDecorations(selected)
    const [decoration] = decorations?.find() ?? []
    const decorationAttrs = (
      decoration as typeof decoration & {
        type: { attrs: Record<string, string> }
      }
    )?.type.attrs

    expect(decoration?.from).toBe(2)
    expect(decoration?.to).toBe(3)
    expect(decorationAttrs).toMatchObject({
      class: expect.stringContaining("selection:bg-transparent"),
      "data-inline-selection-pill-selected": "",
    })
  })

  it("deletes the cursor target, entity, and spacer in one undoable transaction", () => {
    let state = createEditorState()
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 3))
    )
    const dispatch = (transaction: Parameters<typeof state.apply>[0]) => {
      state = state.apply(transaction)
    }

    expect(deleteComposerEntityBackward(state, dispatch)).toBe(true)
    expect(readPromptInputEntities(state.doc)).toEqual([])
    expect(
      state.doc.firstChild?.content.content.some(
        (node) => node.type.name === "composerEntityCursorTarget"
      )
    ).toBe(false)
    expect(readPromptInputDocument(state.doc)).toBe("")

    expect(undo(state, dispatch)).toBe(true)
    expect(readPromptInputEntities(state.doc)).toEqual([webSearchEntity])
    expect(state.doc.firstChild?.firstChild?.type.name).toBe(
      "composerEntityCursorTarget"
    )
  })

  it("deletes the same atomic entity structure when Delete starts before it", () => {
    let state = createEditorState()
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 1))
    )
    const dispatch = (transaction: Parameters<typeof state.apply>[0]) => {
      state = state.apply(transaction)
    }

    expect(deleteComposerEntityForward(state, dispatch)).toBe(true)
    expect(readPromptInputEntities(state.doc)).toEqual([])
    expect(readPromptInputDocument(state.doc)).toBe("")
  })

  it("keeps locked status entities through backward and forward deletion", () => {
    const lockedEntity: PromptInputEntity = {
      ...webSearchEntity,
      label: "Web search always on",
      removable: false,
    }
    let state = EditorState.create({
      doc: createPromptInputDocument("", [lockedEntity]),
      plugins: createPromptInputPlugins(() => "Ask anything"),
      schema: promptInputSchema,
    })
    const dispatch = (transaction: Parameters<typeof state.apply>[0]) => {
      state = state.apply(transaction)
    }

    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 3))
    )
    expect(deleteComposerEntityBackward(state, dispatch)).toBe(true)
    expect(readPromptInputEntities(state.doc)).toEqual([lockedEntity])

    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 1))
    )
    expect(deleteComposerEntityForward(state, dispatch)).toBe(true)
    expect(readPromptInputEntities(state.doc)).toEqual([lockedEntity])
  })

  it("deletes selected text without removing a locked status entity", () => {
    const lockedEntity: PromptInputEntity = {
      ...webSearchEntity,
      label: "Web search always on",
      removable: false,
    }
    let state = EditorState.create({
      doc: createPromptInputDocument("draft", [lockedEntity]),
      plugins: createPromptInputPlugins(() => "Ask anything"),
      schema: promptInputSchema,
    })
    state = state.apply(
      state.tr.setSelection(
        TextSelection.create(state.doc, 2, state.doc.content.size - 1)
      )
    )
    const dispatch = (transaction: Parameters<typeof state.apply>[0]) => {
      state = state.apply(transaction)
    }

    expect(deleteComposerEntityBackward(state, dispatch)).toBe(true)
    expect(readPromptInputEntities(state.doc)).toEqual([lockedEntity])
    expect(readPromptInputDocument(state.doc)).toBe("")

    expect(undo(state, dispatch)).toBe(true)
    expect(readPromptInputDocument(state.doc)).toBe("draft")
  })

  it("exposes a trailing cursor target before the next Backspace deletes the chip", () => {
    let state = createEditorState()
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 4))
    )

    expect(deleteComposerEntityBackward(state)).toBe(false)
    state = state.apply(state.tr.delete(3, 4))

    const paragraph = state.doc.firstChild
    expect(paragraph?.childCount).toBe(2)
    expect(state.selection.from).toBe(3)
    const [trailingCursorTarget] =
      getPromptInputEntitySelectionDecorations(state)?.find(3, 3) ?? []
    expect(trailingCursorTarget?.from).toBe(3)
    expect(trailingCursorTarget?.to).toBe(3)

    const dispatch = (transaction: Parameters<typeof state.apply>[0]) => {
      state = state.apply(transaction)
    }
    expect(deleteComposerEntityBackward(state, dispatch)).toBe(true)
    expect(readPromptInputEntities(state.doc)).toEqual([])
    expect(readPromptInputDocument(state.doc)).toBe("")

    expect(undo(state, dispatch)).toBe(true)
    expect(readPromptInputEntities(state.doc)).toEqual([webSearchEntity])
    expect(state.doc.firstChild?.child(2).text).toBe(" ")
  })

  it("replaces the trailing cursor target when typing continues after the chip", () => {
    let state = createEditorState()
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 4))
    )
    state = state.apply(state.tr.delete(3, 4))
    state = state.apply(state.tr.insertText("x"))

    const paragraph = state.doc.firstChild
    expect(paragraph?.childCount).toBe(3)
    expect(paragraph?.child(2).text).toBe("x")
    expect(readPromptInputEntities(state.doc)).toEqual([webSearchEntity])
    expect(readPromptInputDocument(state.doc)).toBe("x")
  })

  it("normalizes an orphaned cursor target in the transaction that removed its entity", () => {
    const state = createEditorState()
    const result = state.applyTransaction(state.tr.delete(2, 3)).state

    expect(readPromptInputEntities(result.doc)).toEqual([])
    expect(
      result.doc.firstChild?.content.content.some(
        (node) => node.type.name === "composerEntityCursorTarget"
      )
    ).toBe(false)
  })

  it("repairs missing cursor targets in one appended transaction", () => {
    const state = createEditorState()
    const withoutBoundaries = state.tr.delete(3, 4).delete(1, 2)
    const result = state.applyTransaction(withoutBoundaries).state
    const paragraph = result.doc.firstChild

    expect(paragraph?.firstChild?.type.name).toBe("composerEntityCursorTarget")
    expect(paragraph?.child(1).type.name).toBe("composerEntity")
    expect(paragraph?.childCount).toBe(2)
  })
})
