# Sahihi — Public Participation Notice Finder

Surfaces active public participation notices for a Kenyan county, in plain
language, grounded strictly in curated, sourced data — never invented.

## What's in this scaffold

Built with [NestJS](https://nestjs.com) (TypeScript). Each piece below is a
Nest module under `src/`, wired together in `src/app.module.ts`.

- **Channel-agnostic conversation engine** (`src/conversation/conversation.service.ts`) — the same
  logic drives both the WhatsApp webhook and the local test web-chat.
- **Test web-chat UI** (`public/index.html`) — so you can demo and iterate
  before WhatsApp Business API access is approved. Open it at
  `http://localhost:3000/index.html` once the server is running.
- **WhatsApp webhook stub** (`src/whatsapp/`) — verification handshake +
  inbound message handling + outbound send via the Meta Graph API. Falls
  back to a console-log stub if `WHATSAPP_TOKEN` isn't set yet, so the rest
  of the app stays testable.
- **Notice knowledge base** (`data/notices.json`) — structured, curated
  entries. **Currently filled with clearly-labelled placeholder data —
  replace before any demo.** See "Data — read this before demoing" below.
- **County matcher** (`src/notices/county-matcher.ts`) — normalizes free-text county
  input against all 47 counties.
- **Response composer** (`src/conversation/response-composer.service.ts`) — the trust boundary.
  Template-based by default (no network dependency); any field marked
  `"not_confirmed"` is shown to the user as unconfirmed, never smoothed
  over or guessed. An optional LLM rephrasing pass (Mistral by default,
  or Claude with `LLM_PROVIDER=anthropic`)
  (`USE_LLM_COMPOSER=true`) only polishes tone/language — it's explicitly
  instructed not to add or change any fact.
- **Expiry** — a notice whose deadline has passed is never listed
  (`NoticeStoreService`), so the bot can't announce a closed hearing as open.
  Notices with an unconfirmed deadline are always shown, flagged as such.
- **Reminder scheduler** (`src/reminders/reminders.service.ts`) — daily
  `@Cron` job via `@nestjs/schedule`;
  sends one reminder in the last 3 days before a notice's deadline, for users
  who opted in with "remind &lt;number&gt;". Never schedules against an
  unconfirmed deadline.
- **Sessions** (`src/session/session.service.ts`) — saved to
  `data/sessions.json` (`SESSION_STORE_PATH`) so conversations and reminders
  survive a restart.

## Setup

```bash
pnpm install
cp .env.example .env
```

Leave `USE_LLM_COMPOSER=false` and the WhatsApp vars blank to run the whole
thing with zero external dependencies.

## Run

```bash
pnpm dev
```

This runs `nest start --watch`. For a production build: `pnpm build` then
`pnpm start` (runs `dist/main.js`).

Then open **http://localhost:3000/index.html** to chat with the bot in a
browser (mimics the WhatsApp conversation flow).

## Tests

```bash
pnpm test
```

Runs the whole app against fixture data (never your `.env`, never the real
LLM or WhatsApp APIs), plus a check of `data/notices.json` itself — run it
after every edit to the notices file.

## Data — read this before demoing

`data/notices.json` ships with **placeholder entries only**, clearly marked
`EXAMPLE` and `not_confirmed`. This is intentional: the whole point of
Sahihi is that it never presents information it hasn't verified, so this
scaffold doesn't fabricate real-looking Nairobi notices either.

Before your demo:

1. Manually research and curate 3–5 real, currently-active public
   participation notices for Nairobi County from official sources (county
   gazette, county assembly notices, county website).
2. Fill in every field for each notice — `deadline`, `venue`,
   `submission_instructions`, `source_name`, `source_url`,
   `date_published`, `last_verified`. If a detail genuinely isn't
   confirmed anywhere, leave it as `"not_confirmed"` — the composer will
   surface that honestly rather than guess.
3. Re-verify `last_verified` dates close to your demo/submission date.

## Conversation flow

```
user: hi
bot:  greeting, asks for county
user: nairobi
bot:  numbered list of active notices (title, summary, deadline, source,
      last verified)
user: 1                → submission details for notice #1
user: remind 1          → opt-in reminder, 2-3 days before deadline
user: change county      → resets to ask for county again
```

Swahili works the same way — say "kiswahili" or "habari" once, and the
session's language switches for all subsequent replies.

## Consent and opt-out

Setting a reminder stores the user's WhatsApp number, so every reminder
confirmation tells them how to stop. Replying **stop** (also `cancel`,
`unsubscribe`, `acha`, `sitisha`) cancels their reminders and deletes their
session from the store. Before going live you also need a privacy notice and
a retention policy for `data/sessions.json` — it holds phone numbers, which
are personal data under Kenya's Data Protection Act.

## Wiring up real WhatsApp

1. Create a Meta developer app + WhatsApp Business API product, get a
   temporary access token and phone number ID.
2. Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_VERIFY_TOKEN`, and `WHATSAPP_APP_SECRET` (Meta dashboard → App
   settings → Basic → App secret) in `.env`. With the app secret set, only
   requests genuinely signed by Meta are accepted.
3. Point the Meta webhook config at
   `https://<your-deployed-url>/webhook/whatsapp`, using the same
   `WHATSAPP_VERIFY_TOKEN` in the Meta dashboard's verify-token field.
4. Create and submit a **message template** for reminders in the Meta
   dashboard (a utility template with two body variables: `{{1}}` notice
   title, `{{2}}` deadline, e.g. `Reminder: the public participation deadline
   for "{{1}}" is {{2}}. Reply MENU for details or STOP to cancel reminders.`).
   Once approved, set `WHATSAPP_REMINDER_TEMPLATE` to its name. This is
   required: Meta rejects free-form messages sent more than 24 hours after the
   user's last message, which is exactly when reminders go out.
5. No other code changes needed — `src/whatsapp/` already handles the
   verification handshake, inbound/outbound messages, template sends and
   signature checks once these env vars are set.

## What's deliberately NOT built (per the MVP scope)

- No live scraping of county websites/gazettes — data is manually curated,
  as the design doc specifies. State this plainly in your written summary.
- No Postgres/Redis — sessions and reminders live in a single JSON file,
  fine for a hackathon demo on one server, not for production scale (swap
  `SessionService` in `src/session/session.service.ts` for a real store if
  you take this further).
