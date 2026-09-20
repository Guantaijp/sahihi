import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AppModule } from "../app.module";
import { configureApp } from "../app.setup";
import { CountyEntry, Notice } from "../notices/notice.types";
import { WhatsappService } from "../whatsapp/whatsapp.service";

export function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function makeNotice(overrides: Partial<Notice> & Pick<Notice, "id" | "title">): Notice {
  return {
    topic: "general",
    summary: `Summary of ${overrides.title}`,
    deadline: "not_confirmed",
    venue: "not_confirmed",
    submission_instructions: "not_confirmed",
    source_name: "not_confirmed",
    source_url: "not_confirmed",
    date_published: "not_confirmed",
    last_verified: "not_confirmed",
    ...overrides,
  };
}

/** Points NoticeStoreService at a temp notices.json holding just these counties. */
export function useFixtureNotices(counties: Record<string, CountyEntry>) {
  const path = join(mkdtempSync(join(tmpdir(), "sahihi-test-")), "notices.json");
  writeFileSync(path, JSON.stringify({ counties }));
  process.env.NOTICES_PATH = path;
}

export interface SentMessage {
  to: string;
  body: string;
}

/**
 * Boots the full app on a random port, configured exactly like main.ts, with
 * outbound WhatsApp sends captured in `sent` instead of hitting Meta.
 */
export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true, logger: false }));
  await app.listen(0);
  const url = await app.getUrl();

  const sent: SentMessage[] = [];
  app.get(WhatsappService).sendMessage = async (to: string, body: string) => {
    sent.push({ to, body });
  };

  async function chat(sessionId: string, message: string): Promise<string> {
    const res = await fetch(`${url}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message }),
    });
    return (await res.json()).reply;
  }

  return { app, url, sent, chat };
}

export async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 20));
  }
}
