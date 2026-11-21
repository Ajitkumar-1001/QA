/**
 * Sends the one start message for a run (FR-005). No test imports this file, since
 * it loads the queue SDK. Errors are not logged here: `startRun` catches them and
 * logs them through the error serializer, so no credential reaches the output.
 */
import { send } from "@vercel/queue";
import { startMessageSchema, type StartMessage } from "./start-message.ts";

/** The execution slice's consumer subscribes to this topic. */
export const START_TOPIC = "qaforge-run-start";

/**
 * The run id is the idempotency key, so a retried send for the same run delivers
 * once. `messageId` is null when the service defers the message; it is still delivered.
 */
export async function sendStartMessage(message: StartMessage): Promise<{ messageId: string | null }> {
  const payload = startMessageSchema.parse(message);
  const { messageId } = await send(START_TOPIC, payload, { idempotencyKey: payload.runId });
  return { messageId };
}
