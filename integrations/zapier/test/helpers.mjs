/**
 * Shared by the Zapier app's tests: the app's CommonJS modules loaded with
 * Node's own require (the Zapier runtime loads them the same way), and a
 * stand-in for Zapier's `z` object that records requests and answers them
 * from a list, so triggers and actions run without HTTP or the Zapier
 * packages installed.
 */
import { createRequire } from "node:module"

export const load = createRequire(import.meta.url)

class ZapierError extends Error {
  constructor(message, code, status) {
    super(message)
    this.code = code
    this.status = status
  }
}

/** A fake `z`: `answers` maps "METHOD path" to the response's data (or a full { status, data }). */
export function fakeZ(answers = {}) {
  const requests = []
  const errors = {
    Error: class extends ZapierError {},
    ExpiredAuthError: class extends ZapierError {},
    HaltedError: class extends ZapierError {},
    ThrottledError: class extends ZapierError {
      constructor(message, delay) {
        super(message)
        this.delay = delay
      }
    },
  }
  const request = async (options) => {
    requests.push(options)
    const path = new URL(options.url).pathname.replace(/^\/api\/v1/, "")
    const key = `${options.method || "GET"} ${path}`
    if (!(key in answers)) throw new Error(`Unexpected request: ${key}`)
    const answer = answers[key]
    return answer && typeof answer === "object" && "status" in answer ? answer : { status: 200, data: answer }
  }
  // A file pointer as Zapier makes one: which hydrator, with what input.
  const dehydrateFile = (fn, inputData) => `hydrate:${fn.name}:${JSON.stringify(inputData)}`
  return { z: { request, errors, dehydrateFile }, requests }
}
