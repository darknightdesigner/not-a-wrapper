"use client"

import type { Doc } from "@/convex/_generated/dataModel"
import { SIDEBAR_WINDOW_PAGE_SIZE } from "@/lib/config"
import { useCallback, useSyncExternalStore } from "react"
import type { Chats } from "../types"

/**
 * The persisted sidebar window for signed-in users (ADR-0048): the last
 * delivered first window page + pinned rows and the project list,
 * owner-scoped in localStorage, so a reload paints the sidebar before Convex
 * auth and the live reads settle. Display-only: each part is swapped out
 * wholesale once its live read is delivered, and rows never serve per-chat
 * lookups.
 */

export const PERSISTED_WINDOW_STORAGE_KEY = "naw:sidebar-window"
const PERSISTED_WINDOW_VERSION = 1
/** Pinned rows kept beyond the window page; the pinned read is unbounded. */
const PERSISTED_PINNED_LIMIT = 50
const MAX_PERSISTED_ROWS = SIDEBAR_WINDOW_PAGE_SIZE + PERSISTED_PINNED_LIMIT
/** The project read is unbounded; keep the newest, as the sidebar sorts. */
const MAX_PERSISTED_PROJECTS = 100
const IDLE_WRITE_TIMEOUT_MS = 2_000

/** Only what rows and pinned/project partitioning read. No run status. */
type PersistedRow = Pick<
  Chats,
  | "id"
  | "title"
  | "project_id"
  | "pinned"
  | "pinned_at"
  | "created_at"
  | "updated_at"
>

/** The fields the sidebar's project rows and grouping read. */
type PersistedProject = Pick<
  Doc<"projects">,
  "_id" | "_creationTime" | "userId" | "name" | "pinned" | "updatedAt"
>

type PersistedEnvelope = {
  v: typeof PERSISTED_WINDOW_VERSION
  owner: string
  rows: PersistedRow[]
  projects: PersistedProject[]
}

export type PersistedSidebarWindow = {
  chats: Chats[]
  projects: Doc<"projects">[]
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function isPersistedRow(value: unknown): value is PersistedRow {
  if (typeof value !== "object" || value === null) return false
  const row = value as Record<keyof PersistedRow, unknown>
  return (
    typeof row.id === "string" &&
    row.id.length > 0 &&
    isNullableString(row.title) &&
    isNullableString(row.project_id) &&
    typeof row.pinned === "boolean" &&
    isNullableString(row.pinned_at) &&
    isNullableString(row.created_at) &&
    isNullableString(row.updated_at)
  )
}

function isPersistedProject(value: unknown): value is PersistedProject {
  if (typeof value !== "object" || value === null) return false
  const project = value as Record<keyof PersistedProject, unknown>
  return (
    typeof project._id === "string" &&
    project._id.length > 0 &&
    typeof project._creationTime === "number" &&
    typeof project.userId === "string" &&
    typeof project.name === "string" &&
    typeof project.pinned === "boolean" &&
    typeof project.updatedAt === "number"
  )
}

/**
 * localStorage is untrusted: anything that is not this version, this owner,
 * and well-formed rows within the bound is rejected as a whole.
 */
export function parsePersistedWindow(
  raw: string | null,
  owner: string
): PersistedSidebarWindow | null {
  if (raw === null) return null
  let envelope: unknown
  try {
    envelope = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof envelope !== "object" || envelope === null) return null
  const {
    v,
    owner: storedOwner,
    rows,
    projects,
  } = envelope as Partial<Record<keyof PersistedEnvelope, unknown>>
  if (
    v !== PERSISTED_WINDOW_VERSION ||
    storedOwner !== owner ||
    !Array.isArray(rows) ||
    rows.length > MAX_PERSISTED_ROWS ||
    !rows.every(isPersistedRow) ||
    !Array.isArray(projects) ||
    projects.length > MAX_PERSISTED_PROJECTS ||
    !projects.every(isPersistedProject)
  ) {
    return null
  }
  return {
    // Fields rows never read get inert values; these rows never reach a chat
    // surface (getChatById serves live data only).
    chats: rows.map((row) => ({
      ...row,
      user_id: "",
      model: null,
      public: false,
    })),
    projects,
  }
}

/** The live first page + pinned rows and projects, minimal fields, bounded. */
export function serializePersistedWindow(
  owner: string,
  chats: Chats[],
  projects: Doc<"projects">[]
) {
  const toRow = (chat: Chats): PersistedRow => ({
    id: chat.id,
    title: chat.title,
    project_id: chat.project_id,
    pinned: chat.pinned,
    pinned_at: chat.pinned_at,
    created_at: chat.created_at,
    updated_at: chat.updated_at,
  })
  const envelope: PersistedEnvelope = {
    v: PERSISTED_WINDOW_VERSION,
    owner,
    rows: [
      ...chats
        .filter((chat) => !chat.pinned)
        .slice(0, SIDEBAR_WINDOW_PAGE_SIZE)
        .map(toRow),
      ...chats
        .filter((chat) => chat.pinned)
        .slice(0, PERSISTED_PINNED_LIMIT)
        .map(toRow),
    ],
    projects: [...projects]
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, MAX_PERSISTED_PROJECTS)
      .map(({ _id, _creationTime, userId, name, pinned, updatedAt }) => ({
        _id,
        _creationTime,
        userId,
        name,
        pinned,
        updatedAt,
      })),
  }
  return JSON.stringify(envelope)
}

