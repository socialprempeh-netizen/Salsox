import { test, expect } from "@playwright/test"

/**
 * The security headers as a browser receives them, not as the code means to
 * send them: a page, an API route and a 404 must each carry a real
 * Content-Security-Policy and HSTS. The unit tests (src/lib/security-headers
 * .test.ts) check what the policy says; this catches a hosting, middleware or
 * routing change that stops it being sent at all.
 *
 * HSTS only matters over HTTPS, so its check runs against a deployment
 * (E2E_BASE_URL=https://...) and is skipped on the local http dev server,
 * where the header is sent but ignored by browsers.
 */

const PATHS = ["/", "/pricing", "/api/health", "/this-page-does-not-exist"]

for (const path of PATHS) {
  test(`${path} carries a real CSP and HSTS`, async ({ request, baseURL }) => {
    const response = await request.get(path, { maxRedirects: 0 })
    const headers = response.headers()

    const csp = headers["content-security-policy"] ?? ""
    for (const directive of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'"]) {
      expect(csp, `${path}: CSP lacks ${directive}`).toContain(directive)
    }
    expect(headers["x-content-type-options"]).toBe("nosniff")

    const hsts = headers["strict-transport-security"] ?? ""
    expect(hsts, `${path}: no HSTS header`).not.toBe("")
    if (baseURL?.startsWith("https://")) {
      expect(Number(/max-age=(\d+)/.exec(hsts)?.[1]), `${path}: HSTS shorter than a year`).toBeGreaterThanOrEqual(31_536_000)
      expect(hsts).toContain("includeSubDomains")
    }
  })
}
