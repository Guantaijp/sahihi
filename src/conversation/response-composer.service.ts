// Response composer.
//
// IMPORTANT: this service is the trust boundary of the whole app. It must
// never present a fact that isn't in the notice object. Any field whose
// value is "not_confirmed" must be shown to the user AS not confirmed,
// with guidance to check the primary source — never smoothed over.

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import { Mistral } from "@mistralai/mistralai";

import { CountyNotice, isConfirmed, Notice } from "../notices/notice.types";
import { Language } from "../session/session.service";

const STRINGS = {
  en: {
    greeting:
      "Hi — I can show you public participation opportunities happening in your county right now. Which county are you in?",
    countyNotFound:
      "I didn't recognise that county name. Could you type just the county name, e.g. \"Nairobi\"?",
    noNotices: (county: string) =>
      `I don't currently have any public participation notices on file for ${county} County. This may mean there genuinely are none active right now, or that our records for this county aren't built out yet — please also check your county assembly's official channels directly.`,
    noticesHeader: (county: string) => `Here's what's active in ${county} County right now:`,
    notConfirmed: "not yet confirmed — please check the official source below",
    footerPrompt:
      "Want details on how to submit input for any of these (reply with the number, e.g. \"1\"), or a reminder closer to the deadline (reply \"remind 1\")?",
    submissionHeader: (title: string) => `How to submit input — ${title}`,
    reminderConfirmed: (title: string) =>
      `Got it — I'll remind you before the deadline for "${title}".`,
    reminderNoDeadline:
      "I can't set a reminder for this one yet because the deadline isn't confirmed in my records. Please check the source below for the current deadline.",
    reminderConsent:
      "I'll only message you about this. Reply \"stop\" any time to cancel your reminders and delete what I've saved about this chat.",
    reminderDue: (title: string, deadline: string) =>
      `Reminder: the deadline for "${title}" is ${deadline}. Reply "stop" to cancel reminders.`,
    remindersStopped:
      "Done — your reminders are cancelled and I've deleted what I had saved about this chat. Say \"hi\" any time to start again.",
    unrecognizedChoice:
      "I didn't quite catch that. Reply with a notice number, \"submit <number>\", \"remind <number>\", or \"change county\".",
    changeCounty: "Sure — which county are you in?",
    allHeader: "Here's every public participation notice I have on file right now:",
    searchHeader: (query: string) => `Here's what I have on file about "${query}":`,
    noMatches: (query: string) =>
      `I don't have anything on file about "${query}". I only answer from notices we've verified against official sources, so this may mean there's nothing active — or that our records don't cover it yet.`,
    allHint: "Reply \"all\" to see every notice I have, or type a county name.",
    moreFooter: (remaining: number) => `Reply "more" for the remaining ${remaining}.`,
    noMore: "That's everything I have on file. Reply \"all\" to see the list again.",
    countyLabel: "County",
  },
  sw: {
    greeting:
      "Habari — Ninaweza kukuonyesha fursa za ushiriki wa umma zinazoendelea katika kaunti yako. Uko kaunti gani?",
    countyNotFound:
      "Sijatambua jina hilo la kaunti. Tafadhali andika jina la kaunti pekee, mfano \"Nairobi\".",
    noNotices: (county: string) =>
      `Kwa sasa sina taarifa yoyote ya ushiriki wa umma kwa Kaunti ya ${county}. Huenda hakuna zinazoendelea sasa hivi, au bado hatujaingiza taarifa za kaunti hii — tafadhali angalia pia njia rasmi za bunge la kaunti yako.`,
    noticesHeader: (county: string) => `Hizi ndizo zinazoendelea katika Kaunti ya ${county} sasa hivi:`,
    notConfirmed: "bado haijathibitishwa — tafadhali angalia chanzo rasmi hapa chini",
    footerPrompt:
      "Ungependa maelezo ya jinsi ya kuwasilisha maoni yako kwa mojawapo (jibu na nambari, mfano \"1\"), au ukumbusho karibu na tarehe ya mwisho (jibu \"remind 1\")?",
    submissionHeader: (title: string) => `Jinsi ya kuwasilisha maoni — ${title}`,
    reminderConfirmed: (title: string) =>
      `Sawa — nitakukumbusha kabla ya tarehe ya mwisho ya "${title}".`,
    reminderNoDeadline:
      "Siwezi kuweka ukumbusho kwa hii kwa sasa kwa sababu tarehe ya mwisho haijathibitishwa. Tafadhali angalia chanzo hapa chini kwa tarehe sahihi.",
    reminderConsent:
      "Nitakutumia ujumbe kuhusu hii pekee. Jibu \"stop\" wakati wowote kusitisha vikumbusho na kufuta taarifa zako za mazungumzo haya.",
    reminderDue: (title: string, deadline: string) =>
      `Ukumbusho: tarehe ya mwisho ya "${title}" ni ${deadline}. Jibu "stop" kusitisha vikumbusho.`,
    remindersStopped:
      "Nimemaliza — vikumbusho vyako vimesitishwa na nimefuta taarifa zako za mazungumzo haya. Sema \"hi\" wakati wowote kuanza upya.",
    unrecognizedChoice:
      "Sijaelewa vizuri. Jibu na nambari ya taarifa, \"submit <nambari>\", \"remind <nambari>\", au \"change county\".",
    changeCounty: "Sawa — uko kaunti gani?",
    allHeader: "Hizi ndizo taarifa zote za ushiriki wa umma nilizonazo kwa sasa:",
    searchHeader: (query: string) => `Haya ndiyo niliyonayo kuhusu "${query}":`,
    noMatches: (query: string) =>
      `Sina taarifa yoyote kuhusu "${query}". Ninajibu tu kutoka kwa taarifa tulizothibitisha kwenye vyanzo rasmi — huenda hakuna inayoendelea, au bado hatujaingiza taarifa hizo.`,
    allHint: "Jibu \"all\" kuona taarifa zote nilizonazo, au andika jina la kaunti.",
    moreFooter: (remaining: number) => `Jibu "more" kuona zilizobaki ${remaining}.`,
    noMore: "Hizo ndizo zote nilizonazo. Jibu \"all\" kuona orodha tena.",
    countyLabel: "Kaunti",
  },
} satisfies Record<Language, unknown>;

