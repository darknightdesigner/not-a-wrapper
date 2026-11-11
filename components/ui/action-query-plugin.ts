import {
  promptInputSchema,
  type PromptInputEntity,
} from "@/components/ui/prompt-input-schema"
import { closeHistory } from "prosemirror-history"
import { Fragment } from "prosemirror-model"
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "prosemirror-state"

/**
 * The action-query session plugin owns everything about "@"/"+"/"/"
 * discovery sessions: typed-trigger grammar, the session state machine, and
 * range-validated activation.
 */

export type PromptInputActionQueryTrigger = "@" | "+" | "/"

export type PromptInputActionQuery = Readonly<{
  id: number
  from: number
  to: number
  query: string
  trigger: PromptInputActionQueryTrigger
}>

type PromptInputActionQueryRange = Omit<PromptInputActionQuery, "id">

/** Slash commands use space-terminated grammar: the query ends at
 * the first whitespace, unlike "@" mentions whose query is the raw tail. */
const slashQueryPattern = /(?:^|\s)\/([\p{L}\p{N}\p{M}.:_-]*)$/u

/** The mention trigger is the last "@" or "+" that starts a
 * word (start of the text run or after whitespace) and is not immediately
 * followed by whitespace unless the caret sits right after it. The query is
 * the raw tail after that trigger, so it may contain spaces. */
function findMentionTrigger(text: string) {
  let triggerIndex = -1
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (
      (character === "@" || character === "+") &&
      (index === 0 || /\s/u.test(text[index - 1] ?? "")) &&
      (index === text.length - 1 || !/\s/u.test(text[index + 1] ?? ""))
    ) {
      triggerIndex = index
    }
  }
  if (triggerIndex < 0) return null
  return {
    index: triggerIndex,
    trigger: text[triggerIndex] as "@" | "+",
    query: text.slice(triggerIndex + 1),
  }
}

function findLastSlashTriggerIndex(text: string) {
  let triggerIndex = -1
  for (let index = 0; index < text.length; index += 1) {
    if (
      text[index] === "/" &&
      (index === 0 || /\s/u.test(text[index - 1] ?? "")) &&
      (index === 0 ||
        index === text.length - 1 ||
        !/\s/u.test(text[index + 1] ?? ""))
    ) {
      triggerIndex = index
    }
  }
  return triggerIndex
}

type TypedActionQuery = Readonly<{
  trigger: PromptInputActionQueryTrigger
  query: string
  from: number
  to: number
}>

function readTypedActionQuery(
  $from: EditorState["selection"]["$from"]
): TypedActionQuery | null {
  if ($from.depth === 0) return null
  const text = $from.nodeBefore?.text
  if (text == null || text.includes("\n") || text.includes("\r")) return null

  const mention = findMentionTrigger(text)
  const slashTriggerIndex = findLastSlashTriggerIndex(text)
  const slashMatch = slashQueryPattern.exec(text)
  const slash = slashMatch
    ? {
        index: text.length - (slashMatch[1]?.length ?? 0) - 1,
        query: slashMatch[1] ?? "",
      }
    : null

  // A "/" that starts a word later than the "@" trigger owns
  // the tail — when its space-terminated query no longer matches, NOTHING
  // matches (the stale slash blocks the earlier mention).
  const mentionIndex = mention?.index ?? -1
  if (slashTriggerIndex > mentionIndex) {
    if (slash == null || slash.index !== slashTriggerIndex) return null
    return {
      trigger: "/",
      query: slash.query,
      from: $from.pos - slash.query.length - 1,
      to: $from.pos,
    }
  }
  if (!mention) return null
  return {
    trigger: mention.trigger,
    query: mention.query,
    from: $from.pos - mention.query.length - 1,
    to: $from.pos,
  }
}

function readPromptInputActionQuery(
  state: EditorState
): PromptInputActionQueryRange | null {
  if (!state.selection.empty) return null
  const typed = readTypedActionQuery(state.selection.$from)
  if (!typed) return null
  return {
    from: typed.from,
    to: typed.to,
    query: typed.query,
    trigger: typed.trigger,
  }
}

/**
 * The action-query session state machine. Sessions re-evaluate only on
 * document changes at an empty selection.
 */
type PromptInputActionQuerySessionState = Readonly<{
  active: boolean
  trigger: PromptInputActionQueryTrigger
  query: string
  range: { from: number; to: number } | null
  /** Session identity. A new id marks a new trigger position or symbol, so
   * menu-side Escape dismissal clears exactly when a new session starts.
   * Closed states keep the last id so reopening at the same position still
   * counts as a new session. */
  id: number
}>

