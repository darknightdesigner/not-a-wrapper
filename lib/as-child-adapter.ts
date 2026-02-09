// lib/as-child-adapter.ts
// Compatibility shim: translates the asChild prop to Base UI's render prop.
// This allows existing app code using <Component asChild> to continue working.
//
// Deprecation plan: remove this file once all app/ call sites migrate to render prop.

import {
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react"

/**
 * Converts an asChild + children pair into a Base UI render prop.
 *
 * Usage in wrapper components:
 * ```tsx
 * function MyTrigger({ asChild, children, ...props }) {
 *   const adapted = adaptAsChild(asChild, children)
 *   return <BaseUI.Trigger render={adapted.render} {...props}>{adapted.children}</BaseUI.Trigger>
 * }
 * ```
 *
 * When asChild is false/undefined: returns { children } unchanged (no render prop).
 * When asChild is true: extracts the single child element as render, passes its children through.
 */
export function adaptAsChild(
  asChild: boolean | undefined,
  children: ReactNode,
): { render?: ReactElement; children: ReactNode } {
  if (!asChild || !isValidElement(children)) {
    return { children }
  }
  // Base UI's render prop accepts a ReactElement.
  // The child's own children become the content rendered inside.
  return {
    render: children as ReactElement,
    children: (children.props as { children?: ReactNode }).children,
  }
}

/**
 * For components that use Slot for polymorphic rendering (Button, Badge, etc.).
 * Replaces the `const Comp = asChild ? Slot : "element"` pattern.
 *
 * Usage:
 * ```tsx
 * function Button({ asChild = false, children, className, ...props }) {
 *   const adapted = adaptSlotAsChild(asChild, children, "button")
 *   return useRender({
 *     render: adapted.render,
 *     props: { className, ...props, children: adapted.children },
 *   })
 * }
 * ```
 */
export function adaptSlotAsChild(
  asChild: boolean | undefined,
  children: ReactNode,
  defaultTag: keyof React.JSX.IntrinsicElements = "button",
): { render: ReactElement; children: ReactNode } {
  if (asChild && isValidElement(children)) {
    return {
      render: children as ReactElement,
      children: (children.props as { children?: ReactNode }).children,
    }
  }
  // Create the default element — useRender will apply props to it
  return {
    render: createElement(defaultTag) as ReactElement,
    children,
  }
}
