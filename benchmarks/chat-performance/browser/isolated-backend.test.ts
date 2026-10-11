import { expect, it } from "vitest"
import { functionReferences, missingFunctions, retargetEnvFile, servedFunctions } from "./isolated-backend"

it("names the client's public function references the backend does not serve", () => {
  const source = [
    'const live = useQuery(api.messages.getLiveMessage, { chatId })',
    "type Args = FunctionArgs<typeof api.files.deleteFile._args>",
    "await ctx.runQuery(api.domain.runs.latest, {})",
    'telemetry({ functionId: "api.chat.streamText" })',
    "// Old call: api.messages.retired",
    "const modules = api.messages",
  ].join("\n")
  expect(functionReferences(source).sort()).toEqual(["domain/runs:latest", "files:deleteFile", "messages:getLiveMessage"])

  const served = servedFunctions({ functions: [
    { identifier: "files.js:deleteFile", functionType: "Mutation", visibility: { kind: "public" } },
    { identifier: "domain/runs.js:latest", functionType: "Query", visibility: { kind: "public" } },
    { identifier: "messages.js:getLiveMessage", functionType: "Query", visibility: { kind: "internal" } },
    { functionType: "HttpAction", method: "POST", path: "/workos/webhook" },
  ] })
  const references = new Map([
    ["messages:getLiveMessage", ["app/components/chat/use-chat-core.ts"]],
    ["files:deleteFile", ["lib/file-handling.ts"]],
  ])
  expect(missingFunctions(references, served)).toEqual([["messages:getLiveMessage", ["app/components/chat/use-chat-core.ts"]]])
})

it("points every backend-selecting variable at the preview", () => {
  const source = [
    "WORKOS_CLIENT_ID=client_1",
    "CONVEX_DEPLOYMENT=dev:polite-jackal-630",
    'NEXT_PUBLIC_CONVEX_URL="https://polite-jackal-630.convex.cloud"',
    "export CHAT_ADMISSION_SECRET=dev-secret",
  ].join("\n")
  expect(retargetEnvFile(source, {
    NEXT_PUBLIC_CONVEX_URL: "https://perf-preview-1.convex.cloud",
    CHAT_ADMISSION_SECRET: "run-secret",
  })).toBe([
    "WORKOS_CLIENT_ID=client_1",
    "NEXT_PUBLIC_CONVEX_URL=https://perf-preview-1.convex.cloud",
    "CHAT_ADMISSION_SECRET=run-secret",
    "",
  ].join("\n"))
})
