import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { ResponseComposerService } from "../conversation/response-composer.service";
import { NoticeStoreService } from "../notices/notice-store.service";
import { isConfirmed } from "../notices/notice.types";
import { Reminder, SessionService } from "../session/session.service";
import { WhatsappService } from "../whatsapp/whatsapp.service";

const REMINDER_WINDOW_DAYS = 3;

// Runs once a day. For each session with an unsent reminder whose deadline
// (an ISO date string, e.g. "2026-10-01") is 0-3 days away, sends a reminder
// via WhatsApp (or the console-log stub if WhatsApp isn't configured), then
// marks it sent so it only ever goes out once. A failed send is retried on the
// next daily run while still inside the window.
//
// NOTE: deadlines of "not_confirmed" are never scheduled — ConversationService
// doesn't store a reminder for those in the first place.

@Injectable()
export class RemindersService implements OnModuleInit {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly sessions: SessionService,
    private readonly notices: NoticeStoreService,
    private readonly composer: ResponseComposerService,
    private readonly whatsapp: WhatsappService,
  ) {}

  onModuleInit() {
    this.logger.log("Reminder scheduler started (daily at 08:00 server time).");
  }

  @Cron("0 8 * * *")
  async sendDueReminders() {
    const now = new Date();

    for (const [userId, session] of this.sessions.all()) {
      for (const reminder of session.reminders) {
        if (reminder.sentAt || !isConfirmed(reminder.deadline)) continue;

        const deadlineDate = new Date(reminder.deadline);
        if (Number.isNaN(deadlineDate.getTime())) continue;

        const daysUntil = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntil >= 0 && daysUntil <= REMINDER_WINDOW_DAYS && (await this.sendReminder(userId, reminder))) {
          this.markSent(userId, reminder.noticeId);
        }
      }
    }
  }

  private async sendReminder(userId: string, reminder: Reminder): Promise<boolean> {
    const notice = this.notices.getNoticeById(reminder.county, reminder.noticeId);
    if (!notice) return false;

    try {
      await this.whatsapp.sendReminder(userId, {
        title: notice.title,
        deadline: notice.deadline,
        text: this.composer.reminderDue(notice),
      });
      return true;
    } catch (err) {
      this.logger.error(`Failed to send reminder to ${userId}: ${(err as Error).message}`);
      return false;
    }
  }

  private markSent(userId: string, noticeId: string) {
    const sentAt = new Date().toISOString();
    const reminders = this.sessions
      .get(userId)
      .reminders.map((r) => (r.noticeId === noticeId ? { ...r, sentAt } : r));
    this.sessions.update(userId, { reminders });
  }
}
