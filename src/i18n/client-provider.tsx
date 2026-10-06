import { NextIntlClientProvider } from "next-intl"
import { getMessages } from "next-intl/server"
import { CLIENT_MESSAGES, pickMessages, type ClientMessageArea } from "./client-messages"

/**
 * A `NextIntlClientProvider` that hands its client components only the
 * namespaces of one area (client-messages.ts says which and why). Used by the
 * root layout and by each area's layout, in place of a bare provider, which
 * would serialize the whole message file into the page.
 *
 * `locale` is passed by the localized layout, whose segment is the locale;
 * elsewhere it is inherited from the request, as before.
 */
export async function ClientMessagesProvider({
  area,
  locale,
  children,
}: {
  area: ClientMessageArea
  locale?: string
  children: React.ReactNode
}) {
  const messages = (await getMessages(locale ? { locale } : undefined)) as Record<string, unknown>
  return (
    <NextIntlClientProvider locale={locale} messages={pickMessages(messages, CLIENT_MESSAGES[area]) as never}>
      {children}
    </NextIntlClientProvider>
  )
}
