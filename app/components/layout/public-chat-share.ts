import {
  shareTarget,
  type ShareTargetOutcome,
} from "@/lib/browser/share-target"
import { APP_DOMAIN } from "@/lib/config"

const PUBLIC_CHAT_SHARE_TITLE =
  "Check out this conversation I shared with Not A Wrapper!"

/** Link and post text for a share link id (ADR-0043), never a chat id. */
export function getPublicChatShareDetails(shareId: string) {
  const publicLink = `${APP_DOMAIN}/share/${shareId}`
  const postText = `${PUBLIC_CHAT_SHARE_TITLE} ${publicLink}`
  return {
    postText,
    publicLink,
    shareTarget: { title: postText, url: publicLink } satisfies ShareData,
    xIntentUrl: `https://x.com/intent/tweet?text=${encodeURIComponent(postText)}`,
  }
}

type SharePublishedChatOptions = {
  /** Creates or refreshes the share link and resolves its id. */
  publish: () => Promise<string>
  openFallback: (shareId: string) => void
}

/**
 * Publishes first, then uses native share when supported and the existing
 * custom surface otherwise. Dismissal is a user
 * decision, while a capability or operational failure opens the fallback.
 */
export async function sharePublishedChat({
  publish,
  openFallback,
}: SharePublishedChatOptions): Promise<ShareTargetOutcome> {
  const shareId = await publish()
  const outcome = await shareTarget(
    getPublicChatShareDetails(shareId).shareTarget
  )
  if (outcome === "unsupported" || outcome === "failed") openFallback(shareId)
  return outcome
}
