import { createElement, type ReactElement } from "react";

export type CapturedKind =
  | "page_text"
  | "console"
  | "network"
  | "model_output";

export type CapturedTextProps = {
  kind: CapturedKind;
  content: unknown;
};

const KIND_LABELS: Record<CapturedKind, string> = {
  page_text: "Page text",
  console: "Console log",
  network: "Network log",
  model_output: "Model output",
};

function formatCapturedContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (content === undefined) {
    return "undefined";
  }
  if (typeof content === "symbol") {
    return content.toString();
  }
  if (typeof content === "function") {
    return "[function]";
  }

  try {
    const json = JSON.stringify(
      content,
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    );
    if (typeof json === "string") {
      return json;
    }
  } catch {
    // fall through to String / last-resort
  }

  try {
    return String(content);
  } catch {
    return "[unprintable value]";
  }
}

/** Renders one piece of captured content as literal text (never as HTML). */
export function CapturedText({
  kind,
  content,
}: CapturedTextProps): ReactElement {
  const label = KIND_LABELS[kind];
  const text = formatCapturedContent(content);
  return createElement(
    "section",
    { "aria-label": label },
    createElement("h2", null, label),
    createElement(
      "pre",
      { className: "whitespace-pre-wrap break-words" },
      text,
    ),
  );
}
