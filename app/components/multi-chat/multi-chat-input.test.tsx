/** @vitest-environment jsdom */

import React, { act } from "react"
import { createRoot, Root } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { MultiChatInput } from "./multi-chat-input"

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true
})

vi.mock("@/components/common/multi-model-selector/base", () => ({
  MultiModelSelector: () => null,
}))

vi.mock("@/app/components/suggestions/prompt-system", () => ({
  PromptSystem: () => null,
}))

vi.mock("@/app/components/chat-input/button-file-upload", () => ({
  ButtonFileUpload: () => null,
}))

vi.mock("@/app/components/chat-input/file-list", () => ({
  FileList: () => null,
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

describe("MultiChatInput primary action", () => {
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

  it("keeps Stop actionable during active loading regardless of send locks", () => {
    const onSend = vi.fn()
    const stop = vi.fn()

    const mountedContainer = document.createElement("div")
    document.body.appendChild(mountedContainer)
    container = mountedContainer
    const mountedRoot = createRoot(mountedContainer)
    root = mountedRoot

    act(() => {
      mountedRoot.render(
        <MultiChatInput
          value=""
          onValueChange={() => {}}
          onSuggestion={() => {}}
          hasSuggestions={false}
          onSend={onSend}
          isSubmitting
          files={[]}
          onFileUpload={() => {}}
          onFileRemove={() => {}}
          selectedModelIds={[]}
          onSelectedModelIdsChange={() => {}}
          isUserAuthenticated
          fileUploadState="supported"
          fileUploadModelId="openai/gpt-4.1-mini"
          stop={stop}
          status="streaming"
          anyLoading
          enableSearch={false}
          setEnableSearch={() => {}}
          searchSupportState="supported"
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
