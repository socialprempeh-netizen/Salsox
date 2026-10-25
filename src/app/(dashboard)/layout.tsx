import { ClientMessagesProvider } from "@/i18n/client-provider"
import { requireUser } from "@/lib/auth"
import Link from "next/link"
import { ThemeToggle } from "@/components/theme-toggle"
import { UserMenu } from "@/components/dashboard/user-menu"
import { PoweredBy } from "@/components/powered-by"
import { Logo } from "@/components/logo"
import { MobileNav } from "@/components/dashboard/mobile-nav"
import { SidebarNav } from "@/components/dashboard/sidebar-nav"
import { SidebarCollapseToggle } from "@/components/dashboard/sidebar-collapse-toggle"
import { SignOutDialog } from "@/components/dashboard/sign-out-dialog"
import { SignupEvent } from "@/components/analytics/signup-event"
import { prisma } from "@/lib/prisma"
import { getSecurityPolicy } from "@/lib/security-settings"
import { mustEnrollNow } from "@/lib/security-policy"
import { hasSecondFactor, isTwoFactorEnrolled } from "@/lib/two-factor-policy"
import { EnforcedSetup } from "@/components/settings/enforced-setup"
import { IdleSignOut } from "@/components/auth/idle-sign-out"

/** How recent an account must be for its first dashboard visit to count as the signup. */
const NEW_ACCOUNT_MS = 15 * 60 * 1000

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  // For the analytics `sign_up` conversion (signup-event.tsx): one indexed
  // lookup, and the event only renders for an account minutes old.
  // Also what the sign-in policy needs (src/lib/security-policy.ts): whether
  // this person has a second factor, and could set one up.
  const [account, policy] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        createdAt: true,
        signupChannel: true,
        twoFactorEnabled: true,
        twoFactor: { select: { verified: true } },
        accounts: { where: { providerId: "credential" }, select: { id: true } },
        _count: { select: { passkeys: true } },
      },
    }),
    getSecurityPolicy(),
  ])
  // Enforced 2FA: the setup screen stands in for the page until a method is added.
  const mustEnroll = account
    ? mustEnrollNow({
        policy,
        role: user.role,
        // A passkey only counts while passkeys can sign in.
        enrolled: hasSecondFactor({ totp: isTwoFactorEnrolled(account), passkeys: policy.passkeyEnabled ? account._count.passkeys : 0 }),
        hasPassword: account.accounts.length > 0,
      })
    : false
  // eslint-disable-next-line react-hooks/purity
  const isNew = account ? Date.now() - account.createdAt.getTime() < NEW_ACCOUNT_MS : false

  // Client components here get only the "app" messages (src/i18n/client-messages.ts).
  return (
    <ClientMessagesProvider area="app">
    <div className="flex min-h-screen bg-muted/20">
      {isNew && <SignupEvent userId={user.id} channel={account?.signupChannel ?? "unknown"} />}
      {policy.sessionTimeoutMinutes !== null && <IdleSignOut minutes={policy.sessionTimeoutMinutes} />}
      <aside className="sticky top-0 hidden h-screen w-60 flex-col border-r border-border bg-background transition-[width] duration-200 md:flex sidebar-collapsed:w-16">
        <div className="flex h-16 items-center border-b border-border px-5 sidebar-collapsed:justify-center sidebar-collapsed:px-0">
          <Link href="/" className="flex items-center gap-2 font-bold text-foreground">
            <Logo animated wordmarkClassName="sidebar-collapsed:hidden" />
          </Link>
        </div>
        <SidebarNav variant="dashboard" showAdminLink={user.role === "ADMIN"} />
        <div className="border-t border-border p-3">
          <UserMenu
            name={user.name}
            email={user.email}
            image={user.image}
          />
        </div>
      </aside>

      {/* min-w-0: without it this flex item keeps `min-width: auto`, so any wide
          child (a table) inflates the whole column past the viewport instead of
          scrolling inside its own container. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background px-4 md:px-6">
          <SidebarCollapseToggle />
          <div className="flex items-center gap-1 md:hidden">
            <MobileNav variant="dashboard" showAdminLink={user.role === "ADMIN"} />
            <Logo animated wordmarkClassName="text-base font-bold text-foreground" />
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <ThemeToggle />
            <SignOutDialog
              trigger={
                <button className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground md:block">
                  Sign out
                </button>
              }
            />
            <div className="md:hidden">
              <UserMenu
                name={user.name}
                email={user.email}
                image={user.image}
                side="bottom"
                hideDetails
              />
            </div>
          </div>
        </header>
        {/* Narrower than the public pages on purpose. Here the sidebar already
            takes 240px, so at 1440 the content area is 1200: capping at
            max-w-5xl leaves 88px of automatic margin on each side, and with the
            48px of padding the gap between the sidebar rule and the first card
            comes to ~136px instead of 72. Without any cap the content stretched
            to the full viewport and the three stat cards were over 400px each
            to hold one word. */}
        <main className="mx-auto w-full max-w-5xl flex-1 p-6 lg:px-14">{mustEnroll ? <EnforcedSetup userId={user.id} role={user.role} /> : children}</main>
        <footer className="flex items-center justify-center border-t border-border px-6 py-4">
          <PoweredBy />
        </footer>
      </div>
    </div>
    </ClientMessagesProvider>
  )
}
