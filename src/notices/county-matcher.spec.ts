import "../testing/test-env";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ALL_COUNTY_KEYS, countyDisplayName, matchCounty } from "./county-matcher";

describe("matchCounty", () => {
  it("covers all 47 counties", () => {
    assert.equal(new Set(ALL_COUNTY_KEYS).size, 47);
  });

  for (const [input, expected] of [
    ["Nairobi", "nairobi"],
    ["  NAIROBI  ", "nairobi"],
    ["Murang'a", "murang_a"],
    ["Homa Bay", "homa_bay"],
    ["trans-nzoia", "trans_nzoia"],
    ["I live in Kisumu county", "kisumu"],
  ]) {
    it(`matches "${input}"`, () => {
      assert.deepEqual(matchCounty(input), { matched: true, county: expected });
    });
  }

  it("rejects unknown and empty input", () => {
    assert.deepEqual(matchCounty("atlantis"), { matched: false, county: null });
    assert.deepEqual(matchCounty(""), { matched: false, county: null });
  });
});

describe("countyDisplayName", () => {
  it("title-cases canonical keys and uses official spellings", () => {
    assert.equal(countyDisplayName("mombasa"), "Mombasa");
    assert.equal(countyDisplayName("tana_river"), "Tana River");
    assert.equal(countyDisplayName("murang_a"), "Murang'a");
    assert.equal(countyDisplayName("elgeyo_marakwet"), "Elgeyo-Marakwet");
  });
});
