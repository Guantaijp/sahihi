import { Injectable } from "@nestjs/common";

import { matchCounty } from "../notices/county-matcher";
import { NoticeStoreService } from "../notices/notice-store.service";
import { CountyNotice, isConfirmed } from "../notices/notice.types";
import { Language, ListState, SessionService } from "../session/session.service";
import { PAGE_SIZE, ResponseComposerService } from "./response-composer.service";

const GREETING_WORDS = ["menu", "start", "hi", "hello", "habari"];
const STOP_WORDS = ["stop", "cancel", "unsubscribe", "acha", "sitisha"];
const ALL_WORDS = ["all", "list", "list all", "show all", "everything", "all counties", "zote", "orodha"];
const MORE_WORDS = ["more", "next", "zaidi", "endelea"];

const SWAHILI_HINT_WORDS = ["kiswahili", "swahili", "kaunti", "habari", "naomba"];

function detectLanguageHint(text: string): Language | null {
  const lower = text.toLowerCase();
  if (SWAHILI_HINT_WORDS.some((w) => lower.includes(w))) return "sw";
  return null;
}

function extractNumber(text: string): number | null {
  const match = text.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

@Injectable()
export class ConversationService {
  constructor(
    private readonly sessions: SessionService,
    private readonly notices: NoticeStoreService,
    private readonly composer: ResponseComposerService,
  ) {}

  /**
   * Handles one inbound message for a given user/session and returns the
   * plain-text reply to send back. `userId` should be a stable identifier
   * (WhatsApp wa_id, or a generated session id for the test web-chat).
   */
  async handleMessage(userId: string, rawText: string): Promise<string> {
    const text = (rawText || "").trim();
    let session = this.sessions.get(userId);

    // Language first: "habari" is both a greeting and a request for Swahili.
    const lower = text.toLowerCase();
    const langHint = detectLanguageHint(text);
    if (langHint && langHint !== session.language) {
      session = this.sessions.update(userId, { language: langHint });
    }

    // Global commands, available in any state.
    if (GREETING_WORDS.includes(lower)) {
      const { language } = session;
      this.sessions.reset(userId);
      session = this.sessions.update(userId, { state: "awaiting_county", language });
      return this.finalize(this.composer.greeting(session.language), session.language);
    }
    if (STOP_WORDS.includes(lower)) {
      const { language } = session;
      this.sessions.delete(userId);
      return this.finalize(this.composer.remindersStopped(language), language);
    }
    if (lower === "change county" || lower === "reset") {
      session = this.sessions.update(userId, { state: "awaiting_county", county: null, lastList: null });
      return this.finalize(this.composer.changeCountyPrompt(session.language), session.language);
    }

    if (ALL_WORDS.includes(lower)) return this.showAll(userId, session.language);
    if (MORE_WORDS.includes(lower)) return this.showMore(userId, session.language);

    switch (session.state) {
      case "awaiting_choice": {
        // A number refers to the list last shown; "remind <n>" opts into a reminder.
        const num = extractNumber(text);
        if (num) {
          const item = session.lastList?.items[num - 1];
          if (!item) return this.finalize(this.composer.unrecognizedChoice(session.language), session.language);
          return lower.includes("remind")
            ? this.setReminder(userId, item, session.language)
            : this.finalize(this.composer.submissionDetail(item.notice, session.language), session.language);
        }
        return this.handleFreeText(userId, text, session.language, false);
      }

      // "start" behaves like awaiting_county: someone whose very first message is
      // already a county or a question gets an answer, not a greeting that
      // throws their question away. An empty message still gets the greeting.
      default: {
        if (!text) {
          session = this.sessions.update(userId, { state: "awaiting_county" });
          return this.finalize(this.composer.greeting(session.language), session.language);
        }
        this.sessions.update(userId, { state: "awaiting_county" });
        return this.handleFreeText(userId, text, session.language, true);
      }
    }
  }

  /**
   * Anything that isn't a command or a list number: try a county name, then a
   * keyword search over every notice on file, then (if enabled) an LLM answer
   * grounded strictly in those notices.
   */
  private async handleFreeText(userId: string, text: string, lang: Language, expectingCounty: boolean): Promise<string> {
    const { matched, county } = matchCounty(text);
    if (matched) return this.showCounty(userId, county, lang);

    // "What public participation is available?" has no searchable words left —
    // the useful answer is the whole list.
    if (this.notices.isBroadQuery(text)) return this.showAll(userId, lang);

    const matches = this.notices.search(text);
    if (matches.length > 0) {
      return this.showList(userId, { header: this.composer.searchHeader(text, lang), items: matches, offset: 0, showCounty: true }, lang);
    }

    const answer = await this.composer.answerQuestion(text, this.notices.getAllOpenNotices(), lang);
    if (answer) return this.composer.withAllHint(answer, lang);

    if (expectingCounty) {
      return this.finalize(this.composer.withAllHint(this.composer.countyNotFound(lang), lang), lang);
    }
    return this.finalize(this.composer.noMatches(text, lang), lang);
  }

  private showAll(userId: string, lang: Language): Promise<string> {
    const items = this.notices.getAllOpenNotices();
    if (items.length === 0) return this.finalize(this.composer.noMatches("", lang), lang);
    return this.showList(userId, { header: this.composer.allNoticesHeader(lang), items, offset: 0, showCounty: true }, lang);
  }

  private showCounty(userId: string, county: string, lang: Language): Promise<string> {
    const displayName = this.notices.getCountyDisplayName(county);
    const items: CountyNotice[] = this.notices.getCountyNotices(county);

    if (items.length === 0) {
      this.sessions.update(userId, { county, state: "awaiting_county", lastList: null });
      return this.finalize(this.composer.withAllHint(this.composer.noNotices(displayName, lang), lang), lang);
    }

    this.sessions.update(userId, { county });
    return this.showList(
      userId,
      { header: this.composer.countyNoticesHeader(displayName, lang), items, offset: 0, showCounty: true },
      lang,
    );
  }

  /** Shows the next page of the list the user is already looking at. */
  private showMore(userId: string, lang: Language): Promise<string> {
    const list = this.sessions.get(userId).lastList;
    if (!list || list.offset + PAGE_SIZE >= list.items.length) {
      return this.finalize(this.composer.noMore(lang), lang);
    }
    return this.showList(userId, { ...list, offset: list.offset + PAGE_SIZE }, lang);
  }

  private showList(userId: string, list: ListState, lang: Language): Promise<string> {
    this.sessions.update(userId, { state: "awaiting_choice", lastList: list });
    return this.finalize(
      this.composer.noticeList(list.header, list.items, lang, { offset: list.offset, showCounty: list.showCounty }),
      lang,
    );
  }

  private setReminder(userId: string, item: CountyNotice, lang: Language): Promise<string> {
    const session = this.sessions.get(userId);
    // Only store reminders that can actually fire (confirmed deadline),
    // and don't store the same notice twice.
    const alreadySet = session.reminders.some((r) => r.noticeId === item.notice.id);
    if (isConfirmed(item.notice.deadline) && !alreadySet) {
      this.sessions.update(userId, {
        reminders: [
          ...session.reminders,
          { noticeId: item.notice.id, county: item.county, deadline: item.notice.deadline },
        ],
      });
    }
    return this.finalize(this.composer.reminderConfirmation(item.notice, lang), lang);
  }

  private finalize(templateText: string, lang: Language): Promise<string> {
    return this.composer.polishWithLLM(templateText, lang);
  }
}
