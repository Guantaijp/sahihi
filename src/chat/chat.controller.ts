import { Body, Controller, HttpCode, Post } from "@nestjs/common";

import { ConversationService } from "../conversation/conversation.service";
import { ChatMessageDto } from "./chat-message.dto";

// POST /chat  { sessionId: string, message: string }
// Generic channel-agnostic endpoint used by the local test web-chat UI
// (public/index.html). The same ConversationService is reused by the
// WhatsApp webhook in src/whatsapp.
@Controller("chat")
export class ChatController {
  constructor(private readonly conversation: ConversationService) {}

  @Post()
  @HttpCode(200)
  async chat(@Body() { sessionId, message }: ChatMessageDto) {
    const reply = await this.conversation.handleMessage(sessionId, message);
    return { reply };
  }
}
