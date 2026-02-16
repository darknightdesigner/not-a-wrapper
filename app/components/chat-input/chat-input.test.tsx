/** @vitest-environment jsdom */

import React, { act } from "react"
import { createRoot, Root } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { ChatInput } from "./chat-input"

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true
})

vi.mock("@/components/common/model-selector/base", () => ({
  ModelSelector: () => null,
}))

vi.mock("./input-drop-zone", () => ({
  InputDropZone: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock("@/components/ui/prompt-input", () => ({
  PromptInput: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PromptInputAction: ({
    children,
  }: {
    tooltip: React.ReactNode
    children: React.ReactNode
  }) => <div>{children}</div>,
  PromptInputActions: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PromptInputTextarea: React.forwardRef<
    HTMLTextAreaElement,
    React.TextareaHTMLAttributes<HTMLTextAreaElement>
  >(function PromptInputTextarea(props, ref) {
    return <textarea ref={ref} {...props} />
  }),
}))

vi.mock("../suggestions/prompt-system", () => ({
  PromptSystem: () => null,
}))

vi.mock("./button-plus-menu", () => ({
  ButtonPlusMenu: () => null,
}))

vi.mock("./file-list", () => ({
  FileList: () => null,
}))

describe("ChatInput primary action", () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  afterEach(() => {
    const rootToUnmount = root
    if (rootToUnmount) {
      act(() => {
        rootToUnmount.unmount()
      })
    }
    container?.remove()
    root = null
    container = null
  })

  it("keeps Stop actionable while streaming even with empty input", () => {
    const onSend = vi.fn()
    const stop = vi.fn()

    const mountedContainer = document.createElement("div")
    document.body.appendChild(mountedContainer)
    container = mountedContainer
    const mountedRoot = createRoot(mountedContainer)
    root = mountedRoot

    act(() => {
      mountedRoot.render(
        <ChatInput
          defaultValue=""
          onValueChange={() => {}}
          onSend={onSend}
          isSubmitting={false}
          files={[]}
          onFileUpload={() => {}}
          onFileRemove={() => {}}
          onSuggestion={() => {}}
          hasSuggestions={false}
          onSelectModel={() => {}}
          selectedModel="openai/gpt-4.1-mini"
          isUserAuthenticated
          stop={stop}
          status="streaming"
          setEnableSearch={() => {}}
          enableSearch={false}
        />
      )
    })

    const button = mountedContainer.querySelector(
      'button[aria-label="Stop"]'
    ) as HTMLButtonElement | null

    expect(button).toBeTruthy()
    expect(button?.disabled).toBe(false)

    act(() => {
      button?.click()
    })

    expect(stop).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
  })
})
