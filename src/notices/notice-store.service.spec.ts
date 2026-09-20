import "../testing/test-env";

import { ConfigService } from "@nestjs/config";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { isoDaysFromNow, makeNotice } from "../testing/helpers";
import { NoticeStoreService } from "./notice-store.service";

const notices = [
  makeNotice({ id: "past", title: "Closed last week", deadline: isoDaysFromNow(-7) }),
  makeNotice({ id: "today", title: "Closes today", deadline: isoDaysFromNow(0) }),
  makeNotice({ id: "future", title: "Closes next month", deadline: isoDaysFromNow(30) }),
  makeNotice({ id: "unknown", title: "Deadline not confirmed" }),
];

function store() {
  const path = join(mkdtempSync(join(tmpdir(), "sahihi-notices-")), "notices.json");
  writeFileSync(path, JSON.stringify({ counties: { nairobi: { display_name: "Nairobi", notices } } }));
  return new NoticeStoreService({ get: () => path } as unknown as ConfigService);
}

describe("NoticeStoreService", () => {
  it("hides notices whose deadline has passed, keeps today's and unconfirmed ones", () => {
    assert.deepEqual(
      store()
        .getNoticesByCounty("nairobi")
        .map((n) => n.id),
      ["today", "future", "unknown"],
    );
  });

  it("still resolves a past notice by id, so existing reminders keep working", () => {
    assert.equal(store().getNoticeById("nairobi", "past")?.title, "Closed last week");
    assert.equal(store().getAllNoticesByCounty("nairobi").length, 4);
  });

  it("includes national notices for every county", () => {
    const path = join(mkdtempSync(join(tmpdir(), "sahihi-notices-")), "notices.json");
    writeFileSync(
      path,
      JSON.stringify({
        counties: {
          national: { display_name: "Kenya (national)", notices: [makeNotice({ id: "nat-1", title: "National Bill" })] },
          kisumu: { display_name: "Kisumu", notices: [makeNotice({ id: "ksm-1", title: "Kisumu Hearing" })] },
        },
      }),
    );
    const s = new NoticeStoreService({ get: () => path } as unknown as ConfigService);

    assert.deepEqual(
      s.getCountyNotices("kisumu").map((i) => [i.county, i.notice.id]),
      [
        ["kisumu", "ksm-1"],
        ["national", "nat-1"],
      ],
    );
    // A county with no notices of its own still sees the national ones.
    assert.deepEqual(
      s.getCountyNotices("mombasa").map((i) => i.notice.id),
      ["nat-1"],
    );
    // And a reminder saved against a county still resolves a national notice.
    assert.equal(s.getNoticeById("kisumu", "nat-1")?.title, "National Bill");
  });

  it("returns nothing for a county with no data", () => {
    assert.deepEqual(store().getNoticesByCounty("kisumu"), []);
    assert.equal(store().isCountyCovered("kisumu"), false);
  });
});
