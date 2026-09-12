# ADR-0006: `wip serve`'s lifetime, port choice, and security checks

- **Status:** Accepted
- **Date:** 2026-09-12
- **Deciders:** Grill phase, run against PRD issue #200 (autonomous; no human question raised)

## Context

The PRD (issue #200) requires the drag-and-drop ordering view to bind to loopback only,
require a fresh random secret sent as a custom header, and validate the `Host` header on every
request (Implementation Decisions, "Security"; user story 25). It does not state how long the
server runs, which port it uses, or what a developer sees when it is not running.

## Decision

**Lifetime.** The server runs only for the duration of one board view, not as a long-running
daemon: it starts when the developer asks for the drag-and-drop view (from the HTML report's
"reorder" affordance, or a `wip serve` command run directly) and stops on either an idle
timeout of ten minutes with no request, or the launching process exiting, whichever comes
first. A short-lived, on-demand server is a smaller attack surface than a background daemon
that outlives the terminal that started it, and it matches the PRD's read-only, opt-in
framing for every tracker-facing piece of this tool.

**Port.** The server binds `127.0.0.1` (and `::1` where available) on port `0`, letting the
OS assign an unused ephemeral port, and prints the resulting URL (including the secret,
carried as a query parameter for the initial page load and thereafter required as a header on
every API call) rather than publishing a fixed port. A fixed, well-known port would let another
local process pre-bind it or, on a shared machine, let another user's process on the same port
range collide with it.

**No-server fallback.** When the drag-and-drop view is not running, the HTML report's
reorder control falls back to the same pattern the report already uses for `wip://` on a
platform where the protocol is not registered (`SKILL.md`, "Optional: one-click Resume"): it
shows the command-line `wip move` equivalent as text to copy, rather than a broken button.

**Security checks, applied before any board data is served:**
1. Bind address is `127.0.0.1`/`::1` only; the server refuses to start if asked to bind
   anything else.
2. Every request must carry the launch's secret as a custom request header (not a cookie, so
   an unrelated page open in the same browser cannot ride the developer's session — a cookie
   is sent automatically by the browser, a custom header is not).
3. The `Host` header on every request must equal `localhost` or `127.0.0.1`/`::1`, at the
   bound port; any other value is refused, which is what stops a malicious public DNS record
   that resolves to `127.0.0.1` from being used to script requests against the local server
   from a page loaded over the network (DNS rebinding).
4. A request failing check 2 or 3 gets a generic refusal with no board content in the
   response body.

## Consequences

- A developer who steps away for more than ten minutes has to re-open the view, which is the
  accepted cost of not leaving a local HTTP listener open indefinitely.
- Printing the URL with an ephemeral port means it cannot be bookmarked across sessions; this
  is intentional, since a stale bookmark pointing at a closed secret should not appear to work.

## Alternatives considered

- **A fixed, documented port.** Rejected: collision risk on a shared or already-busy machine,
  and a predictable port is a smaller obstacle for the exact local-network attack the `Host`
  check and secret header are meant to close off.
- **A long-running background server, started once per machine boot.** Rejected: it keeps a
  listener open long after the developer stops looking at the board, for a feature the PRD
  frames as opt-in and occasional.
