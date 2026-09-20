import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";

import { AppController } from "./app.controller";
import { ChatModule } from "./chat/chat.module";
import { RemindersModule } from "./reminders/reminders.module";
import { WhatsappModule } from "./whatsapp/whatsapp.module";

@Module({
  imports: [
    // Tests configure everything through process.env, never the local .env.
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: process.env.NODE_ENV === "test" }),
    ScheduleModule.forRoot(),
    ChatModule,
    WhatsappModule,
    RemindersModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
