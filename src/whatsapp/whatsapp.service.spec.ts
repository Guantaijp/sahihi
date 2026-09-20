import "../testing/test-env";

import { ConfigService } from "@nestjs/config";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import { WhatsappService } from "./whatsapp.service";

function serviceWith(env: Record<string, string>) {
  const config = { get: (key: string, fallback?: string) => env[key] ?? fallback } as unknown as ConfigService;
  return new WhatsappService(config);
}

const reminder = { title: "Budget Hearing", deadline: "2026-10-01", text: "Reminder: …" };

describe("WhatsappService", () => {
  describe("sendReminder", () => {
    it("uses the approved template when one is configured", async () => {
      const service = serviceWith({ WHATSAPP_TOKEN: "t", WHATSAPP_REMINDER_TEMPLATE: "deadline_reminder" });
      const calls: unknown[][] = [];
      (service as any).sendTemplate = async (...args: unknown[]) => void calls.push(args);

      await service.sendReminder("254700000000", reminder);
      assert.deepEqual(calls, [["254700000000", "deadline_reminder", ["Budget Hearing", "2026-10-01"]]]);
    });

    it("falls back to plain text when no template is configured", async () => {
      const service = serviceWith({ WHATSAPP_TOKEN: "t" });
      const calls: unknown[][] = [];
      (service as any).sendMessage = async (...args: unknown[]) => void calls.push(args);

      await service.sendReminder("254700000000", reminder);
      assert.deepEqual(calls, [["254700000000", "Reminder: …"]]);
    });
  });

  describe("isValidSignature", () => {
    const body = Buffer.from('{"entry":[]}');
    const sign = (secret: string) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

    it("accepts everything when no app secret is set (local dev)", () => {
      assert.equal(serviceWith({}).isValidSignature(body, undefined), true);
    });

    it("accepts a correct signature and rejects anything else", () => {
      const service = serviceWith({ WHATSAPP_APP_SECRET: "s3cret" });
      assert.equal(service.isValidSignature(body, sign("s3cret")), true);
      assert.equal(service.isValidSignature(body, sign("wrong")), false);
      assert.equal(service.isValidSignature(body, undefined), false);
      assert.equal(service.isValidSignature(undefined, sign("s3cret")), false);
    });
  });
});
