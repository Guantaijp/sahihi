import "../testing/test-env";

import { ConfigService } from "@nestjs/config";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { makeNotice } from "../testing/helpers";
import { ResponseComposerService } from "./response-composer.service";

function composerWith(env: Record<string, string>) {
  const config = { get: (key: string, fallback?: string) => env[key] ?? fallback } as unknown as ConfigService;
  return new ResponseComposerService(config);
}

// Replaces the private Mistral call so no network request is ever made.
function stubMistral(composer: ResponseComposerService, impl: () => Promise<string | null>) {
  let calls = 0;
  (composer as any).polishWithMistral = () => {
    calls++;
    return impl();
  };
  return () => calls;
}

describe("ResponseComposerService", () => {
  const composer = composerWith({});

  it("never smooths over unconfirmed fields", () => {
    const text = composer.submissionDetail(makeNotice({ id: "x", title: "Hearing" }), "en");
    assert.match(text, /Venue: not yet confirmed — please check the official source below/);
    assert.match(text, /Source: not yet confirmed/);
    assert.doesNotMatch(text, /not_confirmed/);
  });

  it("shows confirmed fields as-is, with the source URL", () => {
    const notice = makeNotice({
      id: "x",
      title: "Hearing",
      venue: "County Hall",
      source_name: "Gazette",
      source_url: "https://example.org",
    });
    const text = composer.submissionDetail(notice, "en");
    assert.match(text, /Venue: County Hall/);
    assert.match(text, /Source: Gazette — https:\/\/example\.org/);
  });

  it("refuses to confirm a reminder without a confirmed deadline", () => {
    assert.match(composer.reminderConfirmation(makeNotice({ id: "x", title: "H" }), "sw"), /Siwezi kuweka ukumbusho/);
    assert.match(
      composer.reminderConfirmation(makeNotice({ id: "x", title: "H", deadline: "2026-10-01" }), "en"),
      /I'll remind you/,
    );
  });

  describe("polishWithLLM", () => {
    it("is a no-op when USE_LLM_COMPOSER is not 'true'", async () => {
      const c = composerWith({ USE_LLM_COMPOSER: "false" });
      const calls = stubMistral(c, async () => "polished");
      assert.equal(await c.polishWithLLM("template"), "template");
      assert.equal(calls(), 0);
    });

    it("returns the LLM's rewrite when it succeeds", async () => {
      const c = composerWith({ USE_LLM_COMPOSER: "true" });
      stubMistral(c, async () => "polished");
      assert.equal(await c.polishWithLLM("template"), "polished");
    });

    it("falls back to the template on failure, then pauses LLM calls", async () => {
      const c = composerWith({ USE_LLM_COMPOSER: "true" });
      const calls = stubMistral(c, async () => {
        throw new Error("429 Rate limit exceeded");
      });

      assert.equal(await c.polishWithLLM("first"), "first");
      assert.equal(await c.polishWithLLM("second"), "second");
      assert.equal(calls(), 1, "second call should be skipped during the cooldown");
    });
  });
});
