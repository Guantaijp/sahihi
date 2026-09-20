# Sahihi — Written Summary

**Track:** Transparency & Accountability (with a Stability & Social Cohesion edge:
most local conflict over budgets and projects starts with people learning too late
what was decided, and by whom).

**Repository:** https://github.com/Guantaijp/sahihi
**What it is:** a WhatsApp assistant that tells a Kenyan resident which public
participation opportunities are open in their county right now, what each one is
about, how to take part, and — crucially — where the information came from and when
it was last checked.

---

## 1. The problem we set out to solve

Kenya's constitution guarantees public participation in county and national
decisions. In practice, the information needed to exercise that right is almost
impossible to find:

- **Notices are published as pictures.** Nairobi City County posts participation
  notices as photographs of printed letters. A deadline inside a JPEG can't be
  searched, forwarded, translated or read by a screen reader.
- **They are scattered.** 47 county assemblies, 47 county executives, both houses of
  Parliament, the Kenya Gazette, newspapers and physical notice boards. There is no
  single index.
- **They go stale invisibly.** One county assembly's website still shows 2024 as its
  most recent news. Nothing tells a citizen whether what they're reading is current.
- **Nobody can verify what circulates.** Dates and venues spread on social media
  detached from any official source.

Nairobi County's own assessment, published in August 2026, found that **0.74% of
Nairobi residents take part in public engagement forums**. The county names lack of
information as the cause.

## 2. Who it is for

Residents with an ordinary phone and a WhatsApp account, who want to know what is
being decided about their ward, and who do not know a "memorandum" from a "gazette
notice". Design consequences:

- **WhatsApp and plain text.** No app to install, no account to create, no portal.
  Works on a low-end handset, a weak signal and a small data bundle.
- **Numbers, not menus.** Every action is a word or a digit: a county name, `1`,
  `remind 1`, `more`, `all`, `stop`.
- **English and Kiswahili**, switched by using either language in the conversation.
- **Answers end with a next step:** venue, time, how to submit, and the source link.

## 3. Information sources

Everything in the knowledge base today comes from a primary official document that a
human opened and read:

| Source | Used for |
| --- | --- |
| [National Assembly notice of public hearings, 16 Sept 2026 (PDF)](https://parliament.go.ke/sites/default/files/2026-09/DC%20Health_Final%20PP%20TC%20Bill%20Advert_14.9.2026.pdf) | 7 county hearings on the Tobacco Control (Amendment) Bill — venue, date, time per county |
| [Senate bills page, parliament.go.ke](https://www.parliament.go.ke/the-senate/house-business/bills) | 24 bills currently open for public comment, each with its bill document |
| [nairobi.go.ke](https://nairobi.go.ke) notices and [nairobiassembly.go.ke](https://nairobiassembly.go.ke) | Checked for open county notices; the three recent ones had all closed (22 June, 2 July, 1 September 2026), so none were published |

**Deliberately excluded:** a reported nationwide hearing series on six education
bills, and a 28 September Senate deadline reported by two news outlets. Neither could
be confirmed on an official page, so neither is presented as fact. The Senate bill
notices therefore show "deadline: not yet confirmed" rather than the reported date.

Data is curated by hand today. The next build step is a fetcher that reads the
machine-readable sources (Parliament, county websites, the Gazette) and files
candidates into a review queue, where a person approves each one before it can reach
a user. Automation proposes; a human still verifies.

## 4. Approach to trust and accuracy

This is the core of the project. The rule is: **the bot would rather say nothing than
guess.**

1. **A single trust boundary.** One module renders every user-facing message
   (`src/conversation/response-composer.service.ts`). It can only present values that
   exist in the notice record.
2. **Unknowns are shown, not smoothed over.** Any field whose value is
   `not_confirmed` is rendered as *"not yet confirmed — please check the official
   source below"*. There is no code path that invents a date, venue or URL.
3. **Provenance on every notice.** Each one carries the issuing body, a link to the
   source document, and a `last_verified` date shown to the user.
4. **Freshness is enforced, not promised.** A notice whose deadline has passed
   disappears from every reply automatically, so a closed hearing can never be
   announced as open.
5. **Reminders can't be built on guesses.** "Remind me" is refused when a deadline is
   unconfirmed, and the scheduler will not fire against one.
6. **AI never sources a fact.** An optional rewording layer may only rephrase text
   that is already verified, is instructed not to alter any fact, date, name or URL,
   is off by default, and falls back to the exact template text on any failure.
7. **The rules are tested.** 59 automated tests cover them, including tests over the
   real data file that fail on a missing field, a malformed date, a bad source URL, a
   duplicate id or a leftover placeholder.

**Privacy.** Reminders are opt-in; every confirmation tells the user how to stop;
`stop` cancels reminders and deletes their stored record. Inbound WhatsApp webhooks
are verified against Meta's `X-Hub-Signature-256` so nobody can inject fake messages.
A published privacy notice and a retention rule are still outstanding and are listed
as such.

## 5. How AI coding tools were used

The idea, the track choice and the trust rules are ours. **Claude Code (Claude Opus)**
did the engineering, in an iterative session where each step was reviewed and tested:

**Building.** Rewrote an early Node/Express prototype into a structured NestJS
TypeScript service (modules for conversation, notices, sessions, reminders,
WhatsApp), then added cross-county listing, keyword search over notices, paging that
respects WhatsApp's 4,096-character limit, a national tier, and the WhatsApp channel
with template-based reminders.

**Hardening.** Found and fixed four real defects carried over from the prototype
(internal county keys shown to users, reminders that could fire twice, reminders
stored against unconfirmed deadlines, silent send failures). Added webhook signature
verification, consent and deletion, session persistence, and an LLM timeout and
cool-down so a rate-limited provider can never slow a reply.

**Testing.** Wrote the 59-test suite, including the data-file tests that make a bad
edit to `data/notices.json` fail `pnpm test` rather than reach a user.

**Research — the unusual part.** The same tool collected the real data: it read
Parliament's hearing schedule out of a PDF table, read county notices out of scanned
JPEG images, and pulled the Senate's open bills from the parliamentary site. Every
value entered was taken from the official document, and **facts it could not verify
officially were left out or marked unconfirmed** — the same discipline the product
applies to its users.

**What AI did not do:** choose the problem, invent any notice, or supply any civic
fact from its own memory.

## 6. Constraints, honestly stated

| Constraint | Where we stand |
| --- | --- |
| Trust & verification | Strong: sources, verification dates, honest unknowns, automatic expiry |
| Low bandwidth / basic devices | Strong: plain text over WhatsApp; no images, no app |
| Clear next steps | Strong: venue, time, submission route and source in every detail view |
| Multilingual | Partial: English and Kiswahili; some field labels still English; structure supports more languages |
| Privacy & security | Partial: consent, deletion, signature checks in place; privacy notice and retention rule outstanding |
| Accessibility | Partial: works on basic handsets; no SMS/USSD path yet for phones without WhatsApp |
| Local relevance | Partial: 7 counties with local hearings plus a national tier covering all 47; 40 counties await local collection |

## 7. What would come next

1. Fetcher with a human review queue — the scalability unlock.
2. Meta message-template approval, required before reminders can be delivered.
3. A pilot with one county's civic groups, to capture the notices that never go online.
4. Finish Kiswahili, then add a third language.
5. Publish a privacy notice and set a retention period.

---

**Sahihi** is Kiswahili for *correct, accurate, authentic*. The name is the
specification: a civic information tool is only worth using if a person can act on
what it says.
