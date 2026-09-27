"use client"

import { headerActionButtonClassName } from "@/app/components/layout/header-action-button"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { useIntentPrefetch } from "@/components/ui/intent-prefetch"
import { api } from "@/convex/_generated/api"
import { useBreakpoint } from "@/hooks/use-breakpoint"
import { useChatSession } from "@/lib/chat-store/session/provider"
import { RiLoader4Line, RiShare2Line } from "@remixicon/react"
import { useMutation } from "convex/react"
import { startTransition, useState } from "react"
import { sharePublishedChat } from "./public-chat-share"
import {
  LazySharePublishContent,
  preloadSharePublishContent,
} from "./share-publish-content-loader"
import { SharePublishDrawer } from "./share-publish-drawer"

/**
 * The header outlives chat routes (ADR-0013), so the share surface is keyed by
 * chat: a route change resets it, and Stop sharing only ever revokes the chat
 * whose link it shows.
 */
export function DialogPublish() {
  const { chatId } = useChatSession()
  return chatId ? <ChatShareDialog key={chatId} chatId={chatId} /> : null
}

function ChatShareDialog({ chatId }: { chatId: string }) {
  const [openDialog, setOpenDialog] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [shareId, setShareId] = useState<string | null>(null)
  const isMobile = useBreakpoint(768)
  const prefetchShareRef = useIntentPrefetch<HTMLButtonElement>(
    preloadSharePublishContent
  )
  const publishMutation = useMutation(api.shares.publish)
  const revokeMutation = useMutation(api.shares.revoke)

  const handlePublish = async () => {
    setIsLoading(true)
    void preloadSharePublishContent()

    try {
      await sharePublishedChat({
        publish: async () => (await publishMutation({ chatId })).shareId,
        openFallback: (id) =>
          startTransition(() => {
            setShareId(id)
            setOpenDialog(true)
          }),
      })
    } catch (error) {
      console.error("Failed to share chat:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStopSharing = async () => {
    try {
      await revokeMutation({ chatId })
      setOpenDialog(false)
    } catch (error) {
      console.error("Failed to stop sharing chat:", error)
    }
  }

  const trigger = (
    <Button
      ref={prefetchShareRef}
      variant="ghost"
      className={`${headerActionButtonClassName} px-2.5 py-1.5`}
      onClick={handlePublish}
      disabled={isLoading}
    >
      {isLoading ? (
        <Icon icon={RiLoader4Line} slotSize={20} className="animate-spin" />
      ) : (
        <Icon icon={RiShare2Line} slotSize={20} />
      )}
      <span>Share</span>
    </Button>
  )

  if (isMobile) {
    return (
      <>
        {trigger}
        <SharePublishDrawer
          open={openDialog}
          onOpenChange={setOpenDialog}
          shareId={shareId}
          onStopSharing={handleStopSharing}
        />
      </>
    )
  }

  return (
    <>
      {trigger}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Your conversation is now public!</DialogTitle>
            <DialogDescription>
              Anyone with the link can view this conversation.
            </DialogDescription>
          </DialogHeader>
          {shareId && (
            <LazySharePublishContent
              shareId={shareId}
              onClose={() => setOpenDialog(false)}
              onStopSharing={handleStopSharing}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
