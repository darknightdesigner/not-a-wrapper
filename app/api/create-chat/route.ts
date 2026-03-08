import { createChatInDb } from "./api"
import { resolveModelId } from "@/lib/models/model-id-migration"

export async function POST(request: Request) {
  try {
    const { userId, title, model, projectId } = await request.json()
    const normalizedModel =
      typeof model === "string" ? resolveModelId(model) : model

    if (!userId) {
      return new Response(JSON.stringify({ error: "Missing userId" }), {
        status: 400,
      })
    }

    const chat = await createChatInDb({
      userId,
      title,
      model: normalizedModel,
      projectId,
    })

    if (!chat) {
      return new Response(
        JSON.stringify({ error: "Failed to create chat." }),
        { status: 500 }
      )
    }

    return new Response(JSON.stringify({ chat }), { status: 200 })
  } catch (err: unknown) {
    console.error("Error in create-chat endpoint:", err)

    if (err instanceof Error && err.message === "DAILY_LIMIT_REACHED") {
      return new Response(
        JSON.stringify({ error: err.message, code: "DAILY_LIMIT_REACHED" }),
        { status: 403 }
      )
    }

    return new Response(
      JSON.stringify({
        error: (err as Error).message || "Internal server error",
      }),
      { status: 500 }
    )
  }
}
