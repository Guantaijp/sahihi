import { Module } from "@nestjs/common";

import { NoticesModule } from "../notices/notices.module";
import { SessionModule } from "../session/session.module";
import { ConversationService } from "./conversation.service";
import { ResponseComposerService } from "./response-composer.service";

// Channel-agnostic conversation engine — the same ConversationService drives
// both the WhatsApp webhook and the local test web-chat.
@Module({
  imports: [NoticesModule, SessionModule],
  providers: [ConversationService, ResponseComposerService],
  exports: [ConversationService, ResponseComposerService],
})
export class ConversationModule {}
