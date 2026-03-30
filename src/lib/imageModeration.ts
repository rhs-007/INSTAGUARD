// src/lib/imageModeration.ts

type NudeNetDetection = {
  class?: string;
  score?: number;
  box?: number[];
};

export type FlaggedClass = {
  className: string;
  score: number;
};

export type ImageModerationResult = {
  isExplicit: boolean;
  needsReview: boolean;
  reason: string | null;
  flaggedClasses: FlaggedClass[];
  raw?: unknown;
};

const NUDENET_API_URL =
  process.env.NUDENET_API_URL || "http://127.0.0.1:5001/predict";

const EXPLICIT_CLASSES = new Set([
  "FEMALE_BREAST_EXPOSED",
  "FEMALE_GENITALIA_EXPOSED",
  "MALE_GENITALIA_EXPOSED",
  "ANUS_EXPOSED",
  "BUTTOCKS_EXPOSED",
]);

const REVIEW_CLASSES = new Set([
  "FEMALE_BREAST_COVERED",
  "BUTTOCKS_COVERED",
  "BELLY_EXPOSED",
  "ARMPITS_EXPOSED",
]);

const EXPLICIT_THRESHOLD = 0.6;
const REVIEW_THRESHOLD = 0.45;
const FALLBACK_REVIEW_ON_ERROR = true;

function normalizeScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function uniqueByClassHighestScore(items: FlaggedClass[]): FlaggedClass[] {
  const map = new Map<string, number>();

  for (const item of items) {
    const prev = map.get(item.className) ?? 0;
    if (item.score > prev) {
      map.set(item.className, item.score);
    }
  }

  return Array.from(map.entries())
    .map(([className, score]) => ({ className, score }))
    .sort((a, b) => b.score - a.score);
}

function normalizeFromArray(data: unknown): FlaggedClass[] {
  if (!Array.isArray(data)) return [];

  const out: FlaggedClass[] = [];

  for (const item of data) {
    if (!item || typeof item !== "object") continue;

    const det = item as NudeNetDetection;
    const className = typeof det.class === "string" ? det.class.trim() : "";
    const score = normalizeScore(det.score);

    if (!className) continue;

    out.push({ className, score });
  }

  return uniqueByClassHighestScore(out);
}

function normalizeFromObject(data: any): FlaggedClass[] {
  if (!data || typeof data !== "object") return [];

  if (Array.isArray(data.detections)) {
    return normalizeFromArray(data.detections);
  }

  if (Array.isArray(data.predictions)) {
    return normalizeFromArray(data.predictions);
  }

  if (Array.isArray(data.flaggedClasses)) {
    return normalizeFromArray(
      data.flaggedClasses.map((x: any) => ({
        class: x?.className ?? x?.class,
        score: x?.score,
      }))
    );
  }

  return [];
}

function buildReason(
  explicitHits: FlaggedClass[],
  reviewHits: FlaggedClass[]
): string | null {
  if (explicitHits.length > 0) {
    return `nudenet_explicit:${explicitHits
      .map((x) => `${x.className}:${x.score.toFixed(2)}`)
      .join(",")}`;
  }

  if (reviewHits.length > 0) {
    return `nudenet_review:${reviewHits
      .map((x) => `${x.className}:${x.score.toFixed(2)}`)
      .join(",")}`;
  }

  return null;
}

function classify(flaggedClasses: FlaggedClass[]): ImageModerationResult {
  const explicitHits = flaggedClasses.filter(
    (x) => EXPLICIT_CLASSES.has(x.className) && x.score >= EXPLICIT_THRESHOLD
  );

  const reviewHits = flaggedClasses.filter(
    (x) =>
      (REVIEW_CLASSES.has(x.className) && x.score >= REVIEW_THRESHOLD) ||
      (EXPLICIT_CLASSES.has(x.className) &&
        x.score >= REVIEW_THRESHOLD &&
        x.score < EXPLICIT_THRESHOLD)
  );

  const isExplicit = explicitHits.length > 0;
  const needsReview = !isExplicit && reviewHits.length > 0;
  const reason = buildReason(explicitHits, reviewHits);

  return {
    isExplicit,
    needsReview,
    reason,
    flaggedClasses,
  };
}

function bufferToBlob(buffer: Buffer, mimeType = "image/jpeg"): Blob {
  const uint8 = new Uint8Array(buffer);
  return new Blob([uint8], { type: mimeType });
}

export async function moderateImageLocal(
  buffer: Buffer
): Promise<ImageModerationResult> {
  try {
    const form = new FormData();
    const blob = bufferToBlob(buffer, "image/jpeg");
    form.append("image", blob, "upload.jpg");

    const res = await fetch(NUDENET_API_URL, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("NudeNet API error:", res.status, text);

      return {
        isExplicit: false,
        needsReview: FALLBACK_REVIEW_ON_ERROR,
        reason: "nudenet_api_error",
        flaggedClasses: [],
      };
    }

    const data = await res.json().catch(() => null);

    let flaggedClasses: FlaggedClass[] = [];

    if (Array.isArray(data)) {
      flaggedClasses = normalizeFromArray(data);
    } else {
      flaggedClasses = normalizeFromObject(data);
    }

    const normalized =
      flaggedClasses.length > 0
        ? classify(flaggedClasses)
        : {
            isExplicit: false,
            needsReview: false,
            reason: null,
            flaggedClasses: [] as FlaggedClass[],
          };

    return {
      ...normalized,
      raw: data,
    };
  } catch (error) {
    console.error("Image moderation failed:", error);

    return {
      isExplicit: false,
      needsReview: FALLBACK_REVIEW_ON_ERROR,
      reason: "nudenet_service_unreachable",
      flaggedClasses: [],
    };
  }
}