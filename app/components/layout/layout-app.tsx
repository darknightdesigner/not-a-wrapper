"use client"

import { Header } from "@/app/components/layout/header"
import { AppSidebar } from "@/app/components/layout/sidebar/app-sidebar"
import { useUserPreferences } from "@/lib/user-preference-store/provider"

export function LayoutApp({ children }: { children: React.ReactNode }) {
  const { preferences } = useUserPreferences()
  const hasSidebar = preferences.layout === "sidebar"

  return (
    <div className="bg-background flex h-svh w-full overflow-hidden">
      {hasSidebar && <AppSidebar />}
      <main className="@container/main relative flex h-svh w-0 flex-shrink flex-grow flex-col overflow-hidden">
        <Header hasSidebar={hasSidebar} />
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  )
}
