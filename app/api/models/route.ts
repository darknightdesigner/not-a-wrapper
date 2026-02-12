import {
  getAllModels,
  getModelsWithAccessFlags,
} from "@/lib/models"
import { NextResponse } from "next/server"

/**
 * Get available AI models with base access flags.
 * Free models are marked accessible; paid models are locked by default.
 * Client-side enhances accessibility based on user's API keys from Convex.
 */
export async function GET() {
  try {
    // Return models with base access flags
    // Free models (from FREE_MODELS_IDS) are marked accessible
    // Paid/provider-specific models are locked until client verifies user has API keys
    const models = await getModelsWithAccessFlags()

    return new Response(JSON.stringify({ models }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  } catch (error) {
    console.error("Error fetching models:", error)
    return new Response(JSON.stringify({ error: "Failed to fetch models" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    })
  }
}

export async function POST() {
  try {
    const models = await getAllModels()

    return NextResponse.json({
      message: "Models refreshed",
      models,
      timestamp: new Date().toISOString(),
      count: models.length,
    })
  } catch (error) {
    console.error("Failed to refresh models:", error)
    return NextResponse.json(
      { error: "Failed to refresh models" },
      { status: 500 }
    )
  }
}