// Storage access can throw (private mode, blocked site data); every failure
// degrades to "no persisted window".
function readRaw(): string | null {
  try {
    return localStorage.getItem(PERSISTED_WINDOW_STORAGE_KEY)
  } catch {
    return null
  }
}

function removeRaw() {
  try {
    localStorage.removeItem(PERSISTED_WINDOW_STORAGE_KEY)
  } catch {
    // Nothing readable to remove.
  }
}

// One storage read per change, not per render: the snapshot is cached until a
// clear or another tab's storage event invalidates it. This tab's own writes
// update the cache silently: the window is only shown while live data is
// pending, and no write happens then, so a notify would only re-render the
// provider tree for nothing.
let rawCache: string | null | undefined
let parsedCache: {
  raw: string | null
  owner: string
  value: PersistedSidebarWindow | null
} = { raw: null, owner: "", value: null }
const listeners = new Set<() => void>()
let writesStopped = false

function invalidate() {
  rawCache = undefined
  for (const listener of listeners) listener()
}

function getSnapshot(
  owner: string | undefined,
  active: boolean
): PersistedSidebarWindow | null {
  if (!owner || !active) return null
  if (rawCache === undefined) rawCache = readRaw()
  if (parsedCache.raw !== rawCache || parsedCache.owner !== owner) {
    parsedCache = {
      raw: rawCache,
      owner,
      value: parsePersistedWindow(rawCache, owner),
    }
  }
  return parsedCache.value
}

function handleStorage(event: StorageEvent) {
  if (event.key !== PERSISTED_WINDOW_STORAGE_KEY && event.key !== null) return
  // Another tab removed the window (sign-out, or a load by an identity that
  // could not use it): stop this document's writes too, so it cannot write
  // the departing owner's rows back.
  if (event.newValue === null) writesStopped = true
  invalidate()
}

let storageSubscribers = 0

function subscribe(
  owner: string | undefined,
  active: boolean,
  onChange: () => void
) {
  // A window that this caller cannot use (another owner, malformed, or no
  // signed-in owner at all) is deleted, so it never outlives its identity.
  const raw = readRaw()
  if (raw !== null && (!owner || parsePersistedWindow(raw, owner) === null)) {
    removeRaw()
    rawCache = undefined
  }

  // Storage events are always observed (another tab's removal stops writes);
  // only an active reader re-renders on them.
  storageSubscribers += 1
  if (storageSubscribers === 1) {
    window.addEventListener("storage", handleStorage)
  }
  if (active) listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
    storageSubscribers -= 1
    if (storageSubscribers > 0) return
    window.removeEventListener("storage", handleStorage)
    // Unobserved storage can change; the next reader starts from storage.
    rawCache = undefined
  }
}

/**
 * The owner's persisted window, read synchronously on the first client render.
 * The server snapshot is null, so hydration matches the server HTML. Pass
 * `active: false` once every live read it stands in for has been delivered:
 * the snapshot is then a stable null and other tabs' writes do not re-render.
 */
export function usePersistedWindow(
  owner: string | undefined,
  active: boolean
): PersistedSidebarWindow | null {
  const subscribeOwner = useCallback(
    (onChange: () => void) => subscribe(owner, active, onChange),
    [owner, active]
  )
  return useSyncExternalStore(
    subscribeOwner,
    () => getSnapshot(owner, active),
    () => null
  )
}

/**
 * Write a serialized window off the critical path, and only when it differs
 * from what is stored. Returns a cancel for the pending write.
 */
export function schedulePersistedWindowWrite(serialized: string): () => void {
  if (writesStopped) return () => undefined
  const write = () => {
    if (writesStopped || readRaw() === serialized) return
    try {
      localStorage.setItem(PERSISTED_WINDOW_STORAGE_KEY, serialized)
    } catch {
      return
    }
    // Unobserved storage is re-read by the next subscriber instead.
    rawCache = storageSubscribers > 0 ? serialized : undefined
  }

  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(write, {
      timeout: IDLE_WRITE_TIMEOUT_MS,
    })
    return () => cancelIdleCallback(handle)
  }
  const handle = setTimeout(write, 0)
  return () => clearTimeout(handle)
}

/**
 * Sign-out cleanup: delete the window and stop writes for this document
 * (sign-out ends in a document navigation), so a late live update cannot
 * persist the departing user's rows again.
 */
export function clearPersistedWindow() {
  writesStopped = true
  removeRaw()
  invalidate()
}
