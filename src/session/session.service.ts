import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { CountyNotice } from "../notices/notice.types";

// Session store, keyed by a stable user id (WhatsApp phone number, or a
// generated id for the test web-chat). Kept in memory and mirrored to a JSON
// file (SESSION_STORE_PATH, default data/sessions.json) so reminders survive
// a restart. Fine for a hackathon MVP; swap for Redis/Postgres at real scale.
// Set SESSION_STORE_PATH to an empty string to keep sessions in memory only.

export type Language = "en" | "sw";
export type ConversationState = "start" | "awaiting_county" | "awaiting_choice";

export interface Reminder {
  noticeId: string;
  county: string;
  deadline: string;
  sentAt?: string; // set once the reminder has been delivered, so it never fires twice
}

/** The list most recently shown, so "1", "remind 1" and "more" can refer to it. */
export interface ListState {
  header: string;
  items: CountyNotice[];
  offset: number; // how many have been shown so far
  showCounty: boolean;
}

export interface Session {
  state: ConversationState;
  county: string | null;
  lastList: ListState | null;
  language: Language;
  reminders: Reminder[];
}

function defaultSession(): Session {
  return {
    state: "start",
    county: null,
    lastList: null,
    language: "en",
    reminders: [],
  };
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly sessions = new Map<string, Session>();
  private readonly storePath: string | null;

  constructor(config: ConfigService) {
    const path = config.get<string>("SESSION_STORE_PATH", "data/sessions.json");
    this.storePath = path ? resolve(path) : null;
    this.load();
  }

  get(userId: string): Session {
    let session = this.sessions.get(userId);
    if (!session) {
      session = defaultSession();
      this.sessions.set(userId, session);
    }
    return session;
  }

  reset(userId: string): Session {
    const session = defaultSession();
    this.sessions.set(userId, session);
    this.save();
    return session;
  }

  update(userId: string, patch: Partial<Session>): Session {
    const next = { ...this.get(userId), ...patch };
    this.sessions.set(userId, next);
    this.save();
    return next;
  }

  /** Forgets a user entirely — used when they reply "stop". */
  delete(userId: string) {
    this.sessions.delete(userId);
    this.save();
  }

  // Exposed for the reminder scheduler to scan all active sessions.
  all(): ReadonlyMap<string, Session> {
    return this.sessions;
  }

  private load() {
    if (!this.storePath || !existsSync(this.storePath)) return;
    try {
      const saved: Record<string, Session> = JSON.parse(readFileSync(this.storePath, "utf-8"));
      for (const [userId, session] of Object.entries(saved)) {
        this.sessions.set(userId, { ...defaultSession(), ...session });
      }
      this.logger.log(`Loaded ${this.sessions.size} session(s) from ${this.storePath}`);
    } catch (err) {
      this.logger.error(`Could not read ${this.storePath}, starting with no sessions: ${(err as Error).message}`);
    }
  }

  private save() {
    if (!this.storePath) return;
    try {
      // Write to a temp file then rename, so a crash mid-write can't corrupt the store.
      mkdirSync(dirname(this.storePath), { recursive: true });
      const tmp = `${this.storePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.sessions)));
      renameSync(tmp, this.storePath);
    } catch (err) {
      this.logger.error(`Could not save sessions to ${this.storePath}: ${(err as Error).message}`);
    }
  }
}
