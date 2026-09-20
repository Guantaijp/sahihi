import "../testing/test-env";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { ALL_COUNTY_KEYS } from "./county-matcher";
import { NATIONAL_KEY } from "./notice-store.service";
import { isConfirmed, Notice, NoticeData } from "./notice.types";

// Checks the real curated data file, so a mistake made while editing
// data/notices.json is caught by `pnpm test` before it reaches users.
const data: NoticeData = JSON.parse(readFileSync(join(__dirname, "..", "..", "data", "notices.json"), "utf-8"));
const allNotices = Object.values(data.counties).flatMap((c) => c.notices);

const REQUIRED_FIELDS: (keyof Notice)[] = [
  "id",
  "title",
  "topic",
  "summary",
  "deadline",
  "venue",
  "submission_instructions",
  "source_name",
  "source_url",
  "date_published",
  "last_verified",
];
const DATE_FIELDS: (keyof Notice)[] = ["deadline", "date_published", "last_verified"];

describe("data/notices.json", () => {
  it("only uses real county keys", () => {
    for (const key of Object.keys(data.counties)) {
      assert.ok(key === NATIONAL_KEY || ALL_COUNTY_KEYS.includes(key), `unknown county key "${key}"`);
    }
  });

  it("gives every notice every field (use \"not_confirmed\" when unknown)", () => {
    for (const notice of allNotices) {
      for (const field of REQUIRED_FIELDS) {
        assert.ok(notice[field], `${notice.id || notice.title}: missing "${field}"`);
      }
    }
  });

  it("has unique notice ids", () => {
    const ids = allNotices.map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("uses YYYY-MM-DD dates and http(s) source URLs", () => {
    for (const notice of allNotices) {
      for (const field of DATE_FIELDS) {
        if (!isConfirmed(notice[field])) continue;
        assert.match(notice[field], /^\d{4}-\d{2}-\d{2}$/, `${notice.id}: ${field} must be YYYY-MM-DD`);
        assert.ok(!Number.isNaN(Date.parse(notice[field])), `${notice.id}: ${field} is not a real date`);
      }
      if (isConfirmed(notice.source_url)) {
        assert.match(notice.source_url, /^https?:\/\//, `${notice.id}: source_url must start with http(s)://`);
      }
    }
  });

  it("has no placeholder notices left", () => {
    const placeholders = allNotices.filter((n) => /EXAMPLE|PLACEHOLDER/.test(n.title + n.summary));
    assert.deepEqual(
      placeholders.map((n) => n.id),
      [],
    );
  });
});
