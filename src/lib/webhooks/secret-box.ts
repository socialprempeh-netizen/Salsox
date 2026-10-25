/**
 * Encrypts webhook signing secrets at rest. The server needs each secret in
 * clear to sign deliveries, so it cannot be hashed like a password or an API
 * key; it is kept with AES-256-GCM instead, under a key derived from
 * AUTH_SECRET, so a copy of the database alone cannot forge webhooks.
 *
 * Stored as "v1:<iv>:<tag>:<ciphertext>", base64url. Changing AUTH_SECRET
 * makes existing secrets unreadable: endpoints then need a new secret
 * (Rotate on the Developers page), which the delivery log reports.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

function key(): Buffer {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error("AUTH_SECRET is not set")
  return createHash("sha256").update(`webhook-secrets:${secret}`).digest()
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(":")
}

export function openSecret(sealed: string): string {
  const [version, iv, tag, data] = sealed.split(":")
  if (version !== "v1" || !iv || !tag || !data) throw new Error("not a sealed secret")
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")
}

/** A new signing secret, in the "whsec_" shape receivers recognise. */
export function newWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`
}