// If the LLM call fails (rate limit, outage, bad key), skip it for a while so
// every reply isn't slowed down by a request that's going to fail anyway.
// WhatsApp caps a message at 4096 characters, so long lists are paged.
export const PAGE_SIZE = 5;

const LLM_TIMEOUT_MS = 10_000;
const LLM_COOLDOWN_MS = 60_000;

/** WhatsApp renders *text* as bold; the test web-chat page renders it the same way. */
function bold(text: string): string {
  return `*${text}*`;
}

function displayValue(value: string | undefined, lang: Language): string {
  return isConfirmed(value) ? value : STRINGS[lang].notConfirmed;
}

function sourceLine(notice: Notice, lang: Language): string {
  const url = isConfirmed(notice.source_url) ? " — " + notice.source_url : "";
  return `Source: ${displayValue(notice.source_name, lang)}${url}`;
}

@Injectable()
export class ResponseComposerService {
  private readonly logger = new Logger(ResponseComposerService.name);
  private anthropic?: Anthropic;
  private mistral?: Mistral;
  private llmPausedUntil = 0;

  constructor(private readonly config: ConfigService) {}

  greeting(lang: Language = "en"): string {
    return STRINGS[lang].greeting;
  }

  countyNotFound(lang: Language = "en"): string {
    return STRINGS[lang].countyNotFound;
  }

  noNotices(countyDisplayName: string, lang: Language = "en"): string {
    return STRINGS[lang].noNotices(countyDisplayName);
  }

  countyNoticesHeader(countyDisplayName: string, lang: Language = "en"): string {
    return STRINGS[lang].noticesHeader(countyDisplayName);
  }

  allNoticesHeader(lang: Language = "en"): string {
    return STRINGS[lang].allHeader;
  }

