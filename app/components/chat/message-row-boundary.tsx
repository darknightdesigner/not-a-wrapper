import { SystemMessage } from "@/components/ui/system-message"
import {
  turnRowModelsEqual,
  type TurnRowModel,
} from "@/lib/chat-messages/turn-row"
import * as Sentry from "@sentry/nextjs"
import { Component, type ErrorInfo, type ReactNode } from "react"

type MessageRowBoundaryProps = {
  model: TurnRowModel
  children: ReactNode
}

type MessageRowBoundaryState = { failed: boolean }

/**
 * Keeps a render failure inside its own message row, so one saved message
 * that cannot render (odd tool output, say) does not take down the thread on
 * every reload. Derivation failures arrive here too, through `Rethrow`. The
 * fallback keeps the row's plain text. It retries when the row model changes
 * under the Message memo contract, so a streaming row can recover while a
 * broken saved row stays put. Renders no DOM of its own.
 */
export class MessageRowBoundary extends Component<
  MessageRowBoundaryProps,
  MessageRowBoundaryState
> {
  state: MessageRowBoundaryState = { failed: false }

  static getDerivedStateFromError(): MessageRowBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack } },
    })
  }

  componentDidUpdate(
    prevProps: MessageRowBoundaryProps,
    prevState: MessageRowBoundaryState
  ) {
    // `prevState.failed` skips the update that caught the error itself.
    if (
      prevState.failed &&
      this.state.failed &&
      !turnRowModelsEqual(prevProps.model, this.props.model)
    ) {
      this.setState({ failed: false })
    }
  }

  render() {
    if (!this.state.failed) return this.props.children

    const { text } = this.props.model
    return (
      <div className="flex flex-col gap-3">
        <SystemMessage variant="error" fill role="alert">
          This message couldn&apos;t be displayed.
        </SystemMessage>
        {text ? (
          <p className="max-w-full min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap">
            {text}
          </p>
        ) : null}
      </div>
    )
  }
}

/** Throws while rendering, so an error caught outside render (the row's
 * derivation) takes the same path as a row render failure. */
export function Rethrow({ error }: { error: unknown }): never {
  throw error
}
