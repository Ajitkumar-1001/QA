/**
 * Criteria for a run (PRD v2 FR-010, FR-011, §16.2, §16.3).
 * The criteria call's output is validated against a closed schema, and each
 * criterion is evaluated by host code against the final capture.
 */
import { z } from "zod";

export const CRITERION_KINDS = ["text_visible", "text_absent", "url_matches"] as const;
export type CriterionKind = (typeof CRITERION_KINDS)[number];

export const MAX_CRITERIA = 5;
export const MAX_EXPECTED_LENGTH = 200;

export const criterionSchema = z.strictObject({
  kind: z.enum(CRITERION_KINDS),
  expected: z.string().min(1).max(MAX_EXPECTED_LENGTH),
});
export type Criterion = z.infer<typeof criterionSchema>;

export const criteriaOutputSchema = z.discriminatedUnion("checkable", [
  z.strictObject({
    checkable: z.literal(true),
    criteria: z.array(criterionSchema).min(1).max(MAX_CRITERIA),
  }),
  z.strictObject({
    checkable: z.literal(false),
    reason: z.string().min(1).max(1000),
  }),
]);

export type CriteriaParseResult =
  | { ok: true; criteria: Criterion[] }
  | { ok: false; reasonCode: "criteria_unavailable"; statedReason?: string };

/** Validate the criteria call's raw output. Anything off-schema is criteria_unavailable. */
export function parseCriteriaOutput(raw: unknown): CriteriaParseResult {
  const parsed = criteriaOutputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reasonCode: "criteria_unavailable" };
  if (!parsed.data.checkable) {
    return { ok: false, reasonCode: "criteria_unavailable", statedReason: parsed.data.reason };
  }
  return { ok: true, criteria: parsed.data.criteria };
}

export type FinalCapture = { finalUrl: string; pageText: string };

export type CriterionResult = Criterion & { held: boolean; observed: string };

const OBSERVED_LIMIT = 500;

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string): string {
  return text.length > OBSERVED_LIMIT ? `${text.slice(0, OBSERVED_LIMIT)}…` : text;
}

/** Evaluate one criterion against the host's final capture. */
export function evaluateCriterion(criterion: Criterion, capture: FinalCapture): CriterionResult {
  switch (criterion.kind) {
    case "text_visible":
    case "text_absent": {
      const page = collapseWhitespace(capture.pageText);
      const found = page.includes(collapseWhitespace(criterion.expected));
      const held = criterion.kind === "text_visible" ? found : !found;
      return {
        ...criterion,
        held,
        observed: found ? `found "${criterion.expected}"` : `not found in page text: ${truncate(page)}`,
      };
    }
    case "url_matches":
      return {
        ...criterion,
        held: capture.finalUrl.includes(criterion.expected),
        observed: capture.finalUrl,
      };
  }
}