const inactiveActionQuerySession: PromptInputActionQuerySessionState = {
  active: false,
  trigger: "@",
  query: "",
  range: null,
  id: 0,
}

function closedActionQuerySession(
  previous: PromptInputActionQuerySessionState
): PromptInputActionQuerySessionState {
  return previous.active
    ? { ...inactiveActionQuerySession, id: previous.id }
    : previous
}

function nextActionQuerySessionId(
  previous: PromptInputActionQuerySessionState,
  next: { trigger: PromptInputActionQueryTrigger; from: number }
) {
  return !previous.active ||
    previous.range?.from !== next.from ||
    previous.trigger !== next.trigger
    ? previous.id + 1
    : previous.id
}

const promptInputActionQueryPluginKey =
  new PluginKey<PromptInputActionQuerySessionState>("promptInputActionQuery")

function createActionQueryPlugin() {
  return new Plugin<PromptInputActionQuerySessionState>({
    key: promptInputActionQueryPluginKey,
    state: {
      init: () => inactiveActionQuerySession,
      apply(transaction, previous, oldState, newState) {
        if (transaction.getMeta("externalValue")) {
          return closedActionQuerySession(previous)
        }

        const selection = newState.selection
        if (!selection.empty || newState.doc.eq(oldState.doc)) {
          return previous
        }
        const typed = readTypedActionQuery(selection.$from)
        if (!typed) {
          return previous.active ? closedActionQuerySession(previous) : previous
        }
        return {
          active: true,
          trigger: typed.trigger,
          query: typed.query,
          range: { from: typed.from, to: typed.to },
          id: nextActionQuerySessionId(previous, typed),
        }
      },
    },
  })
}

function readPromptInputActionQuerySession(state: EditorState) {
  return (
    promptInputActionQueryPluginKey.getState(state) ??
    inactiveActionQuerySession
  )
}

/**
 * Diff-publishes the plugin's session state to a callback. The plugin owns its
 * re-evaluation rules and session identity. Publishing suppresses only
 * consecutive equal queries, so consumers see each session change exactly once.
 */
function createActionQueryPublisher(
  onActionQueryChange: (actionQuery: PromptInputActionQuery | null) => void
) {
  let last: PromptInputActionQuery | null = null
  return (state: EditorState) => {
    const session = readPromptInputActionQuerySession(state)
    const next: PromptInputActionQuery | null =
      session.active && session.range
        ? {
            id: session.id,
            from: session.range.from,
            to: session.range.to,
            query: session.query,
            trigger: session.trigger,
          }
        : null
    if (
      last?.from === next?.from &&
      last?.to === next?.to &&
      last?.query === next?.query &&
      last?.trigger === next?.trigger
    ) {
      return
    }
    last = next
    onActionQueryChange(next)
  }
}

function replacePromptInputActionQuery(
  state: EditorState,
  dispatch: (transaction: Transaction) => void,
  actionQuery: PromptInputActionQuery,
  entity?: PromptInputEntity
) {
  // Activation consumes the published trigger range even when
  // the caret has since moved. Doc edits republish the query, so the range is
  // validated against the document text instead of the current selection.
  const expectedText = `${actionQuery.trigger}${actionQuery.query}`
  if (
    actionQuery.from < 0 ||
    actionQuery.to > state.doc.content.size ||
    state.doc.textBetween(actionQuery.from, actionQuery.to, "\n", "￼") !==
      expectedText
  ) {
    return false
  }
  const currentQuery = actionQuery

  const transaction = state.tr
  if (!entity) {
    transaction.delete(currentQuery.from, currentQuery.to)
    transaction.setSelection(
      TextSelection.create(transaction.doc, currentQuery.from)
    )
  } else {
    const replacement = Fragment.fromArray([
      promptInputSchema.nodes.composerEntityCursorTarget.create({
        entityId: entity.id,
      }),
      promptInputSchema.nodes.composerEntity.create(entity),
      promptInputSchema.text(" "),
    ])
    transaction.replaceWith(currentQuery.from, currentQuery.to, replacement)
    transaction.setSelection(
      TextSelection.create(transaction.doc, currentQuery.from + replacement.size)
    )
  }

  dispatch(closeHistory(transaction).scrollIntoView())
  return true
}

export {
  createActionQueryPlugin,
  createActionQueryPublisher,
  readPromptInputActionQuery,
  readPromptInputActionQuerySession,
  replacePromptInputActionQuery,
}
