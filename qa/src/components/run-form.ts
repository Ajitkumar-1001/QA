/** Run form view (FR-002, FR-003, FR-004). */
import { createElement, type ReactElement } from "react";
import { runsUsedText, capRefusalText, type CapRefusal } from "../lib/run/run-text.ts";
import { StartButton } from "./start-button.ts";

export type RunFormProps = {
  targetUrl: string;
  objective: string;
  runsUsed: number;
  monthlyCap: number;
  /** Set by the page at the monthly cap, or after a refused start. */
  refusal?: CapRefusal;
  action: (formData: FormData) => void | Promise<void>;
};

export function RunForm({
  targetUrl,
  objective,
  runsUsed,
  monthlyCap,
  refusal,
  action,
}: RunFormProps): ReactElement {
  return createElement(
    "form",
    { action },
    createElement(
      "dl",
      null,
      createElement("dt", null, "Target URL"),
      createElement("dd", null, targetUrl),
      createElement("dt", null, "Objective"),
      createElement("dd", null, objective),
    ),
    createElement("p", null, runsUsedText(runsUsed, monthlyCap)),
    ...(refusal !== undefined
      ? [createElement("p", { role: "alert" }, capRefusalText(refusal))]
      : []),
    createElement(StartButton, { disabled: refusal?.reason === "monthly_cap" }),
  );
}
