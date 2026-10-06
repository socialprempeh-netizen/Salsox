/**
 * The sessionStorage key the signature generator uses to hand a finished
 * signature image to the Add signature tool, on this device only. In its own
 * module so the generator does not pull the whole stamp tool into its chunk.
 */
export const HANDOFF_KEY = "salsox-tool-signature"
