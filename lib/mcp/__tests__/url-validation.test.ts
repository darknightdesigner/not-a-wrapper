import { describe, it, expect } from "vitest"
import { validateServerUrl } from "../url-validation"

describe("validateServerUrl", () => {
  // ===========================================================================
  // Valid URLs
  // ===========================================================================

  describe("valid URLs", () => {
    it("accepts HTTPS URLs with valid hostnames", () => {
      expect(validateServerUrl("https://mcp.example.com")).toBeNull()
    })

    it("accepts HTTP URLs (allowed for development)", () => {
      expect(validateServerUrl("http://mcp.example.com")).toBeNull()
    })

    it("accepts URLs with paths", () => {
      expect(validateServerUrl("https://example.com/mcp/v1")).toBeNull()
    })

    it("accepts URLs with ports", () => {
      expect(validateServerUrl("https://example.com:8080")).toBeNull()
    })

    it("accepts URLs with query parameters", () => {
      expect(
        validateServerUrl("https://example.com/mcp?key=value")
      ).toBeNull()
    })

    it("accepts public IP addresses", () => {
      expect(validateServerUrl("https://8.8.8.8")).toBeNull()
      expect(validateServerUrl("https://1.1.1.1")).toBeNull()
      expect(validateServerUrl("https://203.0.113.1")).toBeNull()
    })

    it("accepts subdomain URLs", () => {
      expect(validateServerUrl("https://mcp.api.example.com")).toBeNull()
    })

    it("accepts IPs just outside private ranges", () => {
      // 172.15.x.x is NOT in the 172.16-31.x.x private range
      expect(validateServerUrl("http://172.15.0.1")).toBeNull()
      // 172.32.x.x is NOT in the 172.16-31.x.x private range
      expect(validateServerUrl("http://172.32.0.1")).toBeNull()
      // 192.167.x.x is NOT in the 192.168.x.x private range
      expect(validateServerUrl("http://192.167.1.1")).toBeNull()
    })
  })

  // ===========================================================================
  // Localhost rejection
  // ===========================================================================

  describe("localhost rejection", () => {
    it("rejects localhost", () => {
      const result = validateServerUrl("http://localhost:3000")
      expect(result).toBe("Localhost and local network URLs are not allowed")
    })

    it("rejects localhost without port", () => {
      const result = validateServerUrl("http://localhost")
      expect(result).toBe("Localhost and local network URLs are not allowed")
    })

    it("rejects 0.0.0.0", () => {
      const result = validateServerUrl("http://0.0.0.0:8080")
      expect(result).toBe("Localhost and local network URLs are not allowed")
    })

    it("rejects IPv6 loopback [::1]", () => {
      const result = validateServerUrl("http://[::1]:8080")
      expect(result).toBe("Localhost and local network URLs are not allowed")
    })

    it("rejects .local domains", () => {
      const result = validateServerUrl("http://myservice.local")
      expect(result).toBe("Localhost and local network URLs are not allowed")
    })

    it("rejects nested .local domains", () => {
      const result = validateServerUrl("http://deep.nested.myservice.local")
      expect(result).toBe("Localhost and local network URLs are not allowed")
    })
  })

  // ===========================================================================
  // Private IP rejection
  // ===========================================================================

  describe("private IP rejection", () => {
    it("rejects 10.0.0.0/8 range", () => {
      expect(validateServerUrl("http://10.0.0.1")).toBe(
        "Private IP addresses are not allowed"
      )
      expect(validateServerUrl("http://10.255.255.255")).toBe(
        "Private IP addresses are not allowed"
      )
      expect(validateServerUrl("http://10.100.50.25")).toBe(
        "Private IP addresses are not allowed"
      )
    })

    it("rejects 172.16.0.0/12 range", () => {
      expect(validateServerUrl("http://172.16.0.1")).toBe(
        "Private IP addresses are not allowed"
      )
      expect(validateServerUrl("http://172.31.255.255")).toBe(
        "Private IP addresses are not allowed"
      )
      expect(validateServerUrl("http://172.20.10.5")).toBe(
        "Private IP addresses are not allowed"
      )
    })

    it("rejects 192.168.0.0/16 range", () => {
      expect(validateServerUrl("http://192.168.0.1")).toBe(
        "Private IP addresses are not allowed"
      )
      expect(validateServerUrl("http://192.168.1.1")).toBe(
        "Private IP addresses are not allowed"
      )
      expect(validateServerUrl("http://192.168.255.255")).toBe(
        "Private IP addresses are not allowed"
      )
    })

    it("rejects 169.254.0.0/16 link-local range", () => {
      expect(validateServerUrl("http://169.254.0.1")).toBe(
        "Private IP addresses are not allowed"
      )
      expect(validateServerUrl("http://169.254.169.254")).toBe(
        "Private IP addresses are not allowed"
      )
    })

    it("rejects 127.0.0.0/8 loopback range", () => {
      expect(validateServerUrl("http://127.0.0.1")).toBe(
        "Private IP addresses are not allowed"
      )
      expect(validateServerUrl("http://127.255.255.255")).toBe(
        "Private IP addresses are not allowed"
      )
    })

    it("rejects 0.0.0.0/8 range (0.x.x.x except 0.0.0.0 caught earlier)", () => {
      // 0.0.0.0 is caught by hostname check, but 0.1.2.3 is caught here
      expect(validateServerUrl("http://0.1.2.3")).toBe(
        "Private IP addresses are not allowed"
      )
    })
  })

  // ===========================================================================
  // Invalid URL format
  // ===========================================================================

  describe("invalid URL format", () => {
    it("rejects empty string", () => {
      expect(validateServerUrl("")).toBe("Invalid URL format")
    })

    it("rejects non-URL strings", () => {
      expect(validateServerUrl("not-a-url")).toBe("Invalid URL format")
    })

    it("rejects URLs without protocol", () => {
      expect(validateServerUrl("example.com")).toBe("Invalid URL format")
    })

    it("rejects strings with spaces", () => {
      expect(validateServerUrl("http://example .com")).toBe(
        "Invalid URL format"
      )
    })
  })

  // ===========================================================================
  // Protocol restrictions
  // ===========================================================================

  describe("protocol restrictions", () => {
    it("rejects ftp:// protocol", () => {
      expect(validateServerUrl("ftp://example.com")).toBe(
        "Only HTTP and HTTPS URLs are supported"
      )
    })

    it("rejects file:// protocol", () => {
      expect(validateServerUrl("file:///etc/passwd")).toBe(
        "Only HTTP and HTTPS URLs are supported"
      )
    })

    it("rejects ws:// protocol", () => {
      expect(validateServerUrl("ws://example.com")).toBe(
        "Only HTTP and HTTPS URLs are supported"
      )
    })
  })

  // ===========================================================================
  // Edge cases
  // ===========================================================================

  describe("edge cases", () => {
    it("handles URLs with authentication in them", () => {
      // user:pass@host URLs — should validate the host part
      expect(
        validateServerUrl("https://user:pass@mcp.example.com")
      ).toBeNull()
    })

    it("handles URLs with fragments", () => {
      expect(
        validateServerUrl("https://example.com/mcp#section")
      ).toBeNull()
    })

    it("handles case-insensitive hostnames", () => {
      // Should normalize to lowercase
      expect(validateServerUrl("http://LOCALHOST")).toBe(
        "Localhost and local network URLs are not allowed"
      )
    })
  })
})
