"use client"

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { LazySharePublishContent } from "./share-publish-content-loader"

type SharePublishDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  shareId: string | null
  onStopSharing: () => Promise<void>
}

export function SharePublishDrawer({
  open,
  onOpenChange,
  shareId,
  onStopSharing,
}: SharePublishDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-background border-border">
        <DrawerHeader>
          <DrawerTitle>Your conversation is now public!</DrawerTitle>
          <DrawerDescription>
            Anyone with the link can view this conversation.
          </DrawerDescription>
        </DrawerHeader>
        {shareId && (
          <div className="px-4 pb-6">
            <LazySharePublishContent
              shareId={shareId}
              onClose={() => onOpenChange(false)}
              onStopSharing={onStopSharing}
            />
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}
