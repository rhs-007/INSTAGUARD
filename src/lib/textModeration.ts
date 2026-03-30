export type TextModerationResult = {
  isSafe: boolean;
  matched?: string | null;
  reason?: string;
  normalized?: string;
};

function normalize(text: string) {
  const leet: Record<string, string> = {
    "@": "a",
    "4": "a",
    "$": "s",
    "5": "s",
    "0": "o",
    "1": "i",
    "!": "i",
    "3": "e",
    "7": "t",
    "+": "t",
  };

  const lower = text.toLowerCase();

  const mapped = lower
    .split("")
    .map((c) => (leet[c] ? leet[c] : c))
    .join("");

  return mapped
    .replace(/[^a-z0-9]/g, "")
    .replace(/(.)\1{2,}/g, "$1$1"); // collapse repeated letters
}

const BANNED_WORDS = [
  "fuck",
  "fucking",
  "bitch",
  "slut",
  "whore",
  "asshole",
  "dick",
  "pussy",
  "porn",
  "nude",
  "nudes",
  "blowjob",
  "handjob",
  "sex",
  "rape",
];

export function moderateTextLocal(text: string): TextModerationResult {
  const normalized = normalize(text);

  const hit = BANNED_WORDS.find((w) => normalized.includes(w));

  if (hit) {
    return {
      isSafe: false,
      matched: hit,
      reason: "explicit_text",
      normalized,
    };
  }

  return { isSafe: true, matched: null, normalized };
}