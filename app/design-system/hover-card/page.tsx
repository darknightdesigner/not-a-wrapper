import { ComponentPreview } from "@/app/design-system/_components/component-preview"
import {
  DsApiTable,
  DsPage,
  DsPageHeader,
  DsParagraph,
  DsSection,
} from "@/app/design-system/_components/ds-page"
import { readComponentSource } from "@/app/design-system/_lib/component-source"
import type { Metadata } from "next"
import { HoverCardDefaultDemo } from "./demos/hover-card-default-demo"

const apiRows = [
  {
    prop: "open / onOpenChange",
    type: "boolean / (open, eventDetails) => void",
    defaultValue: "—",
    description: "Controlled open state and its change handler, on the root.",
  },
  {
    prop: "defaultOpen",
    type: "boolean",
    defaultValue: "false",
    description: "Opens the card initially when uncontrolled.",
  },
  {
    prop: "HoverCardTrigger render",
    type: "ReactElement | render function",
    defaultValue: "—",
    description:
      "Composes the trigger onto another element, typically a link or Button.",
  },
  {
    prop: "HoverCardTrigger delay / closeDelay",
    type: "number / number",
    defaultValue: "600 / 300",
    description:
      "Milliseconds to wait before opening on hover and before closing.",
  },
  {
    prop: "HoverCardContent side",
    type: '"top" | "right" | "bottom" | "left" | ...',
    defaultValue: '"bottom"',
    description: "Which side of the trigger the card is placed on.",
  },
  {
    prop: "HoverCardContent sideOffset",
    type: "number",
    defaultValue: "4",
    description: "Distance in px between the card and the trigger.",
  },
  {
    prop: "HoverCardContent align",
    type: '"start" | "center" | "end"',
    defaultValue: '"center"',
    description: "Alignment against the trigger along the chosen side.",
  },
] as const

export const metadata: Metadata = {
  title: "Hover Card | Design System",
  description:
    "Documentation and usage for the Not A Wrapper Hover Card component.",
}

export default function HoverCardPage() {
  const hoverCardSource = readComponentSource("components/ui/hover-card.tsx")
  const defaultCode = readComponentSource(
    "app/design-system/hover-card/demos/hover-card-default-demo.tsx"
  )

  return (
    <DsPage>
      <DsPageHeader
        slug="hover-card"
        title="Hover Card"
        description="Rich preview surface that opens on hover or focus, built on the Base UI preview card. For sighted-pointer previews only — put essential actions in a Popover instead."
      />

      <DsSection
        id="default"
        title="Default"
        description="Hover or focus the trigger to open the preview after a short delay. The card stays open while the pointer is over it."
      >
        <ComponentPreview code={defaultCode} sourceCode={hoverCardSource}>
          <HoverCardDefaultDemo />
        </ComponentPreview>
      </DsSection>

      <DsSection id="api" title="API Reference">
        <DsApiTable columnWidths={[30, 26, 12, 32]} rows={apiRows} />
        <DsParagraph className="mt-3">
          Remaining Base UI Preview Card props are forwarded from each wrapper.
          HoverCardContent renders its own portal and positioner, so pages only
          compose the root, trigger, and content.
        </DsParagraph>
      </DsSection>
    </DsPage>
  )
}
