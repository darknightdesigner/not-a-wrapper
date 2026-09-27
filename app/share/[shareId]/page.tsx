import { api } from "@/convex/_generated/api"
import { isShareId } from "@/convex/domain/share_view"
import { APP_DOMAIN } from "@/lib/config"
import { ConvexHttpClient } from "convex/browser"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"
import Article from "./article"

export const dynamic = "force-dynamic"

type ShareRouteProps = { params: Promise<{ shareId: string }> }

function getConvexClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL is not set. Please configure it in your environment variables."
    )
  }
  return new ConvexHttpClient(url)
}

// One read per request, shared by the metadata and the page. A malformed id,
// a revoked link, or a query error all read as not found.
const getSharedChat = cache(async (shareId: string) => {
  if (!isShareId(shareId)) return null
  const convex = getConvexClient()
  try {
    return await convex.query(api.shares.getPublic, { shareId })
  } catch {
    return null
  }
})

export async function generateMetadata({
  params,
}: ShareRouteProps): Promise<Metadata> {
  const { shareId } = await params
  const chat = await getSharedChat(shareId)
  const title = chat?.title || "Shared Chat"
  const description = chat?.title
    ? `Read this conversation: ${chat.title}`
    : "A conversation in Not A Wrapper"

  return {
    title,
    description,
    // Unlisted: link previews keep working, search engines never index it.
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: "article",
      url: `${APP_DOMAIN}/share/${shareId}`,
      images: [],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [],
    },
  }
}

export default async function ShareChat({ params }: ShareRouteProps) {
  const { shareId } = await params
  const chat = await getSharedChat(shareId)
  if (!chat) notFound()

  return (
    <Article
      messages={chat.messages}
      date={new Date(chat.createdAt).toISOString()}
      title={chat.title || "Shared Chat"}
      subtitle="A conversation in Not A Wrapper"
    />
  )
}
