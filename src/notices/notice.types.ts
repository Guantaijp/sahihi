// Any field may hold the literal "not_confirmed" — see ResponseComposerService,
// which surfaces that to the user honestly instead of guessing.
export interface Notice {
  id: string;
  title: string;
  topic: string;
  summary: string;
  deadline: string; // ISO date, e.g. "2026-10-01", or "not_confirmed"
  venue: string;
  submission_instructions: string;
  source_name: string;
  source_url: string;
  date_published: string;
  last_verified: string;
}

export interface CountyEntry {
  display_name: string;
  notices: Notice[];
}

export interface NoticeData {
  counties: Record<string, CountyEntry>;
}

export function isConfirmed(value: string | undefined | null): value is string {
  return Boolean(value) && value !== "not_confirmed";
}

/** A notice together with the county it belongs to (lists can span counties). */
export interface CountyNotice {
  county: string;
  countyName: string;
  notice: Notice;
}
