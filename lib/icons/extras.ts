/**
 * Re-exports for commonly used icons that were previously exceptions.
 * Now all icons come from HugeIcons Pro.
 *
 * @see .agents/archive/icon-mapping-phosphor-hugeicons.md for mapping details
 */

// Pin icons - exported with both new and legacy names
export { Pin02Icon as PinIcon, Pin02Icon as Pin, PinOffIcon, PinOffIcon as PinOff } from "@hugeicons-pro/core-stroke-rounded"

// Panel/Sidebar icons - Used by Shadcn sidebar
export { SidebarLeftIcon as PanelLeftIcon, SidebarLeftIcon as PanelLeft } from "@hugeicons-pro/core-stroke-rounded"

// Drag icons - Used by react-resizable-panels
export { DragDropVerticalIcon as GripVerticalIcon, DragDropVerticalIcon as GripVertical } from "@hugeicons-pro/core-stroke-rounded"
