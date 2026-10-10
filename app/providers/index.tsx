"use client"

import type { NoUserInfo, UserInfo } from "@workos-inc/authkit-nextjs"
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components"
import { ReactNode } from "react"
import { ConvexClientProvider } from "./convex-client-provider"
import { PostHogPageView } from "./posthog-pageview"

type ProvidersProps = {
  children: ReactNode
  initialAuth: Omit<UserInfo | NoUserInfo, "accessToken">
}

export function Providers({ children, initialAuth }: ProvidersProps) {
  return (
    <AuthKitProvider initialAuth={initialAuth}>
      <PostHogPageView />
      <ConvexClientProvider>{children}</ConvexClientProvider>
    </AuthKitProvider>
  )
}
