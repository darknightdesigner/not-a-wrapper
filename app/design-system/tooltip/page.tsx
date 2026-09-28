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
import { TooltipDefaultDemo } from "./demos/tooltip-default-demo"
import { TooltipMultilineDemo } from "./demos/tooltip-multiline-demo"
import { TooltipShortcutDemo } from "./demos/tooltip-shortcut-demo"

const apiRows = [
  {
    prop: "TooltipProvider delay",
    type: "fixed",
    defaultValue: "0ms",
    description:
      "Fixed by the primitive so every tooltip opens immediately and call sites cannot introduce timing drift.",
  },
  {
    prop: "Tooltip disableHoverablePopup",
    type: "boolean",
    defaultValue: "true",
    description:
      "Closes the tooltip when the pointer leaves the trigger instead of allowing it to move onto the popup.",
  },
  {
    prop: "open / onOpenChange",
    type: "boolean / (open, eventDetails) => void",
    defaultValue: "—",
    description: "Controlled open state and its change handler, on the root.",
  },
  {
    prop: "TooltipContent side",
    type: '"top" | "right" | "bottom" | "left" | ...',
    defaultValue: '"top"',
    description: "Which side of the trigger the tooltip is placed on.",
  },
  {
    prop: "TooltipContent variant",
    type: '"default" | "outline"',
    defaultValue: '"default"',
    description:
      "Dark tooltip surface, or the popover surface with a shadow border.",
  },
  {
    prop: "TooltipContent hideArrow",
    type: "boolean",
    defaultValue: "true",
    description: "Hides the caret pointing at the trigger.",
  },
  {
    prop: "TooltipMultiline",
    type: 'ComponentProps<"span">',
    defaultValue: "—",
    description:
      "Stacks related lines and applies the smaller multiline surface radius.",
  },
  {
    prop: "TooltipShortcut label / detail",
    type: "ReactNode / ReactNode",
    defaultValue: "—",
    description:
      "One accessible action phrase with Kbd children rendered in the shared shortcut capsule. Keys hide on coarse pointers.",
  },
] as const

export const metadata: Metadata = {
  title: "Tooltip | Design System",
  description:
    "Documentation and usage for the Not A Wrapper Tooltip component.",
}

export default function TooltipPage() {
  const tooltipSource = readComponentSource("components/ui/tooltip.tsx")
  const defaultCode = readComponentSource(
    "app/design-system/tooltip/demos/tooltip-default-demo.tsx"
  )
  const multilineCode = readComponentSource(
    "app/design-system/tooltip/demos/tooltip-multiline-demo.tsx"
  )
  const shortcutCode = readComponentSource(
    "app/design-system/tooltip/demos/tooltip-shortcut-demo.tsx"
  )

  return (
    <DsPage>
      <DsPageHeader
        slug="tooltip"
        title="Tooltip"
        description="Base UI tooltip with the app's dark surface, an outline variant, and a shortcut composition for keyboard hints."
      />

      <DsSection
        id="default"
        title="Default"
        description="Opens immediately from pointer hover or keyboard focus. Use it only for supplementary hints; the UI must work without ever reading a tooltip."
      >
        <ComponentPreview code={defaultCode} sourceCode={tooltipSource}>
          <TooltipDefaultDemo />
        </ComponentPreview>
      </DsSection>

      <DsSection
        id="multiline"
        title="Multiple lines"
        description="TooltipMultiline stacks related details and switches the surface from the single-line pill to a smaller corner radius."
      >
        <ComponentPreview code={multilineCode} sourceCode={tooltipSource}>
          <TooltipMultilineDemo />
        </ComponentPreview>
      </DsSection>

      <DsSection
        id="shortcut"
        title="Shortcut"
        description="TooltipShortcut announces the action and keys as one phrase, then renders the keys in the shared 18px shortcut capsule. Keys hide automatically on touch devices."
      >
        <ComponentPreview code={shortcutCode} sourceCode={tooltipSource}>
          <TooltipShortcutDemo />
        </ComponentPreview>
      </DsSection>

      <DsSection id="api" title="API Reference">
        <DsApiTable columnWidths={[28, 26, 12, 34]} rows={apiRows} />
        <DsParagraph className="mt-3">
          Remaining Base UI Tooltip props are forwarded from each wrapper.
          TooltipContent renders its own portal and positioner. TooltipProvider
          fixes the opening delay at 0ms for every tooltip.
        </DsParagraph>
      </DsSection>
    </DsPage>
  )
}
