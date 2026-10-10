import { toast } from "@/components/ui/toast"
import type {
  CreateFirstTurnChatInput,
  FirstTurnChatResult,
} from "@/lib/chat-store/chats/provider"
import {
  createChatPublicId,
  GUEST_CHAT_STORAGE_KEY,
} from "@/lib/chat-store/identity"
import type {
  EnsureChatForTurnArgs,
  EnsuredTurnChat,
  GuestUsageGate,
} from "@/lib/chat-turn/chat-turn-controller"
import {
  loadGuestUsageHint,
  readGuestUsageHint,
  recordGuestUsageHint,
  spendGuestUsageHint,
} from "@/lib/chat-turn/usage-hint"
import { REMAINING_QUERY_ALERT_THRESHOLD } from "@/lib/config"
import type { Attachment } from "@/lib/file-handling"
import { useEffect, useMemo, useRef } from "react"

/**
 * The first turn's allocation (ADR-0033). The chat id is minted and committed
 * to the session BEFORE creation; `committed` flips once the local or atomic
 * durable creation has landed. `committedTurn` (durable creations only)
 * retains the atomically persisted turn's full identity so a same-payload
 * retry re-presents it — the dispatch then claims the persisted row
 * idempotently instead of racing the projection (a `{count: 0}` stale
 * rejection) or appending a duplicate prompt.
 */
type FirstTurnAllocation = {
  chatId: string
  committed: boolean
  /** A guest's local creation: client-only, so a guest sign-in refusal can
   * still roll it back (ADR-0045). A durable creation never rolls back. */
  local?: true
  committedTurn?: {
    userMessageId: string
    clientMessageId: string
    text: string
    attachmentIds: string[]
    attachments: Attachment[]
  }
}

function isSameAttachmentSet(committed: string[], requested: string[]) {
  if (committed.length !== requested.length) return false
  const sortedRequested = [...requested].sort()
  return [...committed]
    .sort()
    .every((id, index) => id === sortedRequested[index])
}

type UseChatOperationsProps = {
  isAuthenticated: boolean
  chatId: string | null
  selectedModel: string
  systemPrompt: string
  /** When set, first-turn chats are created inside this project. */
  projectId?: string
  createFirstTurnChat: (
    input: CreateFirstTurnChatInput
  ) => Promise<FirstTurnChatResult>
  /** Discards a rolled-back guest first turn's local chat. */
  deleteChat: (chatId: string) => Promise<unknown>
  /** Session identity commands (the only History API owner). */
  commitChatIdentity: (chatId: string) => void
  resetChatIdentity: () => void
  setHasDialogAuth: (value: boolean) => void
  /** Identity seam for tests; production mints a UUID. */
  createChatId?: () => string
}

