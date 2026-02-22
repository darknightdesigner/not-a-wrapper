"use client"

import { Header } from "@/app/components/layout/header"
import { AppSidebar } from "@/app/components/layout/sidebar/app-sidebar"
import { ScrollRoot } from "@/components/ui/scroll-root"
import { MultiModelSelectionProvider } from "@/lib/model-store/multi-model-provider"
import { useUserPreferences } from "@/lib/user-preference-store/provider"

export function LayoutApp({ children }: { children: React.ReactNode }) {
  const { preferences } = useUserPreferences()
  const hasSidebar = preferences.layout === "sidebar"

  return (
    <MultiModelSelectionProvider>
      <div className="flex h-svh w-full overflow-hidden">
        {hasSidebar && <AppSidebar />}
        <ScrollRoot
          className="@container/main h-svh w-0 flex-shrink flex-grow scroll-pt-[var(--spacing-app-header)] print:overflow-visible"
          style={{ scrollbarGutter: "stable both-edges" }}
        >
          <Header hasSidebar={hasSidebar} />
          <div id="main-content" className="flex min-h-[calc(100%-var(--spacing-app-header))] flex-col">
            {children}
          </div>
        </ScrollRoot>
      </div>
    </MultiModelSelectionProvider>
  )
}
