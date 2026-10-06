"use client"

/**
 * The contact dialog, opened from the footer, the docs and the enterprise
 * plan card.
 *
 * Renders the trigger it is given; the dialog itself
 * (contact-dialog-content.tsx) loads on the first hover, focus or touch and
 * mounts already open on the first click, so the Radix dialog is not part of
 * the first load of every page that merely shows the button
 * (src/hooks/use-deferred.ts). Same props as before, so no caller changed.
 */
import { cloneElement } from "react"
import { useDeferred } from "@/hooks/use-deferred"

const loadContent = () => import("./contact-dialog-content")

export function ContactDialog(props: {
  /** A single element (a button): it receives the handlers that open the dialog. */
  trigger: React.ReactElement<Record<string, unknown>>
  subject?: string
  body?: string
}) {
  const { Component: Content, triggerProps } = useDeferred(loadContent)
  if (Content) return <Content {...props} />
  return cloneElement(props.trigger, triggerProps)
}