export function useChatOperations({
  isAuthenticated,
  chatId,
  selectedModel,
  systemPrompt,
  projectId,
  createFirstTurnChat,
  deleteChat,
  commitChatIdentity,
  resetChatIdentity,
  setHasDialogAuth,
  createChatId = createChatPublicId,
}: UseChatOperationsProps) {
  // The allocation bridges the identity commit → chatId-prop lag inside one
  // first turn, and survives a post-commit dispatch failure so a retry reuses
  // the chat. Returning to the no-chat surface (Back/Forward to onboarding,
  // which does NOT remount the mounted Chat, or a rollback) must invalidate
  // it, or the next first turn would silently append to the previous chat.
  const allocationRef = useRef<FirstTurnAllocation | null>(null)
  // A guest's local chat awaiting its first acceptance. Kept apart from the
  // allocation, which Back clears, so a later refusal can still discard it.
  const unacceptedLocalChatRef = useRef<string | null>(null)
  const previousChatIdRef = useRef(chatId)
  useEffect(() => {
    const previousChatId = previousChatIdRef.current
    previousChatIdRef.current = chatId
    if (previousChatId !== null && chatId === null) {
      allocationRef.current = null
    }
  }, [chatId])

  /**
   * Mint the first turn's identity and commit its route synchronously, before
   * the optimistic row paints and before any request leaves. Idempotent
   * within one first turn: a retry that still holds an allocation reuses it.
   */
  const beginFirstTurn = (): string => {
    const current = allocationRef.current
    if (current) return current.chatId
    const nextChatId = createChatId()
    allocationRef.current = { chatId: nextChatId, committed: false }
    commitChatIdentity(nextChatId)
    return nextChatId
  }

  /**
   * The one pre-commit rollback: identity cleared (origin route restored)
   * and the allocation dropped. A no-op once a durable creation has landed:
   * a later dispatch failure keeps the chat at its route (ADR-0012). A
   * guest's local chat is discarded instead, since the turn runner rolls it
   * back only on a guest sign-in refusal, which committed nothing (ADR-0045).
   */
  const rollbackFirstTurn = () => {
    const refusedLocalChat = unacceptedLocalChatRef.current
    unacceptedLocalChatRef.current = null
    if (refusedLocalChat) {
      // No fallback may still point at the discarded chat.
      if (localStorage.getItem(GUEST_CHAT_STORAGE_KEY) === refusedLocalChat) {
        localStorage.removeItem(GUEST_CHAT_STORAGE_KEY)
      }
      void deleteChat(refusedLocalChat).catch((error: unknown) => {
        console.error("Failed to discard a refused guest chat:", error)
      })
    }
    const current = allocationRef.current
    if (!current || (current.committed && !current.local)) return
    allocationRef.current = null
    resetChatIdentity()
  }

  // Acceptance consumes the committed identity: the persisted first-turn row
  // may be claimed by exactly one dispatch, so once one is accepted the
  // allocation keeps only the chatId (the commit → prop lag bridge).
  const confirmFirstTurnDispatched = (dispatchedChatId: string) => {
    const current = allocationRef.current
    if (current?.chatId === dispatchedChatId && current.committedTurn) {
      allocationRef.current = { chatId: current.chatId, committed: true }
    }
  }

  // The guest usage gate (ADR-0045). The typing-time hint answers at Send
  // with no round trip; a Send with no fresh hint (a ?prompt= auto-send)
  // reads one, and a failed read lets the send through for admission to judge.
  const guestUsage = useMemo(() => {
    const admit = (remaining: number | null) => {
      if (remaining === 0) {
        setHasDialogAuth(true)
        return false
      }
      if (remaining === REMAINING_QUERY_ALERT_THRESHOLD) {
        toast({
          title: `Only ${REMAINING_QUERY_ALERT_THRESHOLD} queries remaining today.`,
          status: "info",
        })
      }
      return true
    }
    return {
      check: () => {
        const remaining = readGuestUsageHint()
        return remaining === null
          ? loadGuestUsageHint().then(admit)
          : admit(remaining)
      },
      spend: spendGuestUsageHint,
      // A daily-limit or guest-capacity refusal the hint missed (another
      // tab, a shared network): the next Send gates locally, and sign-in
      // opens now.
      limitReached: () => {
        recordGuestUsageHint(0)
        setHasDialogAuth(true)
      },
    } satisfies GuestUsageGate & { limitReached: () => void }
  }, [setHasDialogAuth])

  const createAllocatedChat = async (
    allocation: FirstTurnAllocation,
    { userId, text, clientMessageId, attachmentIds }: EnsureChatForTurnArgs
  ): Promise<EnsuredTurnChat | null> => {
    const createWithId = (publicId: string) =>
      createFirstTurnChat({
        publicId,
        model: selectedModel,
        systemPrompt,
        ...(projectId ? { projectId } : {}),
        ...(isAuthenticated ? {} : { guestUserId: userId }),
        message: { clientMessageId, text },
        attachmentIds,
      })

    // Back to the no-chat surface while creation is in flight invalidates the
    // allocation (the effect above nulls it). A creation that lands afterwards
    // must neither resurrect it nor dispatch for a chat the user already
    // left; the committed chat simply keeps its first message.
    let active = allocation
    const isInvalidated = () => allocationRef.current !== active

    let created = await createWithId(active.chatId)
    if (isInvalidated()) return null

    // Another holder of the minted id (typed server conflict): re-mint
    // exactly once, re-committing the route in place, then retry.
    if (created?.kind === "conflict") {
      active = { chatId: createChatId(), committed: false }
      allocationRef.current = active
      commitChatIdentity(active.chatId)
      created = await createWithId(active.chatId)
      if (isInvalidated()) return null
    }

    // A second conflict is a plain failure, reported in place like any other
    // refused creation (the first conflict was swallowed by the re-mint).
    if (created?.kind === "conflict") {
      toast({ title: "Failed to create chat", status: "error" })
      return null
    }
    if (!created) return null
    const activeChatId = active.chatId
    if (created.kind === "local") {
      allocationRef.current = {
        chatId: activeChatId,
        committed: true,
        local: true,
      }
      localStorage.setItem(GUEST_CHAT_STORAGE_KEY, activeChatId)
      unacceptedLocalChatRef.current = activeChatId
      return {
        chatId: activeChatId,
        confirmDispatched: () => {
          if (unacceptedLocalChatRef.current === activeChatId) {
            unacceptedLocalChatRef.current = null
          }
        },
      }
    }

    allocationRef.current = {
      chatId: activeChatId,
      committed: true,
      committedTurn: {
        userMessageId: created.userMessageId,
        clientMessageId,
        text,
        attachmentIds,
        attachments: created.attachments,
      },
    }
    return {
      chatId: activeChatId,
      confirmDispatched: () => confirmFirstTurnDispatched(activeChatId),
      firstTurn: {
        userMessageId: created.userMessageId,
        clientMessageId,
        attachments: created.attachments,
      },
    }
  }

  const ensureChatExists = async (
    args: EnsureChatForTurnArgs
  ): Promise<EnsuredTurnChat | null> => {
    const { text, attachmentIds } = args
    const allocation = allocationRef.current
    const committed = allocation?.committedTurn

    // A committed-but-not-yet-dispatched first turn is a retry token held
    // until a dispatch on this chat is ACCEPTED (confirmDispatched): a
    // same-payload retry re-presents the committed identity so the dispatch
    // claims the persisted row instead of duplicating it; a different payload
    // appends as a normal turn and, once accepted, retires the token so a
    // later identical payload is a genuine new message. A refused dispatch of
    // either kind keeps the token, so the original payload can still claim
    // its row.
    const heldFirstTurn =
      allocation && committed && (chatId === null || chatId === allocation.chatId)
        ? {
            chatId: allocation.chatId,
            confirmDispatched: () =>
              confirmFirstTurnDispatched(allocation.chatId),
          }
        : null
    if (heldFirstTurn && committed) {
      if (
        committed.text === text &&
        isSameAttachmentSet(committed.attachmentIds, attachmentIds)
      ) {
        return {
          ...heldFirstTurn,
          firstTurn: {
            userMessageId: committed.userMessageId,
            clientMessageId: committed.clientMessageId,
            attachments: committed.attachments,
          },
        }
      }
      return heldFirstTurn
    }

    // The identity was committed at Send (beginFirstTurn); creation lands
    // here, after the pre-creation refusals. The chatId prop may already
    // carry the committed id, so the allocation is consulted first.
    if (allocation && !allocation.committed) {
      try {
        return await createAllocatedChat(allocation, args)
      } catch (err: unknown) {
        let errorMessage = "Something went wrong."
        try {
          const errorObj = err as { message?: string }
          if (errorObj.message) {
            const parsed = JSON.parse(errorObj.message)
            errorMessage = parsed.error || errorMessage
          }
        } catch {
          const errorObj = err as { message?: string }
          errorMessage = errorObj.message || errorMessage
        }
        toast({ title: errorMessage, status: "error" })
        return null
      }
    }

    if (chatId) return { chatId }
    // The prop still lags the committed identity.
    if (allocation) return { chatId: allocation.chatId }

    // No identity was committed for this send (the surface returned to
    // onboarding mid-flight): refuse rather than mint outside Send.
    return null
  }

  return {
    guestUsage,
    ensureChatExists,
    beginFirstTurn,
    rollbackFirstTurn,
  }
}
