"use client"

import { ReactNode } from "react"
import { ClerkProvider } from "@clerk/nextjs"
import { shadcn } from "@clerk/themes"
import { ConvexClientProvider } from "./convex-client-provider"
import { PostHogProvider } from "./posthog-provider"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: shadcn,
      }}
    >
      <PostHogProvider>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </PostHogProvider>
    </ClerkProvider>
  )
}
