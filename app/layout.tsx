import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ChatsProvider } from "@/lib/chat-store/chats/provider"
import { ChatSessionProvider } from "@/lib/chat-store/session/provider"
import { APP_DOMAIN } from "@/lib/config"
import { ModelProvider } from "@/lib/model-store/provider"
import { TanstackQueryProvider } from "@/lib/tanstack-query/tanstack-query-provider"
import { UserPreferencesProvider } from "@/lib/user-preference-store/provider"
import { UserProvider } from "@/lib/user-store/provider"
import { getUserProfile } from "@/lib/user/api"
import { ThemeProvider } from "next-themes"
import Script from "next/script"
import { LayoutClient } from "./layout-client"
import { Providers } from "./providers"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  metadataBase: new URL(APP_DOMAIN),
  title: "Not A Wrapper",
  description:
    "Not A Wrapper is an open-source, Next.js-based AI chat application that provides a unified interface for multiple models, including OpenAI, Mistral, Claude, and Gemini. BYOK-ready.",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const isDev = process.env.NODE_ENV === "development"
  const isOfficialDeployment = process.env.NAW_OFFICIAL === "true"
  const userProfile = await getUserProfile()

  return (
    <html lang="en" suppressHydrationWarning>
      {isOfficialDeployment ? (
        <Script
          defer
          src="https://assets.onedollarstats.com/stonks.js"
          {...(isDev ? { "data-debug": "not-a-wrapper.com" } : {})}
        />
      ) : null}
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <TanstackQueryProvider>
            <LayoutClient />
            <UserProvider initialUser={userProfile}>
              <ModelProvider>
                <ChatsProvider userId={userProfile?.id}>
                  <ChatSessionProvider>
                    <UserPreferencesProvider
                      userId={userProfile?.id}
                      initialPreferences={userProfile?.preferences}
                    >
                      <TooltipProvider delay={200}>
                        <ThemeProvider
                          attribute="class"
                          defaultTheme="system"
                          enableSystem
                          disableTransitionOnChange
                        >
                          <SidebarProvider defaultOpen>
                            <Toaster position="top-center" />
                            {children}
                          </SidebarProvider>
                        </ThemeProvider>
                      </TooltipProvider>
                    </UserPreferencesProvider>
                  </ChatSessionProvider>
                </ChatsProvider>
              </ModelProvider>
            </UserProvider>
          </TanstackQueryProvider>
        </Providers>
      </body>
    </html>
  )
}
