"use client"

/**
 * Mounts the right free tool on a tool page (src/app/[locale]/(public)/[page]).
 *
 * Each tool is its own chunk via next/dynamic, so /sign-pdf does not ship
 * the signature generator or the request tool. They are still rendered on
 * the server (the default for next/dynamic), so the tool's first state, the
 * file picker, is in the HTML and paints before any script runs.
 */
import dynamic from "next/dynamic"
import type { ToolId } from "@/lib/seo/pages"

const StampTool = dynamic(() => import("./pdf-stamp-tool").then((m) => m.PdfStampTool))
const RequestTool = dynamic(() => import("./request-signature-tool").then((m) => m.RequestSignatureTool))
const GeneratorTool = dynamic(() => import("./signature-generator-tool").then((m) => m.SignatureGeneratorTool))

export function ToolSlot({ tool }: { tool: ToolId }) {
  switch (tool) {
    case "sign-pdf":
      return <StampTool config={{ id: "sign-pdf", palette: ["signature", "date", "text"] }} />
    case "add-signature-to-pdf":
      return <StampTool config={{ id: "add-signature-to-pdf", palette: ["signature", "date"], everyPageOption: true }} />
    case "fill-and-sign-pdf":
      return <StampTool config={{ id: "fill-and-sign-pdf", palette: ["text", "check", "date", "signature"], formFields: true }} />
    case "request-signature":
      return <RequestTool />
    case "pdf-signature-generator":
      return <GeneratorTool />
  }
}
