/**
 * Signing-link tokens.
 *
 * 32 characters from nanoid's URL-safe alphabet is ~190 bits of entropy: the
 * token is the only credential a signer has, so it must be unguessable. It is
 * rotated (a new value issued) whenever a recipient's email is corrected, which
 * is what makes a link sent to a wrong address stop working.
 */
import { nanoid } from "nanoid"

export function newSigningToken(): string {
  return nanoid(32)
}

/** Cheap shape check before a database lookup, so junk URLs never hit the DB. */
export function isPlausibleToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(token)
}
