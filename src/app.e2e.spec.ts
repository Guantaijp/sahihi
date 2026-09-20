import "./testing/test-env";

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { SessionService } from "./session/session.service";
import { createTestApp, isoDaysFromNow, makeNotice, useFixtureNotices, waitFor } from "./testing/helpers";

const APP_SECRET = "test-app-secret";
const VERIFY_TOKEN = "test-verify-token";
const DEADLINE = isoDaysFromNow(10);

process.env.WHATSAPP_APP_SECRET = APP_SECRET;
process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN;
useFixtureNotices({
  nairobi: {
    display_name: "Nairobi",
    notices: [
      makeNotice({
        id: "nrb-1",
        title: "Budget Hearing",
        topic: "budget",
        deadline: DEADLINE,
        venue: "County Hall",
        submission_instructions: "Email comments@example.org",
        source_name: "Nairobi County Assembly",
        source_url: "https://example.org/budget",
        last_verified: "2026-09-01",
      }),
      makeNotice({ id: "nrb-2", title: "Finance Bill" }),
      makeNotice({ id: "nrb-3", title: "Closed Last Week", deadline: isoDaysFromNow(-7) }),
    ],
  },
});

describe("Sahihi app (e2e)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  before(async () => {
    t = await createTestApp();
  });
  after(async () => {
    await t.app.close();
  });

  it("GET /health", async () => {
    const res = await fetch(`${t.url}/health`);
    assert.deepEqual(await res.json(), { ok: true });
  });

  it("serves the test web-chat page", async () => {
    const res = await fetch(`${t.url}/index.html`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Sahihi/);
  });

  describe("POST /chat", () => {
    it("greets and asks for a county", async () => {
      assert.match(await t.chat("flow", "hi"), /Which county are you in\?/);
    });

    it("rejects an unknown county", async () => {
      assert.match(await t.chat("flow", "atlantis"), /didn't recognise that county/);
    });

    it("lists notices, showing confirmed facts and flagging unconfirmed ones", async () => {
      const reply = await t.chat("flow", "I live in Nairobi county");
      assert.match(reply, /Here's what's active in Nairobi County/);
      assert.match(reply, /1\. Budget Hearing/);
      assert.ok(reply.includes(`Deadline: ${DEADLINE}`));
      assert.ok(reply.includes("Source: Nairobi County Assembly — https://example.org/budget"));
      assert.match(reply, /2\. Finance Bill\*\n(.*\n)*? {3}Deadline: not yet confirmed/);
      // Titles and the list header are bold for readability (WhatsApp *asterisk* syntax).
      assert.match(reply, /^\*Here's what's active in Nairobi County right now:\*$/m);
      assert.match(reply, /^\*1\. Budget Hearing\*$/m);
    });

    it("never lists a notice whose deadline has passed", async () => {
      await t.chat("expired", "hi");
      const reply = await t.chat("expired", "nairobi");
      assert.doesNotMatch(reply, /Closed Last Week/);
      assert.match(reply, /2. Finance Bill/);
    });

    it("shows submission details for a notice number", async () => {
      const reply = await t.chat("flow", "1");
      assert.match(reply, /^\*How to submit input — Budget Hearing\*$/m);
      assert.match(reply, /Venue: County Hall/);
      assert.match(reply, /How to submit: Email comments@example.org/);
    });

    it("handles an out-of-range number and gibberish", async () => {
      assert.match(await t.chat("flow", "99"), /didn't quite catch that/);
      const reply = await t.chat("flow", "zzzqqq");
      assert.match(reply, /I don't have anything on file about "zzzqqq"/);
      assert.match(reply, /Reply "all" to see every notice I have/);
    });

    it("lists everything on file when asked, across counties", async () => {
      const reply = await t.chat("asks", "all");
      assert.match(reply, /^\*Here's every public participation notice I have on file right now:\*$/m);
      assert.match(reply, /^\*1\. Budget Hearing\*$/m);
      assert.match(reply, /^ {3}County: Nairobi$/m);
      assert.match(reply, /^\*2\. Finance Bill\*$/m);
      assert.doesNotMatch(reply, /Closed Last Week/);
    });

    it("treats a broad question as 'show me everything'", async () => {
      for (const question of ["what public participation is available?", "any opportunities right now?"]) {
        assert.match(await t.chat("asks", question), /Here's every public participation notice I have on file/);
      }
    });

    it("searches notices for a free-text question", async () => {
      const reply = await t.chat("asks", "is there anything about the budget?");
      assert.match(reply, /^\*Here's what I have on file about "is there anything about the budget\?":\*$/m);
      assert.match(reply, /1\. Budget Hearing/);
      assert.doesNotMatch(reply, /Finance Bill/);
    });

    it("answers a number from a search result, and keeps county for reminders", async () => {
      assert.match(await t.chat("asks", "1"), /How to submit input — Budget Hearing/);
      assert.match(await t.chat("asks", "remind 1"), /I'll remind you before the deadline/);
      assert.deepEqual(t.app.get(SessionService).get("asks").reminders, [
        { noticeId: "nrb-1", county: "nairobi", deadline: DEADLINE },
      ]);
    });

    it("pages long lists and stops at the end", async () => {
      await t.chat("paged", "all");
      assert.match(await t.chat("paged", "more"), /That's everything I have on file/);
    });

    it("stores a reminder for a confirmed deadline, only once", async () => {
      const reply = await t.chat("flow", "remind 1");
      assert.match(reply, /I'll remind you before the deadline for "Budget Hearing"/);
      assert.match(reply, /Reply "stop" any time to cancel your reminders/);
      await t.chat("flow", "remind 1");
      const reminders = t.app.get(SessionService).get("flow").reminders;
      assert.deepEqual(reminders, [{ noticeId: "nrb-1", county: "nairobi", deadline: DEADLINE }]);
    });

    it("refuses and does not store a reminder for an unconfirmed deadline", async () => {
      assert.match(await t.chat("flow", "remind 2"), /can't set a reminder for this one yet/);
      assert.equal(t.app.get(SessionService).get("flow").reminders.length, 1);
    });

    it("uses proper county names for counties with no data", async () => {
      assert.match(await t.chat("flow", "tana river"), /on file for Tana River County/);
      assert.match(await t.chat("names", "hi"), /Which county/);
      assert.match(await t.chat("names", "Murang'a"), /on file for Murang'a County/);
      assert.match(await t.chat("names", "Elgeyo Marakwet"), /on file for Elgeyo-Marakwet County/);
    });

    it("'stop' cancels reminders and forgets the user", async () => {
      assert.equal(t.app.get(SessionService).get("flow").reminders.length, 1);
      assert.match(await t.chat("flow", "stop"), /your reminders are cancelled and I've deleted/);
      assert.equal(t.app.get(SessionService).get("flow").reminders.length, 0);
      assert.equal(t.app.get(SessionService).get("flow").state, "start");
    });

    it("supports 'change county'", async () => {
      assert.match(await t.chat("flow", "change county"), /which county are you in\?/);
    });

    it("switches to Swahili", async () => {
      assert.match(await t.chat("sw", "habari"), /Uko kaunti gani\?/);
      const reply = await t.chat("sw", "nairobi");
      assert.match(reply, /Kaunti ya Nairobi/);
      assert.match(reply, /bado haijathibitishwa/);
    });

    it("returns 400 for a missing sessionId", async () => {
      const res = await fetch(`${t.url}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hi" }),
      });
      assert.equal(res.status, 400);
    });
  });

  describe("WhatsApp webhook", () => {
    const verifyUrl = (token: string) =>
      `${t.url}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=12345`;

    const inbound = (from: string, text: string) =>
      JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from, text: { body: text } }] } }] }] });

    const post = (body: string, signature?: string) =>
      fetch(`${t.url}/webhook/whatsapp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(signature ? { "X-Hub-Signature-256": signature } : {}),
        },
        body,
      });

    const sign = (body: string) => "sha256=" + createHmac("sha256", APP_SECRET).update(body).digest("hex");

    it("completes Meta's verification handshake", async () => {
      const res = await fetch(verifyUrl(VERIFY_TOKEN));
      assert.equal(res.status, 200);
      assert.equal(await res.text(), "12345");
    });

    it("rejects the handshake with a wrong verify token", async () => {
      assert.equal((await fetch(verifyUrl("wrong"))).status, 403);
    });

    it("rejects unsigned and wrongly-signed messages", async () => {
      const body = inbound("254700000001", "hi");
      assert.equal((await post(body)).status, 403);
      assert.equal((await post(body, "sha256=" + "0".repeat(64))).status, 403);
    });

    it("replies to a correctly-signed message", async () => {
      const body = inbound("254700000002", "hi");
      assert.equal((await post(body, sign(body))).status, 200);
      await waitFor(() => t.sent.some((m) => m.to === "254700000002"));
      assert.match(t.sent.find((m) => m.to === "254700000002")!.body, /Which county are you in\?/);
    });

    it("acknowledges non-message events without replying", async () => {
      const before = t.sent.length;
      const body = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: "x" }] } }] }] });
      assert.equal((await post(body, sign(body))).status, 200);
      await new Promise((r) => setTimeout(r, 100));
      assert.equal(t.sent.length, before);
    });
  });
});
