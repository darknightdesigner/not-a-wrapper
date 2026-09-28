"use client"

import { Button } from "@/components/ui/button"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"

export function HoverCardDefaultDemo() {
  return (
    <HoverCard>
      <HoverCardTrigger render={<Button variant="link" />}>
        @notawrapper
      </HoverCardTrigger>
      <HoverCardContent>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Not A Wrapper</p>
          <p className="text-muted-foreground text-sm">
            An AI chat app that is definitely not just a wrapper.
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