  searchHeader(query: string, lang: Language = "en"): string {
    return STRINGS[lang].searchHeader(query);
  }

  noMatches(query: string, lang: Language = "en"): string {
    return this.withAllHint(STRINGS[lang].noMatches(query), lang);
  }

  noMore(lang: Language = "en"): string {
    return STRINGS[lang].noMore;
  }

  withAllHint(text: string, lang: Language = "en"): string {
    return `${text}\n\n${STRINGS[lang].allHint}`;
  }

  /**
   * Renders one page of a list. Numbering is global (page 2 starts at 6), so a
   * user can reply with any number they have seen. `showCounty` adds a county
   * line, for lists that span more than one county.
   */
  noticeList(
    header: string,
    items: CountyNotice[],
    lang: Language = "en",
    opts: { offset?: number; showCounty?: boolean } = {},
  ): string {
    const s = STRINGS[lang];
    const offset = opts.offset ?? 0;
    const page = items.slice(offset, offset + PAGE_SIZE);
    const lines = [bold(header), ""];

    page.forEach((item, index) => {
      const notice = item.notice;
      lines.push(bold(`${offset + index + 1}. ${notice.title}`));
      if (opts.showCounty) lines.push(`   ${s.countyLabel}: ${item.countyName}`);
      lines.push(`   ${notice.summary}`);
      lines.push(`   Deadline: ${displayValue(notice.deadline, lang)}`);
      lines.push(`   ${sourceLine(notice, lang)}`);
      lines.push(`   Last verified: ${displayValue(notice.last_verified, lang)}`);
      lines.push("");
    });

    const remaining = items.length - (offset + page.length);
    if (remaining > 0) lines.push(s.moreFooter(remaining));
    lines.push(s.footerPrompt);
    return lines.join("\n");
  }

  submissionDetail(notice: Notice, lang: Language = "en"): string {
    const s = STRINGS[lang];
    const lines = [bold(s.submissionHeader(notice.title)), ""];
    lines.push(`Venue: ${displayValue(notice.venue, lang)}`);
    lines.push(`How to submit: ${displayValue(notice.submission_instructions, lang)}`);
    lines.push(`Deadline: ${displayValue(notice.deadline, lang)}`);
    lines.push(sourceLine(notice, lang));
    return lines.join("\n");
  }

  reminderConfirmation(notice: Notice, lang: Language = "en"): string {
    if (!isConfirmed(notice.deadline)) {
      return STRINGS[lang].reminderNoDeadline;
    }
    // Always paired with the opt-out line: people must know how to stop these.
    return `${STRINGS[lang].reminderConfirmed(notice.title)}

${STRINGS[lang].reminderConsent}`;
  }

  /** The reminder message itself, sent days later when a deadline is near. */
  reminderDue(notice: Notice, lang: Language = "en"): string {
    return STRINGS[lang].reminderDue(notice.title, notice.deadline);
  }

  remindersStopped(lang: Language = "en"): string {
    return STRINGS[lang].remindersStopped;
  }

  unrecognizedChoice(lang: Language = "en"): string {
    return STRINGS[lang].unrecognizedChoice;
  }

  changeCountyPrompt(lang: Language = "en"): string {
    return STRINGS[lang].changeCounty;
  }

  // --- Optional: LLM-polished phrasing layer -------------------------------
  // Off by default (USE_LLM_COMPOSER=false) so the demo never depends on a
  // network call succeeding. When enabled, it ONLY rephrases the already
  // fact-checked template text above for tone/plain-language — it is never
  // given free rein to describe the notice from scratch, and is explicitly
  // instructed not to add any fact not present in the input text.
  //
  // LLM_PROVIDER picks the backend: "mistral" (default) or "anthropic".
  async polishWithLLM(templateText: string, lang: Language = "en"): Promise<string> {
    if (this.config.get("USE_LLM_COMPOSER") !== "true") return templateText;
    if (Date.now() < this.llmPausedUntil) return templateText;

    const langName = lang === "sw" ? "Swahili" : "plain English";
    const prompt =
      `Rewrite the following message in clear, friendly ${langName}, suitable for WhatsApp. ` +
      `Do NOT add, remove, or change any fact, date, name, or URL — only improve phrasing and flow. ` +
      `Keep the numbered list structure, every field label, and every asterisk exactly where it is ` +
      `(asterisks are WhatsApp bold markers).\n\n---\n${templateText}`;

    try {
      const provider = this.config.get("LLM_PROVIDER", "mistral");
      const polished = provider === "anthropic" ? await this.polishWithAnthropic(prompt) : await this.polishWithMistral(prompt);
      return polished || templateText;
    } catch (err) {
      this.llmPausedUntil = Date.now() + LLM_COOLDOWN_MS;
      this.logger.warn(
        `LLM polish failed, using template text and pausing LLM calls for ${LLM_COOLDOWN_MS / 1000}s: ${(err as Error).message}`,
      );
      return templateText;
    }
  }

