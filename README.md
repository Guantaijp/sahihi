# Sahihi

**Public participation notices you can trust — on WhatsApp, in plain language, and never invented.**

Kenya's constitution guarantees the public a say in county and national decisions.
Acting on that right means knowing what is open for comment, by when, and where to
show up. Today that information is published as photographs of printed letters,
scattered across 47 county assemblies, two houses of Parliament and the Gazette, and
goes stale without warning. Nairobi County's own August 2026 assessment found that
**0.74% of its residents take part in public engagement forums**.

Sahihi answers one question — *"what can I have a say in right now?"* — over
WhatsApp, and backs every answer with the official source and the date it was last
checked.

**Capstone track:** Transparency & Accountability.
**Written summary for judges:** [SUBMISSION.md](SUBMISSION.md) · **Pitch deck:** [sahihi-pitch-deck.pdf](sahihi-pitch-deck.pdf)

---

## The one thing that makes this different

**It would rather say nothing than guess.**

A plausible wrong deadline is worse than silence: someone travels to a hearing that
closed last week. So Sahihi can only repeat facts that exist in a curated record
traced to an official document. Where a detail is missing, it says so:

```
2. The Public Participation Bill, 2025 — Senate is taking public comments
   Deadline: not yet confirmed — please check the official source below
   Source: Senate of Kenya — Bills page — https://www.parliament.go.ke/...
   Last verified: 2026-09-19
```

That is not an error state. That is the product working: two news outlets reported a
28 September deadline for that bill, but no official page confirms it, so Sahihi
refuses to state it.

How that rule is enforced:

| Rule | Where |
| --- | --- |
| Only one module renders user-facing text, and only from the notice record | `src/conversation/response-composer.service.ts` |
| `not_confirmed` fields render as "not yet confirmed — check the official source" | same module |
| Every notice carries issuing body, source link and `last_verified` date | `data/notices.json` |
| A notice whose deadline has passed vanishes from every reply, automatically | `src/notices/notice-store.service.ts` |
| Reminders are refused when a deadline is unconfirmed, and never fire against one | `src/reminders/reminders.service.ts` |
| The optional AI layer may only rephrase verified text, never add a fact; off by default | `polishWithLLM`, same module |
| 59 automated tests, including tests over the real data file | `pnpm test` |

## What a user can do

| They type | They get |
| --- | --- |
| `Kisumu` | Open notices for that county, plus national ones that apply everywhere |
| `all` | Everything on file, across all counties, 5 at a time |
| `more` | The next page |
| `what is open about health?` | Keyword search across every notice |
| `1` | Venue, time, how to submit, deadline, official source |
| `remind 1` | One reminder before the deadline, with how to opt out |
| `stop` | Reminders cancelled and their stored record deleted |
| `habari` / `kiswahili` | The whole conversation switches to Kiswahili |

Numbers and single words only — no menus, no app, no account. Plain text works on a
basic handset and a weak signal. Long lists are paged to stay under WhatsApp's
4,096-character limit.

## Try it in two minutes

```bash
pnpm install
cp .env.example .env     # no keys needed; everything below runs offline
pnpm dev
```

Open **http://localhost:3000/index.html** — a browser chat page that runs the exact
same engine as the WhatsApp webhook, so you can see the whole product without a Meta
account. Try `nairobi`, then `1`, then `remind 1`, then `stop`.

```bash
pnpm test        # 59 tests, including the data-file checks
pnpm build && pnpm start
```

## The data

`data/notices.json` holds **real, currently-open notices**, each entered by hand from
a primary source:

- **7 county public hearings** on the Tobacco Control (Amendment) Bill (Nairobi,
  Uasin Gishu, Bungoma, Tharaka-Nithi, Meru, Laikipia, Kisumu) — venue, date and time
  from the [Clerk of the National Assembly's notice of 16 September 2026](https://parliament.go.ke/sites/default/files/2026-09/DC%20Health_Final%20PP%20TC%20Bill%20Advert_14.9.2026.pdf).
- **24 bills open for public comment before the Senate**, from the
  [Senate bills page](https://www.parliament.go.ke/the-senate/house-business/bills).

Notices filed under the special county key `national` are shown for **all 47
counties**, so a bill before Parliament reaches every user with one entry.

**Editing it:** fill every field; where an official source doesn't state something,
write `"not_confirmed"` rather than guessing. Then run `pnpm test` — the suite fails
on a missing field, a malformed date, a non-http source URL, a duplicate id or a
leftover placeholder. Notices with a confirmed deadline retire themselves; ones
without a deadline must be removed by hand when they close.

## How it is built

NestJS + TypeScript. Each concern is a module under `src/`:

- **`conversation/`** — the channel-agnostic engine plus the response composer (the
  trust boundary described above).
- **`notices/`** — the knowledge base, expiry, keyword search, county matching for all
  47 counties including misspellings and phrases like "I live in Nairobi county".
- **`whatsapp/`** — Meta webhook with `X-Hub-Signature-256` verification, outbound
  sends, and approved-template reminders. Falls back to a console stub when
  unconfigured, so everything stays testable.
- **`chat/`** — the same engine over HTTP for the browser demo page.
- **`reminders/`** — a daily job that sends one reminder inside the last 3 days
  before a deadline, marks it sent, and retries a failed send the next day.
- **`session/`** — conversations and reminders persisted to `data/sessions.json` so
  they survive a restart.

Built with AI coding tools (Claude Code); see [SUBMISSION.md](SUBMISSION.md) for what
they did, including reading Parliament's hearing schedule out of a PDF table and
county notices out of scanned JPEGs.

## Privacy

Reminders are opt-in. Every confirmation tells the user how to stop. `stop` (also
`cancel`, `unsubscribe`, `acha`, `sitisha`) cancels reminders and deletes their
record. `data/sessions.json` holds phone numbers — personal data under Kenya's Data
Protection Act — and is git-ignored. A published privacy notice and a retention
period are still outstanding.

## Connecting real WhatsApp

1. Create a Meta developer app with the WhatsApp Business product; get an access
   token and phone number ID.
2. Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` and
   `WHATSAPP_APP_SECRET` in `.env`. With the app secret set, only requests genuinely
   signed by Meta are accepted.
3. Point the Meta webhook at `https://<your-deployed-url>/webhook/whatsapp`, using
   the same verify token.
4. Submit a **reminder message template** (utility, two body variables: `{{1}}` notice
   title, `{{2}}` deadline) and set `WHATSAPP_REMINDER_TEMPLATE` to its name. This is
   required — Meta rejects free-form messages more than 24 hours after the user's
   last message, which is exactly when reminders go out.

No code changes needed; `src/whatsapp/` already handles all of it.

## Known limits, stated plainly

- **Collection, not software, is the bottleneck.** 40 counties have no local notices
  on file yet, because most are advertised in newspapers, on notice boards and at
  barazas. The next build step is a fetcher that reads the machine-readable sources
  and files candidates into a queue a human approves — automation proposes, a person
  still verifies.
- **Kiswahili is partial:** the conversation switches, but field labels
  ("Deadline", "Venue") are still English.
- **No SMS or USSD path**, so phones without WhatsApp are excluded.
- **One server, one JSON file** for sessions — fine for a pilot, not for scale.
- **No live scraping** of county sites or the Gazette yet; all data is curated by hand.

---

**Sahihi** is Kiswahili for *correct, accurate, authentic*. The name is the
specification.
