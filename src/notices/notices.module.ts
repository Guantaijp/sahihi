import { Module } from "@nestjs/common";

import { NoticeStoreService } from "./notice-store.service";

@Module({
  providers: [NoticeStoreService],
  exports: [NoticeStoreService],
})
export class NoticesModule {}
