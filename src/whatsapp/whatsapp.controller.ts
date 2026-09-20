import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  type RawBodyRequest,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { ConfigService } from "@nestjs/config";

import { ConversationService } from "../conversation/conversation.service";
import { WhatsappService } from "./whatsapp.service";

@Controller("webhook/whatsapp")
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly conversation: ConversationService,
    private readonly whatsapp: WhatsappService,
  ) {}

  // --- Verification handshake (Meta calls this once when you set up the webhook) ---
  @Get()
  verify(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string,
  ) {
    if (mode === "subscribe" && token === this.config.get("WHATSAPP_VERIFY_TOKEN")) {
      return challenge;
    }
    throw new ForbiddenException();
  }

  // --- Inbound messages ---
  @Post()
  @HttpCode(200)
  receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Body() body: any,
  ) {
    if (!this.whatsapp.isValidSignature(req.rawBody, signature)) {
      throw new ForbiddenException("Invalid webhook signature");
    }

    // Acknowledge immediately; WhatsApp expects a fast 200 regardless of
    // how long your reply logic takes. The reply is handled in the background.
    void this.handleInbound(body);
  }

  private async handleInbound(body: any) {
    try {
      const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!message) return; // status update / non-message webhook event, ignore

      const from: string = message.from; // WhatsApp user id (phone number), our session key
      const text: string = message.text?.body || "";

      const reply = await this.conversation.handleMessage(from, text);
      await this.whatsapp.sendMessage(from, reply);
    } catch (err) {
      this.logger.error("Error handling WhatsApp webhook", err as Error);
    }
  }
}
