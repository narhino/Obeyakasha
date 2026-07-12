"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./index";
import type * as React from "react";

/**
 * A submit button that shows a spinner and disables itself while its parent
 * <form> action is running (ROADMAP-v1.5). Drop-in replacement for
 * `<Button type="submit">` inside any server-action form so every click that
 * waits gives feedback.
 */
export function SubmitButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "gold";
  size?: "sm" | "md" | "lg";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} {...props}>
      {children}
    </Button>
  );
}
