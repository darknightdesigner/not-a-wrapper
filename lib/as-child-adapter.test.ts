import { describe, it, expect } from "vitest"
import { createElement, type ReactElement } from "react"
import { adaptAsChild, adaptSlotAsChild } from "./as-child-adapter"

// ---------------------------------------------------------------------------
// adaptAsChild
// ---------------------------------------------------------------------------

describe("adaptAsChild", () => {
  describe("when asChild is falsy", () => {
    it("returns children unchanged when asChild is undefined", () => {
      const children = createElement("span", null, "hello")
      const result = adaptAsChild(undefined, children)

      expect(result.render).toBeUndefined()
      expect(result.children).toBe(children)
    })

    it("returns children unchanged when asChild is false", () => {
      const children = createElement("span", null, "hello")
      const result = adaptAsChild(false, children)

      expect(result.render).toBeUndefined()
      expect(result.children).toBe(children)
    })

    it("passes through string children unchanged", () => {
      const result = adaptAsChild(false, "plain text")

      expect(result.render).toBeUndefined()
      expect(result.children).toBe("plain text")
    })
  })

  describe("when asChild is true", () => {
    it("extracts single valid React element as render prop", () => {
      const innerChildren = "button text"
      const child = createElement("a", { href: "/test" }, innerChildren)
      const result = adaptAsChild(true, child)

      expect(result.render).toBeDefined()
      expect((result.render as ReactElement).type).toBe("a")
      expect(
        (result.render as ReactElement<{ href: string }>).props.href
      ).toBe("/test")
      expect(result.children).toBe(innerChildren)
    })

    it("extracts nested element children", () => {
      const nested = createElement("span", null, "nested")
      const child = createElement("div", { className: "wrapper" }, nested)
      const result = adaptAsChild(true, child)

      expect(result.render).toBeDefined()
      expect((result.render as ReactElement).type).toBe("div")
      expect(result.children).toBe(nested)
    })

    it("handles element with no children", () => {
      const child = createElement("button", { type: "submit" })
      const result = adaptAsChild(true, child)

      expect(result.render).toBeDefined()
      expect((result.render as ReactElement).type).toBe("button")
      expect(result.children).toBeUndefined()
    })

    it("gracefully falls back for non-element child (string)", () => {
      const result = adaptAsChild(true, "plain text")

      expect(result.render).toBeUndefined()
      expect(result.children).toBe("plain text")
    })

    it("gracefully falls back for multiple children", () => {
      const children = [
        createElement("span", { key: "1" }, "a"),
        createElement("span", { key: "2" }, "b"),
      ]
      const result = adaptAsChild(true, children)

      expect(result.render).toBeUndefined()
      expect(result.children).toBe(children)
    })
  })
})

// ---------------------------------------------------------------------------
// adaptSlotAsChild
// ---------------------------------------------------------------------------

describe("adaptSlotAsChild", () => {
  describe("when asChild is falsy", () => {
    it("returns default button element when asChild is false", () => {
      const children = "Click me"
      const result = adaptSlotAsChild(false, children)

      expect(result.render).toBeDefined()
      expect((result.render as ReactElement).type).toBe("button")
      expect(result.children).toBe(children)
    })

    it("returns default button element when asChild is undefined", () => {
      const children = "Click me"
      const result = adaptSlotAsChild(undefined, children)

      expect(result.render).toBeDefined()
      expect((result.render as ReactElement).type).toBe("button")
      expect(result.children).toBe(children)
    })

    it("uses custom defaultTag when provided", () => {
      const children = "Link text"
      const result = adaptSlotAsChild(false, children, "a")

      expect((result.render as ReactElement).type).toBe("a")
      expect(result.children).toBe(children)
    })

    it("supports span as defaultTag", () => {
      const children = "Badge text"
      const result = adaptSlotAsChild(false, children, "span")

      expect((result.render as ReactElement).type).toBe("span")
      expect(result.children).toBe(children)
    })

    it("supports div as defaultTag", () => {
      const result = adaptSlotAsChild(false, "content", "div")

      expect((result.render as ReactElement).type).toBe("div")
    })
  })

  describe("when asChild is true", () => {
    it("extracts single valid React element as render prop", () => {
      const innerChildren = "link text"
      const child = createElement("a", { href: "/home" }, innerChildren)
      const result = adaptSlotAsChild(true, child)

      expect(result.render).toBeDefined()
      expect((result.render as ReactElement).type).toBe("a")
      expect(
        (result.render as ReactElement<{ href: string }>).props.href
      ).toBe("/home")
      expect(result.children).toBe(innerChildren)
    })

    it("extracts element with complex children", () => {
      const icon = createElement("svg", { key: "icon" })
      const text = "Submit"
      const child = createElement("a", { href: "/submit" }, icon, text)
      const result = adaptSlotAsChild(true, child)

      expect((result.render as ReactElement).type).toBe("a")
      // children is the raw children prop — with multiple children it's an array
      expect(result.children).toBeDefined()
    })

    it("gracefully falls back for non-element child (string)", () => {
      const result = adaptSlotAsChild(true, "plain text")

      expect(result.render).toBeDefined()
      expect((result.render as ReactElement).type).toBe("button")
      expect(result.children).toBe("plain text")
    })

    it("gracefully falls back for multiple children", () => {
      const children = [
        createElement("span", { key: "1" }, "a"),
        createElement("span", { key: "2" }, "b"),
      ]
      const result = adaptSlotAsChild(true, children)

      expect(result.render).toBeDefined()
      expect((result.render as ReactElement).type).toBe("button")
      expect(result.children).toBe(children)
    })
  })
})
