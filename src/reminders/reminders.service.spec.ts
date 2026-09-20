import "../testing/test-env";

import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { SessionService } from "../session/session.service";
import { createTestApp, isoDaysFromNow, makeNotice, useFixtureNotices } from "../testing/helpers";
import { WhatsappService } from "../whatsapp/whatsapp.service";
import { RemindersService } from "./reminders.service";

const SOON = isoDaysFromNow(2);
const LATER = isoDaysFromNow(10);

useFixtureNotices({
  nairobi: {
    display_name: "Nairobi",
    notices: [
      makeNotice({ id: "soon", title: "Soon Hearing", deadline: SOON }),
      makeNotice({ id: "later", title: "Later Hearing", deadline: LATER }),
    ],
  },
});

describe("RemindersService", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let sessions: SessionService;
  let reminders: RemindersService;

  before(async () => {
    t = await createTestApp();
    sessions = t.app.get(SessionService);
    reminders = t.app.get(RemindersService);
  });
  after(async () => {
    await t.app.close();
  });
  beforeEach(() => {
    t.sent.length = 0;
  });

  it("sends only reminders whose deadline is within 3 days", async () => {
    sessions.update("due", { reminders: [{ noticeId: "soon", county: "nairobi", deadline: SOON }] });
    sessions.update("notyet", { reminders: [{ noticeId: "later", county: "nairobi", deadline: LATER }] });

    await reminders.sendDueReminders();

    assert.equal(t.sent.length, 1);
    assert.equal(t.sent[0].to, "due");
    assert.equal(t.sent[0].body, `Reminder: the deadline for "Soon Hearing" is ${SOON}. Reply "stop" to cancel reminders.`);
  });

  it("never sends the same reminder twice", async () => {
    assert.ok(sessions.get("due").reminders[0].sentAt, "reminder should be marked as sent");
    await reminders.sendDueReminders();
    assert.equal(t.sent.length, 0);
  });

  it("retries on the next run if sending failed", async () => {
    sessions.update("flaky", { reminders: [{ noticeId: "soon", county: "nairobi", deadline: SOON }] });
    const whatsapp = t.app.get(WhatsappService);
    const workingSend = whatsapp.sendMessage;

    whatsapp.sendMessage = async () => {
      throw new Error("Meta is down");
    };
    await reminders.sendDueReminders();
    assert.equal(sessions.get("flaky").reminders[0].sentAt, undefined);

    whatsapp.sendMessage = workingSend;
    await reminders.sendDueReminders();
    assert.deepEqual(
      t.sent.map((m) => m.to),
      ["flaky"],
    );
    assert.ok(sessions.get("flaky").reminders[0].sentAt);
  });
});
