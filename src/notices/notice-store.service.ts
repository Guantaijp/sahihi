import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { countyDisplayName } from "./county-matcher";
import { CountyNotice, isConfirmed, Notice, NoticeData } from "./notice.types";

/** Today as YYYY-MM-DD, in the server's timezone. */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * A notice is past once its confirmed deadline is before today. Notices whose
 * deadline isn't confirmed are always kept — we can't know that they've closed,
 * and the composer tells the user the deadline is unconfirmed.
 */
function isOpen(notice: Notice): boolean {
  return !isConfirmed(notice.deadline) || notice.deadline >= today();
}

// Words that carry no signal in a question like "what public participation is
// open in my area?" — every notice would match them.
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "any", "all", "what", "whats", "when", "where", "which", "who",
  "how", "do", "does", "can", "i", "me", "my", "we", "you", "it", "in", "on", "of", "for", "to", "at",
  "and", "or", "there", "here", "now", "today", "available", "open", "ongoing", "current", "currently",
  "please", "tell", "about", "show", "list", "give", "county", "counties", "public", "participation",
  "notice", "notices", "opportunity", "opportunities", "right", "anything", "something", "upcoming",
  "latest", "happening", "going", "near", "nearby", "info", "information", "update", "updates", "news",
  "je", "ni", "gani", "zipi", "kuna", "ya", "wa",
  "na", "kwa", "hivi", "sasa", "kaunti", "ushiriki", "umma", "taarifa", "nini", "naomba", "tafadhali",
]);

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

// Notices filed under this key apply everywhere (a national Bill before
// Parliament, say), so they're included for every county.
export const NATIONAL_KEY = "national";

const DEFAULT_DATA_PATH = join(__dirname, "..", "..", "data", "notices.json");

@Injectable()
export class NoticeStoreService {
  private readonly dataPath: string;

  constructor(config: ConfigService) {
    const path = config.get<string>("NOTICES_PATH");
    this.dataPath = path ? resolve(path) : DEFAULT_DATA_PATH;
  }

  // Re-read on every call so edits to notices.json show up without a restart.
  private loadData(): NoticeData {
    return JSON.parse(readFileSync(this.dataPath, "utf-8"));
  }

  /**
   * Returns the still-open notices for a given canonical county key, or an
   * empty array if the county is not in the knowledge base / has nothing open.
   * Notices whose deadline has passed are never shown to users.
   */
  getNoticesByCounty(countyKey: string): Notice[] {
    return this.getAllNoticesByCounty(countyKey).filter(isOpen);
  }

  /** Every notice on file for a county, including ones whose deadline has passed. */
  getAllNoticesByCounty(countyKey: string): Notice[] {
    const entry = this.loadData().counties[countyKey];
    return entry ? entry.notices : [];
  }

  getCountyDisplayName(countyKey: string): string {
    const entry = this.loadData().counties[countyKey];
    return entry ? entry.display_name : countyDisplayName(countyKey);
  }

  /** Looks up a notice by id, including past and national ones (reminders resolve titles this way). */
  getNoticeById(countyKey: string, noticeId: string): Notice | null {
    const candidates = [...this.getAllNoticesByCounty(countyKey), ...this.getAllNoticesByCounty(NATIONAL_KEY)];
    return candidates.find((n) => n.id === noticeId) || null;
  }

  /**
   * Open notices for a county, as list items: the county's own notices first,
   * then any national ones, which apply everywhere.
   */
  getCountyNotices(countyKey: string): CountyNotice[] {
    const keys = countyKey === NATIONAL_KEY ? [NATIONAL_KEY] : [countyKey, NATIONAL_KEY];
    const data = this.loadData();
    return keys.flatMap((key) => {
      const entry = data.counties[key];
      if (!entry) return [];
      return entry.notices.filter(isOpen).map((notice) => ({
        county: key,
        countyName: entry.display_name || countyDisplayName(key),
        notice,
      }));
    });
  }

  /** Every open notice on file, across all counties. */
  getAllOpenNotices(): CountyNotice[] {
    const data = this.loadData();
    return Object.entries(data.counties).flatMap(([county, entry]) =>
      entry.notices.filter(isOpen).map((notice) => ({
        county,
        countyName: entry.display_name || countyDisplayName(county),
        notice,
      })),
    );
  }

  /**
   * Keyword search across open notices, best matches first. Returns an empty
   * array when the query has no searchable words left (e.g. "what is open?"),
   * so the caller can decide to list everything instead.
   */
  search(query: string): CountyNotice[] {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];

    return this.getAllOpenNotices()
      .map((item) => {
        const haystack = [
          item.notice.title,
          item.notice.summary,
          item.notice.topic,
          item.notice.venue,
          item.notice.submission_instructions,
          item.notice.source_name,
          item.countyName,
        ]
          .join(" ")
          .toLowerCase();
        const score = tokens.filter((token) => haystack.includes(token)).length;
        return { item, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item);
  }

  /** True when the query had no searchable words (so "list everything" is the sensible reply). */
  isBroadQuery(query: string): boolean {
    return tokenize(query).length === 0;
  }

  isCountyCovered(countyKey: string): boolean {
    return Boolean(this.loadData().counties[countyKey]);
  }
}
