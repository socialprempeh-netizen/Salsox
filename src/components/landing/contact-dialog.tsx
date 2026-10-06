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
import { useDeferred } from "@/hooks/use-deferred"

const loadContent = () => import("./contact-dialog-content")

export function ContactDialog(props: {
  /** A single element (a button). The dialog opens when it is clicked. */
  trigger: React.ReactElement<Record<string, unknown>>
  subject?: string
  body?: string
}) {
  const { Component: Content, triggerProps } = useDeferred(loadContent)
  if (Content) return <Content {...props} />
  // The handlers sit on a wrapper (display: contents, so layout is unchanged)
  // rather than being cloned into the trigger. Was
  // `cloneElement(props.trigger, triggerProps)`, which failed to render (a 500)
  // when the trigger came from a server component, as in the docs layout: an
  // element passed across the server/client boundary is not one React can
  // clone during server rendering. React's events bubble through the wrapper.
  return (
    <span className="contents" {...triggerProps}>
      {props.trigger}
    </span>
  )
}
