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
import { DrawerDefaultDemo } from "./demos/drawer-default-demo"
import { DrawerDirectionDemo } from "./demos/drawer-direction-demo"

const apiRows = [
  {
    prop: "direction",
    type: '"top" | "bottom" | "left" | "right"',
    defaultValue: '"bottom"',
    description:
      "Edge the drawer slides in from and the axis it can be dragged along.",
  },
  {
    prop: "open / onOpenChange",
    type: "boolean / (open) => void",
    defaultValue: "—",
    description: "Controlled open state and its change handler, on the root.",
  },
  {
    prop: "dismissible",
    type: "boolean",
    defaultValue: "true",
    description:
      "When false, dragging and outside interaction cannot close the drawer.",
  },
  {
    prop: "modal",
    type: "boolean",
    defaultValue: "true",
    description: "Blocks interaction with the rest of the page while open.",
  },
  {
    prop: "snapPoints",
    type: "(number | string)[]",
    defaultValue: "—",
    description:
      "Heights the drawer can rest at, as viewport fractions or px values.",
  },
] as const

export const metadata: Metadata = {
  title: "Drawer | Design System",
  description:
    "Documentation and usage for the Not A Wrapper Drawer component.",
}

export default function DrawerPage() {
  const drawerSource = readComponentSource("components/ui/drawer.tsx")
  const defaultCode = readComponentSource(
    "app/design-system/drawer/demos/drawer-default-demo.tsx"
  )
  const directionCode = readComponentSource(
    "app/design-system/drawer/demos/drawer-direction-demo.tsx"
  )

  return (
    <DsPage>
      <DsPageHeader
        slug="drawer"
        title="Drawer"
        description="Draggable panel built on vaul-base. Prefer it over Sheet on touch surfaces, where swipe-to-dismiss is the expected gesture."
      />

      <DsSection
        id="default"
        title="Default"
        description="Slides up from the bottom with a drag handle. Drag down or click the backdrop to dismiss."
      >
        <ComponentPreview code={defaultCode} sourceCode={drawerSource}>
          <DrawerDefaultDemo />
        </ComponentPreview>
      </DsSection>

      <DsSection
        id="direction"
        title="Direction"
        description="The direction prop on the root anchors the drawer to any viewport edge. The drag handle only renders for bottom drawers."
      >
        <ComponentPreview code={directionCode} sourceCode={drawerSource}>
          <DrawerDirectionDemo />
        </ComponentPreview>
      </DsSection>

      <DsSection id="api" title="API Reference">
        <DsApiTable columnWidths={[22, 30, 12, 36]} rows={apiRows} />
        <DsParagraph className="mt-3">
          Remaining vaul-base Root props (snap point control, scale background,
          nested drawers) are forwarded from the Drawer wrapper. DrawerContent
          renders its own portal and overlay.
        </DsParagraph>
      </DsSection>
    </DsPage>
  )
}
