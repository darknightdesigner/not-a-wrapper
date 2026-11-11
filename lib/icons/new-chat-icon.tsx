import { createIcon } from "./create-icon"

/**
 * Plus sized to claude.ai's sidebar New icon (13px at the sidebar's 18px
 * glyph), with the 2-unit (1.5px) line of our Remix icons.
 */
export const NewChatIcon = createIcon(
  <path
    d="M12 3.333V20.667M3.333 12H20.667"
    stroke="currentColor"
    strokeWidth="2"
  />,
  { displayName: "NewChatIcon" }
)
