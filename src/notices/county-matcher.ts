// All 47 Kenyan counties, plus common alternate spellings/typos a user might type.
// Keys are normalized (lowercase, no spaces/punctuation); values are the canonical
// county key used to look up notices in data/notices.json.
const COUNTY_ALIASES: Record<string, string> = {
  mombasa: "mombasa",
  kwale: "kwale",
  kilifi: "kilifi",
  tanariver: "tana_river",
  tanarivver: "tana_river",
  lamu: "lamu",
  taitataveta: "taita_taveta",
  garissa: "garissa",
  wajir: "wajir",
  mandera: "mandera",
  marsabit: "marsabit",
  isiolo: "isiolo",
  meru: "meru",
  tharakanithi: "tharaka_nithi",
  embu: "embu",
  kitui: "kitui",
  machakos: "machakos",
  makueni: "makueni",
  nyandarua: "nyandarua",
  nyeri: "nyeri",
  kirinyaga: "kirinyaga",
  muranga: "murang_a",
  murang_a: "murang_a",
  kiambu: "kiambu",
  turkana: "turkana",
  westpokot: "west_pokot",
  samburu: "samburu",
  transnzoia: "trans_nzoia",
  uasingishu: "uasin_gishu",
  elgeyomarakwet: "elgeyo_marakwet",
  nandi: "nandi",
  baringo: "baringo",
  laikipia: "laikipia",
  nakuru: "nakuru",
  narok: "narok",
  kajiado: "kajiado",
  kericho: "kericho",
  bomet: "bomet",
  kakamega: "kakamega",
  vihiga: "vihiga",
  bungoma: "bungoma",
  busia: "busia",
  siaya: "siaya",
  kisumu: "kisumu",
  homabay: "homa_bay",
  migori: "migori",
  kisii: "kisii",
  nyamira: "nyamira",
  nairobi: "nairobi",
};

function normalize(input: unknown): string {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['".]/g, "")
    .replace(/[^a-z]/g, "");
}

export type CountyMatch = { matched: true; county: string } | { matched: false; county: null };

/**
 * Attempts to match free-text county input to a canonical county key.
 */
export function matchCounty(rawInput: string): CountyMatch {
  const normalized = normalize(rawInput);
  if (!normalized) return { matched: false, county: null };

  if (COUNTY_ALIASES[normalized]) {
    return { matched: true, county: COUNTY_ALIASES[normalized] };
  }

  // Loose contains-match as a fallback (e.g. "am in nairobi county")
  for (const [alias, canonical] of Object.entries(COUNTY_ALIASES)) {
    if (normalized.includes(alias)) {
      return { matched: true, county: canonical };
    }
  }

  return { matched: false, county: null };
}

export const ALL_COUNTY_KEYS = Object.values(COUNTY_ALIASES);

// Official spellings where title-casing the canonical key isn't enough.
const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  taita_taveta: "Taita-Taveta",
  tharaka_nithi: "Tharaka-Nithi",
  murang_a: "Murang'a",
  trans_nzoia: "Trans-Nzoia",
  elgeyo_marakwet: "Elgeyo-Marakwet",
};

/**
 * Human-readable county name for a canonical key, e.g. "tana_river" -> "Tana River".
 */
export function countyDisplayName(countyKey: string): string {
  if (DISPLAY_NAME_OVERRIDES[countyKey]) return DISPLAY_NAME_OVERRIDES[countyKey];
  return countyKey
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
