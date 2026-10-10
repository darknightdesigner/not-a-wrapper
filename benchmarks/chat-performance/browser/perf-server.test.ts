import { createServer } from "node:net"
import { describe, expect, it } from "vitest"
import { startServerGroup } from "./perf-server"

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const address = probe.address()
      probe.close(() => resolve(typeof address === "object" && address ? address.port : 0))
    })
  })

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// The leader stays up like bunx; the grandchild serves like `next start` and answers with its pid.
const LEADER = `
const { spawn } = require("node:child_process")
spawn(process.execPath, ["-e", 'require("node:http").createServer((q, s) => s.end(String(process.pid))).listen(Number(process.argv[1]))', process.argv[1]], { stdio: "inherit" })
setInterval(() => {}, 1000)
`

describe.skipIf(process.platform === "win32")("startServerGroup", () => {
  it("stops the grandchild that serves the port, not only the leader", async () => {
    const port = await freePort()
    const baseUrl = `http://localhost:${port}`
    const server = await startServerGroup([process.execPath, "-e", LEADER, String(port)], baseUrl, {
      readyTimeoutMs: 5_000,
    })
    const grandchild = Number(await (await fetch(baseUrl)).text())
    expect(grandchild).not.toBe(server.child.pid)
    await expect(startServerGroup([process.execPath, "-e", LEADER, String(port)], baseUrl)).rejects.toThrow(
      "already serving"
    )

    await server.stop()
    expect(alive(grandchild)).toBe(false)
    await expect(fetch(baseUrl)).rejects.toThrow()
  })
})
