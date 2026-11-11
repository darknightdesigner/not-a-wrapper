"use client"

import { SidebarChatStatusIndicator } from "@/app/components/layout/sidebar/sidebar-item-status"
import { SidebarRow } from "@/app/components/layout/sidebar/sidebar-row"
import {
  SidebarPinnedIndicator,
  SidebarRowEndSlot,
} from "@/app/components/layout/sidebar/sidebar-row-actions"
import {
  trailingIconButtonClassName,
  TrailingIconChip,
} from "@/app/components/layout/sidebar/trailing-icon-button"
import { SidebarDemoColumn } from "@/app/design-system/_components/sidebar-demo-column"
import { Icon } from "@/components/ui/icon"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { SidebarChatStatus } from "@/lib/chat-store/status/sidebar-chat-status"
import { RiEditLine } from "@remixicon/react"
import { useState } from "react"

/**
 * Client-side demos with a stub persistence adapter: rename commits to local
 * state instead of a chat-store mutation, everything else is the production
 * row. A rename button stands in for ChatActionsMenu (the real menu needs the
 * chat store); pinned rows rest on the real pin mark.
 */

function RenameAction({ onStartRename }: { onStartRename: () => void }) {
  return (
    <Tooltip disableHoverablePopup>
      <TooltipTrigger
        render={
          <button
            type="button"
            className={trailingIconButtonClassName}
            aria-label="Rename"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onStartRename()
            }}
          />
        }
      >
        <TrailingIconChip>
          <Icon icon={RiEditLine} slotSize={18} />
        </TrailingIconChip>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={-6} variant="outline">
        Rename
      </TooltipContent>
    </Tooltip>
  )
}

function DemoChatRow({
  initialTitle,
  isActive = false,
  pinned = false,
  status = "idle",
}: {
  initialTitle: string
  isActive?: boolean
  pinned?: boolean
  status?: SidebarChatStatus
}) {
  const [title, setTitle] = useState(initialTitle)

  return (
    <SidebarRow
      interaction={{ kind: "link", href: "#" }}
      isActive={isActive}
      title={title}
      renameValue={title}
      renameLabel="Chat title"
      onRename={(next) => setTitle(next)}
      trailing={({ startRename }) => (
        <SidebarRowEndSlot
          status={
            status !== "idle" ? (
              <SidebarChatStatusIndicator status={status} />
            ) : pinned ? (
              <SidebarPinnedIndicator />
            ) : undefined
          }
        >
          <RenameAction onStartRename={startRename} />
        </SidebarRowEndSlot>
      )}
    />
  )
}

export function SidebarRowStates() {
  return (
    <SidebarDemoColumn>
      <DemoChatRow initialTitle="Active conversation" isActive />
      <DemoChatRow
        initialTitle="Pinned: hover swaps the pin for actions"
        pinned
      />
      <DemoChatRow initialTitle="Hover me: rename reveals" />
      <DemoChatRow initialTitle="A very long title that truncates before the trailing lane" />
    </SidebarDemoColumn>
  )
}

export function SidebarRowStatuses() {
  return (
    <SidebarDemoColumn>
      <DemoChatRow initialTitle="Generating response" status="streaming" />
      <DemoChatRow initialTitle="Waiting for you" status="awaiting" />
      <DemoChatRow initialTitle="New activity" status="unread" />
      <DemoChatRow initialTitle="Generation failed" status="error" />
    </SidebarDemoColumn>
  )
}
