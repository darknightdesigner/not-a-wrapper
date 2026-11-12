/** @vitest-environment jsdom */

import { FileUpload } from "@/components/ui/file-upload"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ButtonPlusMenu } from "./button-plus-menu"

const breakpointMocks = vi.hoisted(() => ({ isTouch: false }))

vi.mock("@/hooks/use-mobile-device-os", () => ({
  useIsMobileDeviceOs: () => breakpointMocks.isTouch,
}))
vi.mock("@/app/auth/_components/auth-modal", () => ({
  AuthModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="auth-modal" /> : null,
}))

describe("ButtonPlusMenu editor-owned interaction", () => {
  let container: HTMLDivElement
  let root: Root
  let scrollIntoView: ReturnType<typeof vi.fn>

  beforeEach(() => {
    breakpointMocks.isTouch = false
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    scrollIntoView = vi.fn()
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it("shows inherent search as selected and non-toggleable", () => {
    const onToggleSearch = vi.fn()
    act(() => {
      root.render(
        <FileUpload onFilesAdded={() => {}}>
          <form data-type="unified-composer">
            <div id="prompt-textarea" role="textbox" tabIndex={0} />
            <ButtonPlusMenu
              actionQuery={{
                from: 1,
                id: 1,
                query: "web",
                to: 5,
                trigger: "@",
              }}
              connectors={[]}
              enableSearch
              acceptsImages
              searchMode="always-on"
              isUserAuthenticated
              onToggleSearch={onToggleSearch}
            />
            <div data-composer-overlay-host />
          </form>
        </FileUpload>
      )
    })

    const row = Array.from(
      container.querySelectorAll<HTMLElement>("[aria-disabled=true]")
    ).find((item) => item.textContent?.includes("Web search always on"))
    expect(row?.textContent).toContain("Find real-time news and info")
    expect(row?.getAttribute("aria-checked")).toBe("true")
    expect(row?.querySelector("[data-composer-action-check]")).not.toBeNull()
    act(() => row?.click())
    expect(onToggleSearch).not.toHaveBeenCalled()
  })

  it("renders connector rows with skeleton loading and slash scoping", () => {
    const onActivateConnector = vi.fn(() => true)
    const renderMenu = (
      actionQuery: React.ComponentProps<typeof ButtonPlusMenu>["actionQuery"],
      connectors: React.ComponentProps<typeof ButtonPlusMenu>["connectors"]
    ) => {
      act(() => {
        root.render(
          <FileUpload onFilesAdded={() => {}}>
            <form data-type="unified-composer">
              <div id="prompt-textarea" role="textbox" tabIndex={0} />
              <ButtonPlusMenu
                actionQuery={actionQuery}
                connectors={connectors}
                enableSearch={false}
                acceptsImages
                searchMode="optional"
                isUserAuthenticated
                onActivateConnector={onActivateConnector}
                onToggleSearch={() => {}}
              />
              <div data-composer-overlay-host />
            </form>
          </FileUpload>
        )
      })
    }

    const emptyQuery = {
      from: 1,
      id: 1,
      query: "",
      to: 2,
      trigger: "@",
    } as const

    // Loading uses one shimmer row while connector suggestions resolve.
    renderMenu(emptyQuery, undefined)
    const skeleton = container.querySelector(
      "[data-composer-menu-skeleton]"
    ) as HTMLElement
    expect(skeleton).not.toBeNull()
    expect(skeleton.getAttribute("aria-hidden")).toBe("true")
    expect(skeleton.getAttribute("role")).toBeNull()
    expect(skeleton.closest('[aria-busy="true"]')).not.toBeNull()

    const github = {
      id: "srv1",
      name: "GitHub",
      description: "mcp.github.dev",
      enabled: false,
    }
    renderMenu(emptyQuery, [github])
    expect(container.querySelector("[data-composer-menu-skeleton]")).toBeNull()
    expect(container.textContent).toContain("GitHub")
    expect(container.textContent).toContain("mcp.github.dev")

    // The connector query matches by name, and activation reports the
    // published query so the composer can consume the trigger text.
    const typedQuery = {
      from: 1,
      id: 2,
      query: "gith",
      to: 6,
      trigger: "@",
    } as const
    renderMenu(typedQuery, [github])
    expect(container.textContent).not.toContain("Add photos & files")
    const editor = container.querySelector("#prompt-textarea") as HTMLElement
    act(() => {
      editor.focus()
      editor.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        })
      )
    })
    expect(onActivateConnector).toHaveBeenCalledWith("srv1", typedQuery)

    // "/" is the command menu: actions only, no connectors, no hint row.
    renderMenu(
      {
        from: 1,
        id: 3,
        query: "",
        to: 2,
        trigger: "/",
      },
      [github]
    )
    expect(container.textContent).toContain("Add photos & files")
    expect(container.textContent).not.toContain("GitHub")
    expect(container.querySelector("[data-composer-menu-hint]")).toBeNull()
  })

  it("opens the + menu with native menu semantics and keyboard containment", () => {

    act(() => {
      root.render(
        <FileUpload onFilesAdded={() => {}}>
          <form data-type="unified-composer">
            <div id="prompt-textarea" role="textbox" tabIndex={0} />
            <ButtonPlusMenu
              enableSearch={false}
              acceptsImages
              searchMode="optional"
              isUserAuthenticated
              onToggleSearch={() => {}}
            />
            <div data-composer-overlay-host />
          </form>
        </FileUpload>
      )
    })

    const trigger = container.querySelector(
      '[aria-label="Add files and more"]'
    ) as HTMLButtonElement

    act(() => {
      trigger.focus()
      trigger.click()
    })

    const menu = document.body.querySelector<HTMLElement>(
      '[data-slot="dropdown-menu-content"]'
    )
    const filesItem = menu?.querySelector<HTMLElement>(
      '[data-slot="dropdown-menu-item"]'
    )
    const webSearchItem = menu?.querySelector<HTMLElement>(
      '[data-slot="dropdown-menu-radio-item"]'
    )

    expect(menu?.getAttribute("role")).toBe("menu")
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(menu?.getAttribute("data-content-appearance")).toBeNull()
    expect(filesItem?.getAttribute("role")).toBe("menuitem")
    expect(filesItem?.textContent).toBe("Add photos & files")
    expect(menu?.textContent).not.toContain("Upload from computer")
    expect(webSearchItem?.getAttribute("role")).toBe("menuitemradio")
    expect(webSearchItem?.getAttribute("aria-checked")).toBe("false")

    let tabWasAllowed = true
    act(() => {
      filesItem?.focus()
      tabWasAllowed = filesItem?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Tab",
        })
      ) ?? true
    })

    expect(tabWasAllowed).toBe(false)
    expect(document.activeElement).toBe(filesItem)
    expect(menu?.hasAttribute("data-open")).toBe(true)
  })

  it("renders touch actions and routes their native inputs on mobile-OS devices", () => {
    breakpointMocks.isTouch = true
    const onFilesAdded = vi.fn()

    act(() => {
      root.render(
        <FileUpload onFilesAdded={onFilesAdded}>
          <form data-type="unified-composer">
            <div id="prompt-textarea" role="textbox" tabIndex={0} />
            <ButtonPlusMenu
              enableSearch={false}
              acceptsImages
              searchMode="optional"
              isUserAuthenticated
              connectors={[
                {
                  id: "github",
                  name: "GitHub",
                  description: "github.com",
                  enabled: true,
                },
              ]}
              onToggleConnector={() => {}}
              onToggleSearch={() => {}}
            />
            <div data-composer-overlay-host />
          </form>
        </FileUpload>
      )
    })

    const trigger = container.querySelector(
      '[aria-label="Add files and more"]'
    ) as HTMLButtonElement
    act(() => {
      trigger.focus()
      trigger.click()
    })

    const menu = document.body.querySelector<HTMLElement>(
      '[data-slot="dropdown-menu-content"]'
    )
    expect(menu?.getAttribute("data-content-appearance")).toBe(
      "touch-optimized"
    )
    const rows = menu?.querySelectorAll(
      '[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]'
    )
    const labels = [...(rows ?? [])].map((node) => node.textContent)
    expect(labels).toEqual([
      "Camera",
      "Photos",
      "Files",
      "Web search",
      "GitHub",
    ])
    const connectorRow = [...(rows ?? [])].find(
      (row) => row.textContent === "GitHub"
    ) as HTMLElement
    expect(connectorRow.getAttribute("role")).toBe("menuitemcheckbox")
    expect(connectorRow.getAttribute("aria-checked")).toBe("true")

    const cameraInput = container.querySelector<HTMLInputElement>(
      '[data-testid="composer-upload-camera-input"]'
    )
    const photosInput = container.querySelector<HTMLInputElement>(
      '[data-testid="composer-upload-photos-input"]'
    )
    expect(cameraInput?.getAttribute("accept")).toBe("image/*")
    expect(cameraInput?.id).toBe("upload-camera")
    expect(cameraInput?.getAttribute("capture")).toBe("environment")
    expect(cameraInput?.multiple).toBe(true)
    expect(photosInput?.getAttribute("accept")).toBe("image/*")
    expect(photosInput?.id).toBe("upload-photos")
    expect(photosInput?.hasAttribute("capture")).toBe(false)

    const cameraClick = vi.spyOn(cameraInput!, "click")
    const cameraRow = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].find(
      (row) => row.textContent === "Camera"
    ) as HTMLElement
    act(() => cameraRow.click())
    expect(cameraClick).toHaveBeenCalledTimes(1)

    // Picked files feed the shared added-files pipeline and reset the input.
    const file = new File(["x"], "shot.png", { type: "image/png" })
    Object.defineProperty(photosInput!, "files", {
      configurable: true,
      value: { length: 1, 0: file, item: () => file, [Symbol.iterator]: [file][Symbol.iterator].bind([file]) },
    })
    act(() => {
      photosInput!.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(onFilesAdded).toHaveBeenCalledWith([file])
  })

  it("toggles real connectors from the + menu", () => {
    breakpointMocks.isTouch = true
    const onToggleConnector = vi.fn()

    act(() => {
      root.render(
        <FileUpload onFilesAdded={() => {}}>
          <form data-type="unified-composer">
            <div id="prompt-textarea" role="textbox" tabIndex={0} />
            <ButtonPlusMenu
              connectors={[
                {
                  id: "github",
                  name: "GitHub",
                  description: "github.com",
                  enabled: false,
                },
              ]}
              enableSearch={false}
              acceptsImages
              searchMode="optional"
              isUserAuthenticated
              onToggleConnector={onToggleConnector}
              onToggleSearch={() => {}}
            />
            <div data-composer-overlay-host />
          </form>
        </FileUpload>
      )
    })

    const trigger = container.querySelector(
      '[aria-label="Add files and more"]'
    ) as HTMLButtonElement
    act(() => trigger.click())

    const connectorRow = [...document.body.querySelectorAll('[role="menuitemcheckbox"]')].find(
      (row) => row.textContent === "GitHub"
    ) as HTMLElement
    expect(connectorRow.getAttribute("aria-checked")).toBe("false")
    act(() => connectorRow.click())
    expect(onToggleConnector).toHaveBeenCalledWith("github")
  })

  it("lets guests toggle web search and asks them to sign in for files", () => {
    breakpointMocks.isTouch = true
    const onToggleSearch = vi.fn()
    const onFilesAdded = vi.fn()

    act(() => {
      root.render(
        <FileUpload onFilesAdded={onFilesAdded}>
          <form data-type="unified-composer">
            <div id="prompt-textarea" role="textbox" tabIndex={0} />
            <ButtonPlusMenu
              connectors={[]}
              enableSearch={false}
              acceptsImages
              searchMode="optional"
              isUserAuthenticated={false}
              onToggleSearch={onToggleSearch}
            />
            <div data-composer-overlay-host />
          </form>
        </FileUpload>
      )
    })

    const trigger = container.querySelector(
      '[aria-label="Add files and more"]'
    ) as HTMLButtonElement
    const findRow = (label: string) =>
      [...document.body.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find(
        (row) => row.textContent?.includes(label)
      )

    act(() => trigger.click())
    expect(findRow("Camera")).toBeUndefined()
    act(() => findRow("Web search")?.click())
    expect(onToggleSearch).toHaveBeenCalledWith(true)

    act(() => trigger.click())
    act(() => findRow("Files")?.click())
    expect(
      document.body.querySelector('[data-testid="auth-modal"]')
    ).not.toBeNull()
  })

  it("keeps @ discovery editor-owned across filtering, Escape, and Tab activation", () => {
    const onActivateActionQuery = vi.fn(() => true)
    const renderMenu = (
      actionQuery: React.ComponentProps<typeof ButtonPlusMenu>["actionQuery"]
    ) => {
      act(() => {
        root.render(
          <FileUpload onFilesAdded={() => {}}>
            <form data-type="unified-composer">
              <div id="prompt-textarea" role="textbox" tabIndex={0} />
              <ButtonPlusMenu
                actionQuery={actionQuery}
                connectors={[]}
                enableSearch={false}
                acceptsImages
                searchMode="optional"
                isUserAuthenticated
                onActivateActionQuery={onActivateActionQuery}
                onToggleSearch={() => {}}
              />
              <div data-composer-overlay-host />
            </form>
          </FileUpload>
        )
      })
    }

    renderMenu(null)
    const editor = container.querySelector("#prompt-textarea") as HTMLElement
    act(() => editor.focus())

    renderMenu({
      from: 1,
      id: 7,
      query: "",
      to: 2,
      trigger: "@",
    })
    expect(container.querySelector("[data-highlighted]")?.textContent).toContain(
      "Add photos & files"
    )
    expect(container.textContent).toContain("Web search")
    expect(document.activeElement).toBe(editor)

    act(() => {
      editor.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Escape",
        })
      )
    })
    expect(container.querySelector("[data-highlighted]")).toBeNull()

    renderMenu({
      from: 1,
      id: 7,
      query: "w",
      to: 3,
      trigger: "@",
    })
    expect(container.querySelector("[data-highlighted]")).toBeNull()

    renderMenu(null)
    renderMenu({
      from: 1,
      id: 8,
      query: "w",
      to: 3,
      trigger: "@",
    })
    expect(container.querySelector("[data-highlighted]")?.textContent).toContain(
      "Web search"
    )
    expect(container.textContent).not.toContain("Add photos & files")

    act(() => {
      editor.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Tab",
        })
      )
    })
    expect(onActivateActionQuery).toHaveBeenCalledWith("web-search", {
      from: 1,
      id: 8,
      query: "w",
      to: 3,
      trigger: "@",
    })
    expect(container.querySelector("[data-highlighted]")).toBeNull()
    expect(document.activeElement).toBe(editor)
  })
})
