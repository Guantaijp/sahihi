import { Module } from "@nestjs/common";

import { ConversationModule } from "../conversation/conversation.module";
import { ChatController } from "./chat.controller";

@Module({
  imports: [ConversationModule],
  controllers: [ChatController],
})
export class ChatModule {}
