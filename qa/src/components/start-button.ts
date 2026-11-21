"use client";
/** Start button for the run form (FR-003). */
import { createElement, type ReactElement } from "react";
import { useFormStatus } from "react-dom";

export type StartButtonProps = { disabled: boolean };

export function StartButton({ disabled }: StartButtonProps): ReactElement {
  const { pending } = useFormStatus();
  return createElement(
    "button",
    { type: "submit", disabled: disabled || pending },
    pending ? "Starting…" : "Start",
  );
}
