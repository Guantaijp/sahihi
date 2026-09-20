import "../testing/test-env";

import { ConfigService } from "@nestjs/config";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { SessionService } from "./session.service";

function serviceWithStore(path: string) {
  const config = { get: () => path } as unknown as ConfigService;
  const service = new SessionService(config);
  return service;
}

describe("SessionService", () => {
  it("persists sessions across restarts", () => {
    const path = join(mkdtempSync(join(tmpdir(), "sahihi-sessions-")), "sessions.json");

    const first = serviceWithStore(path);
    first.update("254700000000", {
      county: "nairobi",
      language: "sw",
      reminders: [{ noticeId: "n1", county: "nairobi", deadline: "2026-10-01" }],
    });

    const afterRestart = serviceWithStore(path);
    const session = afterRestart.get("254700000000");
    assert.equal(session.county, "nairobi");
    assert.equal(session.language, "sw");
    assert.equal(session.reminders.length, 1);
  });

  it("keeps sessions in memory only when the store path is empty", () => {
    const service = serviceWithStore("");
    service.update("u", { county: "kisumu" });
    assert.equal(service.get("u").county, "kisumu");
    assert.equal((service as any).storePath, null);
  });

  it("starts empty instead of crashing on a corrupt store file", () => {
    const path = join(mkdtempSync(join(tmpdir(), "sahihi-sessions-")), "sessions.json");
    writeFileSync(path, "{ not json");
    const service = serviceWithStore(path);
    assert.equal(service.all().size, 0);
  });
});
