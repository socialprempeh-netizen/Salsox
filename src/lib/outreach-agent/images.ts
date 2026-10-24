/**
 * Image generation for social posts: NOT BUILT YET, on purpose.
 *
 * TODO(decision needed): choose an image-generation API, then implement
 * `generatePostImage` against it. No image API key exists in any env file
 * today (checked 24 Oct 2026), and generating a stand-in would be faking it,
 * so the studio shows the image slot as "not set up" instead.
 *
 * What the decision involves:
 *  - which provider (for example OpenAI's image API, Google's Imagen through
 *    the Gemini API, Stability, Replicate or fal.ai hosting an open model,
 *    or Ideogram, which renders text in images well), on price per image,
 *    licence terms for commercial posting, and quality on simple branded
 *    graphics rather than photos;
 *  - where images are stored (the existing file storage, src/lib/esign
 *    /storage.ts, or Vercel Blob) and a column on SocialPost for the key;
 *  - how each platform takes media: X (media upload, then a media id on the
 *    post), Facebook (POST /{page-id}/photos), LinkedIn (images API asset,
 *    then the post); none of the three publishes an image with the text call
 *    the studio makes today.
 *
 * Until then this module only answers "is it available?", truthfully.
 */

/** The env variable a chosen provider will read. Unset today, so nothing is offered. */
export const IMAGE_API_ENV = "SOCIAL_IMAGE_API_KEY"

export type ImageAvailability = { available: false; reason: "no-provider-chosen" }

/** Whether the studio can generate an image for a post. Always no until a provider is chosen and built. */
export function imageGeneration(): ImageAvailability {
  return { available: false, reason: "no-provider-chosen" }
}

/** Placeholder for the real call; it refuses rather than pretending. */
export async function generatePostImage(): Promise<never> {
  throw new Error("Image generation is not set up: an image API has not been chosen yet (see src/lib/outreach-agent/images.ts).")
}
