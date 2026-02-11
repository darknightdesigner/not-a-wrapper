import { NextResponse } from "next/server"

/**
 * GET /api/mcp-servers/status
 *
 * Returns MCP availability status.
 * MCP is always enabled — the ENABLE_MCP feature gate has been removed.
 * This endpoint is kept for backward compatibility with the Settings UI.
 */
export async function GET() {
  return NextResponse.json({
    enabled: true,
  })
}
