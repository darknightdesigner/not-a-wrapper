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
import { DropdownMenuDefaultDemo } from "./demos/dropdown-menu-default-demo"
import { DropdownMenuSelectionDemo } from "./demos/dropdown-menu-selection-demo"

const apiRows = [
  {
    prop: "DropdownMenu open / onOpenChange",
    type: "boolean / (open, eventDetails) => void",
    defaultValue: "—",
    description:
      "Controlled open state on the root. Use defaultOpen when uncontrolled.",
  },
  {
    prop: "DropdownMenuTrigger render",
    type: "ReactElement | render function",
    defaultValue: "<button>",
    description:
      "Element rendered as the trigger (Base UI render prop, not asChild).",
  },
  {
    prop: "DropdownMenuContent align / side",
    type: '"start" | "center" | "end" / "top" | "bottom" | "left" | "right"',
    defaultValue: '"start" / "bottom"',
    description:
      "Placement relative to the trigger, with alignOffset (0) and sideOffset (4) fine-tuning.",
  },
  {
    prop: "DropdownMenuContent animated",
    type: "boolean",
    defaultValue: "false",
    description: "Opt-in 100ms opacity fade on open and close.",
  },
  {
    prop: "DropdownMenuItem variant",
    type: '"default" | "destructive"',
    defaultValue: '"default"',
    description: "Destructive items render in the destructive color.",
  },
  {
    prop: "DropdownMenuItem inset",
    type: "boolean",
    defaultValue: "—",
    description:
      "Pads the left edge to align with checkbox and radio indicators.",
  },
  {
    prop: "DropdownMenuCheckboxItem checked",
    type: "boolean",
    defaultValue: "—",
    description:
      "Controlled checked state with onCheckedChange. Use defaultChecked when uncontrolled.",
  },
  {
    prop: "DropdownMenuRadioGroup value",
    type: "any",
    defaultValue: "—",
    description:
      "Controlled selected value with onValueChange. Use defaultValue when uncontrolled.",
  },
] as const

export const metadata: Metadata = {
  title: "Dropdown Menu | Design System",
  description:
    "Documentation and usage examples for the Not A Wrapper Dropdown Menu component.",
}

export default function DropdownMenuPage() {
  const dropdownMenuSource = readComponentSource(
    "components/ui/dropdown-menu.tsx"
  )
  const defaultCode = readComponentSource(
    "app/design-system/dropdown-menu/demos/dropdown-menu-default-demo.tsx"
  )
  const selectionCode = readComponentSource(
    "app/design-system/dropdown-menu/demos/dropdown-menu-selection-demo.tsx"
  )

  return (
    <DsPage>
      <DsPageHeader
        slug="dropdown-menu"
        title="Dropdown Menu"
        description="Base UI menu opened from a trigger, with items, groups, submenus, and checkbox or radio selection."
      />

      <DsSection
        id="default"
        title="Default"
        description="A trigger button opening a menu of actions: grouped items with icons and shortcuts, a submenu, and a destructive item."
      >
        <ComponentPreview code={defaultCode} sourceCode={dropdownMenuSource}>
          <DropdownMenuDefaultDemo />
        </ComponentPreview>
      </DsSection>

      <DsSection
        id="selection"
        title="Checkbox and radio items"
        description="Menus can carry persistent selection: checkbox items toggle independently, radio items pick one value per group."
      >
        <ComponentPreview code={selectionCode} sourceCode={dropdownMenuSource}>
          <DropdownMenuSelectionDemo />
        </ComponentPreview>
      </DsSection>

      <DsSection id="api" title="API Reference">
        <DsApiTable columnWidths={[26, 26, 12, 36]} rows={apiRows} />
        <DsParagraph className="mt-3">
          Content width tracks the trigger via --anchor-width by default; pass a
          width class to override. Remaining Base UI Menu props are forwarded
          from each wrapper.
        </DsParagraph>
      </DsSection>
    </DsPage>
  )
}
