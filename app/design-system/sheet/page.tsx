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
import { SheetDefaultDemo } from "./demos/sheet-default-demo"
import { SheetSidesDemo } from "./demos/sheet-sides-demo"

const apiRows = [
  {
    prop: "open / onOpenChange",
    type: "boolean / (open, eventDetails) => void",
    defaultValue: "—",
    description: "Controlled open state and its change handler, on the root.",
  },
  {
    prop: "SheetTrigger render",
    type: "ReactElement | render function",
    defaultValue: "—",
    description:
      "Composes the trigger onto another element, typically a Button.",
  },
  {
    prop: "SheetContent side",
    type: '"top" | "right" | "bottom" | "left"',
    defaultValue: '"right"',
    description: "Edge of the viewport the sheet slides in from.",
  },
  {
    prop: "SheetContent showCloseButton",
    type: "boolean",
    defaultValue: "true",
    description: "Renders the ghost close button in the top-right corner.",
  },
  {
    prop: "SheetContent overlayClassName",
    type: "string",
    defaultValue: "—",
    description: "Optional class merged onto the backdrop overlay.",
  },
] as const

export const metadata: Metadata = {
  title: "Sheet | Design System",
  description: "Documentation and usage for the Not A Wrapper Sheet component.",
}

export default function SheetPage() {
  const sheetSource = readComponentSource("components/ui/sheet.tsx")
  const defaultCode = readComponentSource(
    "app/design-system/sheet/demos/sheet-default-demo.tsx"
  )
  const sidesCode = readComponentSource(
    "app/design-system/sheet/demos/sheet-sides-demo.tsx"
  )

  return (
    <DsPage>
      <DsPageHeader
        slug="sheet"
        title="Sheet"
        description="Edge-anchored panel that slides over the page, built on the Base UI dialog with side variants and a scrim backdrop."
      />

      <DsSection
        id="default"
        title="Default"
        description="Slides in from the right. Header and footer pad their own content; the top-right close button ships by default."
      >
        <ComponentPreview code={defaultCode} sourceCode={sheetSource}>
          <SheetDefaultDemo />
        </ComponentPreview>
      </DsSection>

      <DsSection
        id="sides"
        title="Sides"
        description="The side prop anchors the sheet to any viewport edge. Left and right sheets are full-height; top and bottom size to their content."
      >
        <ComponentPreview code={sidesCode} sourceCode={sheetSource}>
          <SheetSidesDemo />
        </ComponentPreview>
      </DsSection>

      <DsSection id="api" title="API Reference">
        <DsApiTable columnWidths={[26, 26, 12, 36]} rows={apiRows} />
        <DsParagraph className="mt-3">
          Remaining Base UI Dialog props are forwarded from each wrapper.
          SheetContent renders its own portal and overlay, so pages only compose
          the root, trigger, and content.
        </DsParagraph>
      </DsSection>
    </DsPage>
  )
}
