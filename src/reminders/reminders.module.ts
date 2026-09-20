import { Module } from "@nestjs/common";

import { ConversationModule } from "../conversation/conversation.module";
import { NoticesModule } from "../notices/notices.module";
import { SessionModule } from "../session/session.module";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { RemindersService } from "./reminders.service";

@Module({
  imports: [ConversationModule, NoticesModule, SessionModule, WhatsappModule],
  providers: [RemindersService],
})
export class RemindersModule {}
