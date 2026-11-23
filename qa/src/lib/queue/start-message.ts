/**
 * The start message (FR-005): one run id and nothing else.
 * Imports no queue SDK, so it loads under `node --test`.
 */
import { z } from "zod";

/** The one run-id rule. The result page reuses it to parse its address. */
export const runIdSchema = z.uuid();

/** Strict: no field besides `runId` can ride along, such as a target URL (FR-002). */
export const startMessageSchema = z.strictObject({ runId: runIdSchema });

export type StartMessage = z.infer<typeof startMessageSchema>;
