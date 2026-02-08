import { NextResponse } from "next/server"

/**
 * GET /api/mcp-servers/status
 *
 * Returns the current MCP feature flag state.
 * Used by the Settings UI to conditionally render the MCP management section.
 */
export async function GET() {
  return NextResponse.json({
    enabled: process.env.ENABLE_MCP === "true",
  })
}