  /**
   * Answers a free-text question strictly from the notices on file. Returns
   * null when the LLM is off or unavailable, so the caller falls back to the
   * keyword-search reply. The model is given the notice facts and told, in the
   * strongest terms, not to add anything else — the trust boundary still holds.
   */
  async answerQuestion(question: string, items: CountyNotice[], lang: Language = "en"): Promise<string | null> {
    if (this.config.get("USE_LLM_COMPOSER") !== "true") return null;
    if (Date.now() < this.llmPausedUntil) return null;

    const facts = items
      .map((item, index) =>
        [
          `NOTICE ${index + 1}`,
          `county: ${item.countyName}`,
          `title: ${item.notice.title}`,
          `summary: ${item.notice.summary}`,
          `deadline: ${item.notice.deadline}`,
          `venue: ${item.notice.venue}`,
          `how_to_submit: ${item.notice.submission_instructions}`,
          `source: ${item.notice.source_name} ${item.notice.source_url}`,
          `last_verified: ${item.notice.last_verified}`,
        ].join("\n"),
      )
      .join("\n\n");

    const langName = lang === "sw" ? "Swahili" : "plain English";
    const prompt =
      `You answer questions about Kenyan public participation notices, using ONLY the facts below.\n` +
      `Rules you must not break:\n` +
      `- Use only these facts. Never add a date, venue, name, figure or URL that isn't here.\n` +
      `- A value of "not_confirmed" means the detail is NOT confirmed: say so and point to the source.\n` +
      `- If the facts don't answer the question, say you don't have that on file. Do not guess.\n` +
      `- Answer in ${langName}, under 80 words, for WhatsApp. Refer to notices by their number.\n\n` +
      `FACTS:\n${facts}\n\nQUESTION: ${question}`;

    try {
      const provider = this.config.get("LLM_PROVIDER", "mistral");
      return provider === "anthropic" ? await this.polishWithAnthropic(prompt) : await this.polishWithMistral(prompt);
    } catch (err) {
      this.llmPausedUntil = Date.now() + LLM_COOLDOWN_MS;
      this.logger.warn(`LLM answer failed, falling back to search: ${(err as Error).message}`);
      return null;
    }
  }

  private async polishWithMistral(prompt: string): Promise<string | null> {
    this.mistral ??= new Mistral({ apiKey: this.config.get("MISTRAL_API_KEY") });

    const response = await this.mistral.chat.complete(
      {
        model: this.config.get("MISTRAL_MODEL", "mistral-small-latest"),
        maxTokens: 500,
        messages: [{ role: "user", content: prompt }],
      },
      { timeoutMs: LLM_TIMEOUT_MS },
    );

    const content = response.choices[0]?.message?.content;
    if (typeof content === "string") return content;
    return content?.map((chunk) => (chunk.type === "text" ? chunk.text : "")).join("") || null;
  }

  private async polishWithAnthropic(prompt: string): Promise<string | null> {
    this.anthropic ??= new Anthropic({ apiKey: this.config.get("ANTHROPIC_API_KEY") });

    const response = await this.anthropic.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      },
      { timeout: LLM_TIMEOUT_MS },
    );

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock && textBlock.type === "text" ? textBlock.text : null;
  }
}
