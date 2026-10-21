/**
 * /admin/users: the Accounts tab of the Users section.
 *
 * Was the admin overview (/admin) until the console was reorganised into
 * sections (src/lib/admin/sections.ts): its user table moved here with its
 * search, pagination and promote button, and gained the account status
 * columns (email confirmed, two-factor, last sign-in). Its other parts moved
 * too: the MRR chart and tiles to the new overview, the waitlist to the
 * Waitlist tab (users/waitlist/page.tsx).
 */
import { getCurrentUser } from "@/lib/auth"
import { getFormatter, getTranslations } from "next-intl/server"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
// The table sits in the shared Panel now, like every other admin page.
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Search, UserRound, Users } from "lucide-react"
import { AdminPageHeader, Chip, Empty, Panel } from "@/components/admin/admin-ui"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PromoteUserButton } from "@/components/admin/promote-user-button"
// Moved to the overview (/admin) with the MRR tiles and chart.
// import { RevenueChart } from "@/components/admin/revenue-chart"
// import { mrrHistory, monthlyEquivalent } from "@/lib/metrics"

const ITEMS_PER_PAGE = 20

// Takes the formatter instead of hardcoding "en-US": this runs at module
// scope, so it cannot reach the request locale on its own.
type Formatter = Awaited<ReturnType<typeof getFormatter>>

function formatJoined(format: Formatter, date: Date) {
  return format.dateTime(new Date(date), {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function UserAvatar({
  image,
  name,
  email,
}: {
  image: string | null
  name: string | null
  email: string
}) {
  return image ? (
    // Square, like everything else (was rounded-full).
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt="" className="h-8 w-8 shrink-0 object-cover" />
  ) : (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-primary/20 text-xs font-bold text-primary">
      {name?.[0] ?? email[0].toUpperCase()}
    </div>
  )
}

async function getAdminData(page: number, search: string) {
  const where = search
    ? { email: { contains: search, mode: "insensitive" as const } }
    : {}

  // Subscriptions and the waitlist were queried here too while this was the
  // overview; they now load on the overview and the Waitlist tab.
  const [totalUsers, filteredUsers, users] = await Promise.all([
    prisma.user.count(),
    // Was `search ? users.length : totalUsers`, which counted only the page
    // shown, so a search never offered a second page.
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: {
        subscription: { include: { plan: true } },
        // The latest session says when they last signed in.
        sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ITEMS_PER_PAGE,
      take: ITEMS_PER_PAGE,
    }),
  ])

  return {
    totalUsers,
    users,
    totalPages: Math.ceil(filteredUsers / ITEMS_PER_PAGE),
  }
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>
}) {
  const t = await getTranslations("admin")
  const format = await getFormatter()
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")

  const params = await searchParams
  // Guard against non-numeric ?page (e.g. ?page=abc → NaN), which would flow into
  // Prisma's `skip` and throw a 500. Fall back to page 1 for anything invalid.
  const parsedPage = Number.parseInt(params.page ?? "1", 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const search = params.search ?? ""

  const tc = await getTranslations("adminConsole.users")
  const { totalUsers, users, totalPages } = await getAdminData(page, search)
  const lastSeen = (u: (typeof users)[number]) => (u.sessions[0] ? formatJoined(format, u.sessions[0].updatedAt) : tc("never"))
  const status = (u: (typeof users)[number]) => (
    <span className="flex flex-wrap gap-1">
      <Badge variant={u.emailVerified ? "success" : "secondary"}>{u.emailVerified ? tc("verified") : tc("unverified")}</Badge>
      {u.twoFactorEnabled && <Badge variant="outline">{tc("twoFactor")}</Badge>}
    </span>
  )

  return (
    <div className="space-y-6">
      <AdminPageHeader title={tc("title")} subtitle={tc("subtitle")} icon={Users} />

      {/* Users Table. Was a shadcn Card with the search beside its title; the
          search is now a bar of its own under the Panel header, full width on
          a phone. */}
      <Panel title={t("usersTitle")} hint={t("usersCount", { count: totalUsers })} icon={UserRound} badge={search ? <Chip tone="info">{search}</Chip> : undefined} flush>
        <form role="search" className="flex gap-2 border-b border-border bg-muted/25 p-3 sm:px-5">
          <label className="relative min-w-0 flex-1 sm:max-w-sm">
            <span className="sr-only">{t("searchPlaceholder")}</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder={t("searchPlaceholder")}
              className="h-10 w-full border border-input bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
            />
          </label>
          <button
            type="submit"
            className="h-10 shrink-0 bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {t("search")}
          </button>
        </form>
        <div className="p-4 sm:p-5">
          {/* Below `md` a 6-column table is unreadable: stack each user as a card. */}
          <div className="space-y-3 md:hidden">
            {users.map((user) => (
              <div key={user.id} className="border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar image={user.image} name={user.name} email={user.email} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{user.name ?? "-"}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <Badge variant={user.role === "ADMIN" ? "default" : "outline"}>{user.role}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {user.subscription ? (
                    <Badge variant={user.subscription.status === "ACTIVE" ? "success" : "secondary"}>
                      {user.subscription.status}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">{t("free")}</Badge>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {user.subscription?.plan.name ?? t("free")}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {t("joined", { date: formatJoined(format, user.createdAt) })}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {status(user)}
                  <span>{tc("lastSeen", { date: lastSeen(user) })}</span>
                </div>
                {user.role !== "ADMIN" && (
                  <div className="mt-3">
                    <PromoteUserButton userId={user.id} currentRole={user.role} />
                  </div>
                )}
              </div>
            ))}
            {users.length === 0 && <Empty icon={Search}>{t("noUsers")}</Empty>}
          </div>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">{t("colUser")}</TableHead>
                  <TableHead>{t("colPlan")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead>{tc("colAccount")}</TableHead>
                  <TableHead>{t("colRole")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("colJoined")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{tc("colLastSeen")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <UserAvatar image={user.image} name={user.name} email={user.email} />
                        <div>
                          <p className="text-sm font-medium text-foreground">{user.name ?? "-"}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{user.subscription?.plan.name ?? t("free")}</span>
                    </TableCell>
                    <TableCell>
                      {user.subscription ? (
                        <Badge
                          variant={user.subscription.status === "ACTIVE" ? "success" : "secondary"}
                        >
                          {user.subscription.status}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{t("free")}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{status(user)}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === "ADMIN" ? "default" : "outline"}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatJoined(format, user.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">{lastSeen(user)}</span>
                    </TableCell>
                    <TableCell>
                      <PromoteUserButton userId={user.id} currentRole={user.role} />
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      {t("noUsers")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t("page", { page, total: totalPages })}
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <a
                    href={`/admin/users?page=${page - 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
                    className="inline-flex h-9 items-center border border-border px-4 text-sm hover:bg-muted"
                  >
                    {t("previous")}
                  </a>
                )}
                {page < totalPages && (
                  <a
                    href={`/admin/users?page=${page + 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
                    className="inline-flex h-9 items-center border border-border px-4 text-sm hover:bg-muted"
                  >
                    {t("next")}
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </Panel>

    </div>
  )
}
