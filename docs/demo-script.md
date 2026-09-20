# Demo video — recording guide and script

Target length: **2 to 2½ minutes**. Judges watch a lot of these; get to the working
product inside 20 seconds.

---

## 1. Before you hit record

**Start the app and check it's healthy**

```bash
cd C:\Users\GUANTAI\projects\sahihi
pnpm build
pnpm start          # serves on http://localhost:3000 (a server may already be running on 3001)
```

**Reset so the demo starts clean**

```bash
del data\sessions.json
```

Then open **http://localhost:3000/index.html** — or **http://localhost:3001/index.html** if that is the one already running and refresh once (each refresh starts a
fresh conversation).

**Check the data is still current.** The seven tobacco hearings expire after
26 September 2026 and will disappear on their own. Type `nairobi` before recording — if
you only see Senate bills, add fresh notices first or the demo loses its strongest slide.

**Tidy the screen**
- Browser at 100% zoom, bookmarks bar hidden (Ctrl+Shift+B), one tab only.
- Close Slack, mail, notifications (Windows: Focus Assist on).
- Have a terminal open on a second window for the test run shot.

## 2. What to record with

**Simplest — built into Windows 11:** press **Win + Alt + R** to start and stop
recording the active window. Files land in `Videos\Captures` as MP4. Press **Win + G**
first if you want to check the microphone is on.

**Better quality, free:** [OBS Studio](https://obsproject.com) — set a 1920×1080 canvas,
add a *Window Capture* of the browser, record to MP4.

**Editing / trimming:** Clipchamp is preinstalled on Windows 11. Trim dead air at the
start and end, and cut any pause longer than two seconds.

**Settings:** 1080p, 30fps. Speak over it live — narrating while you type is faster than
recording audio separately, and a 250MB limit is generous for 2½ minutes.

## 3. The script

Type the **bold** text; say the italic line while the reply appears. Wait for each reply
to finish before typing the next one.

### Shot 1 — The problem (0:00–0:20) · screen: the browser chat, not yet used

> *"Kenya's constitution gives everyone a say in county and national decisions. But the
> notices are published as photographs of printed letters, scattered across 47 county
> assemblies and two houses of Parliament. Nairobi County's own figures say 0.74% of
> residents take part. This is Sahihi — it answers one question: what can I have a say
> in right now?"*

### Shot 2 — A real answer (0:20–0:45)

Type: **nairobi**

> *"I say my county, and I get what's actually open — with the deadline, the official
> source, and the date a human last checked it. These are real: a public hearing from
> Parliament's own notice, and bills open for comment before the Senate."*

### Shot 3 — What do I actually do (0:45–1:05)

Type: **1**

> *"Reply with a number and I get the venue, the date, the time, and exactly how to take
> part — plus the link to the official document, so I can check it myself. Finding the
> notice is only half the job."*

### Shot 4 — The refusal (1:05–1:30) · **the most important shot**

Type: **2**

> *"Now watch this one. The deadline says 'not yet confirmed'. Two news outlets reported
> a date for this bill — but no official page confirms it, so Sahihi refuses to state it.
> A wrong deadline is worse than silence: someone travels to a hearing that closed last
> week. It would rather say nothing than guess."*

### Shot 5 — Reminders and consent (1:30–1:50)

Type: **remind 1**

> *"I can ask to be reminded before the deadline — and every confirmation tells me how to
> stop."*

Type: **stop**

> *"One word cancels it and deletes what was stored about me."*

### Shot 6 — Reach and questions (1:50–2:15)

Type: **kisumu**

> *"Other counties work the same way, and bills before Parliament apply everywhere, so one
> entry reaches all 47 counties."*

Type: **what is open about health?**

> *"And I can just ask a question — no menus to learn."*

### Shot 7 — Built and tested (2:15–2:30) · switch to the terminal

Run: **pnpm test**

> *"Fifty-nine automated tests, including tests over the data file itself, so a bad edit
> fails the build instead of reaching a user. Built with AI coding tools — which also read
> Parliament's hearing schedule out of a PDF and county notices out of scanned images, and
> left out anything they couldn't verify. The code is on GitHub."*

End on the repo URL or the README.

## 4. If something goes wrong mid-take

| Problem | Fix |
| --- | --- |
| Bot replies with the greeting instead of a list | It's a fresh session — type `hi` first, then the county |
| Replies feel slow | Set `USE_LLM_COMPOSER=false` in `.env` and restart; the AI layer is optional |
| Wrong session state | Refresh the page — every refresh is a new conversation |
| A notice has expired | Expected after 26 Sept: update `data/notices.json`, no restart needed |
| Port already in use | Another app is on 3000; run `set PORT=3001 && pnpm start` and use that port |

## 5. Two things to avoid

- **Don't claim it's live on WhatsApp.** Say "the same engine serves WhatsApp; this is the
  browser view so you can see it without a Meta account." Judges respect the distinction.
- **Don't oversell coverage.** "Seven counties with local hearings plus national coverage
  for all 47, and 40 counties still to collect" is stronger than implying nationwide data.
