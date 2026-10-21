/**
 * robots.txt, read the way the standard (RFC 9309) says: the Hunter checks
 * every page against the site's own rules before asking Crawl4AI for it, and
 * a page the site disallows is skipped and logged, never fetched. Checked
 * here rather than trusted to the crawler's option, so the rule holds whatever
 * Crawl4AI version the server runs.
 *
 * Matching: the group for our user agent if there is one, else the "*" group;
 * the longest matching Allow or Disallow wins, Allow on a tie; "*" matches any
 * run of characters and a trailing "$" anchors the end. A missing or empty
 * file allows everything.
 */

type Rule = { allow: boolean; pattern: string }

/** The rules that apply to `agent`, from the text of a robots.txt. */
export function rulesFor(robotsTxt: string, agent: string): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = []
  let current: { agents: string[]; rules: Rule[] } | null = null
  let lastWasAgent = false
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim()
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line)
    if (!match) continue
    const field = match[1].toLowerCase()
    const value = match[2].trim()
    if (field === "user-agent") {
      // Consecutive user-agent lines share one group.
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
    } else if ((field === "allow" || field === "disallow") && current) {
      // An empty Disallow allows everything: it adds no rule.
      if (value) current.rules.push({ allow: field === "allow", pattern: value })
      lastWasAgent = false
    } else {
      lastWasAgent = false
    }
  }
  // The product token ("SalsoxOutreachBot" of "SalsoxOutreachBot/1.0"), compared whole.
  const token = agent.split("/")[0].trim().toLowerCase()
  const own = groups.filter((g) => g.agents.includes(token))
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes("*"))
  return chosen.flatMap((g) => g.rules)
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$")
  const body = anchored ? pattern.slice(0, -1) : pattern
  const regex = body.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")
  return new RegExp(`^${regex}${anchored ? "$" : ""}`).test(path)
}

/** Whether `agent` may fetch `pathAndQuery` (e.g. "/review/x?stars=1") under this robots.txt. */
export function isAllowed(robotsTxt: string, agent: string, pathAndQuery: string): boolean {
  let best: Rule | null = null
  for (const rule of rulesFor(robotsTxt, agent)) {
    if (!matches(rule.pattern, pathAndQuery)) continue
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) best = rule
  }
  return best ? best.allow : true
}
