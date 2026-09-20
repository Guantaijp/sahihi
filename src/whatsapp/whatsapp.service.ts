import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";

// Outbound send via Meta Graph API, plus inbound webhook signature checks.
@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    if (this.config.get("WHATSAPP_TOKEN") && !this.config.get("WHATSAPP_APP_SECRET")) {
      this.logger.warn("WHATSAPP_APP_SECRET is not set — webhook requests are not being signature-checked.");
    }
  }

  /**
   * Sends a reminder. Meta only allows free-form messages within 24 hours of
   * the user's last message, and reminders go out days later — so when
   * WHATSAPP_REMINDER_TEMPLATE is configured we send that approved template
   * instead. Without it (local dev, console stub) we fall back to plain text.
   */
  async sendReminder(to: string, reminder: { title: string; deadline: string; text: string }): Promise<void> {
    const template = this.config.get<string>("WHATSAPP_REMINDER_TEMPLATE");
    if (!template || !this.config.get("WHATSAPP_TOKEN")) {
      await this.sendMessage(to, reminder.text);
      return;
    }
    await this.sendTemplate(to, template, [reminder.title, reminder.deadline]);
  }

  /** Sends an approved WhatsApp message template with positional body parameters. */
  async sendTemplate(to: string, templateName: string, params: string[]): Promise<void> {
    await this.send(to, {
      type: "template",
      template: {
        name: templateName,
        language: { code: this.config.get<string>("WHATSAPP_REMINDER_TEMPLATE_LANG", "en") },
        components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
      },
    });
  }

  async sendMessage(to: string, body: string): Promise<void> {
    await this.send(to, { type: "text", text: { body } }, body);
  }

  private async send(to: string, payload: Record<string, unknown>, logBody?: string): Promise<void> {
    const token = this.config.get<string>("WHATSAPP_TOKEN");
    const phoneNumberId = this.config.get<string>("WHATSAPP_PHONE_NUMBER_ID");

    if (!token || !phoneNumberId) {
      // Not configured yet — log instead, so the rest of the app is testable
      // via the /chat + web-chat UI before WhatsApp Business API access lands.
      this.logger.log(`[WhatsApp send stub] to=${to}\n${logBody ?? JSON.stringify(payload)}`);
      return;
    }

    const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", to, ...payload }),
    });

    if (!res.ok) {
      throw new Error(`WhatsApp send to ${to} failed: ${res.status} ${await res.text()}`);
    }
  }

  /**
   * Checks Meta's X-Hub-Signature-256 header (HMAC-SHA256 of the raw request
   * body, keyed with the app secret) so only Meta can post to the webhook.
   * Returns true when WHATSAPP_APP_SECRET isn't set, to keep local testing easy.
   */
  isValidSignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): boolean {
    const appSecret = this.config.get<string>("WHATSAPP_APP_SECRET");
    if (!appSecret) return true;
    if (!rawBody || !signatureHeader) return false;

    const expected = Buffer.from("sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex"));
    const received = Buffer.from(signatureHeader);
    return expected.length === received.length && timingSafeEqual(expected, received);
  }
}
