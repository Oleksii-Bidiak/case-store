"use client";

import * as React from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { Input } from "./input";

/**
 * PasswordInput — a password field with a show/hide toggle INSIDE it
 * (Profile П3, wave 198). The toggle is a real `type="button"` (it must never
 * submit the form it sits in) with `aria-pressed` for its state and a label
 * that says what pressing it will do. Every other prop — `ref` included, which
 * React 19 passes as a prop — goes to the input, so `register()` just works.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        className={cn("pr-10", className)}
        {...props}
      />
      <button
        type="button"
        aria-pressed={visible}
        aria-label={visible ? dict.canon.hidePassword : dict.canon.showPassword}
        disabled={props.disabled}
        onClick={() => setVisible((current) => !current)}
        className="absolute top-1/2 right-1 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none"
      >
        {visible ? (
          <EyeOffIcon aria-hidden="true" className="size-4" />
        ) : (
          <EyeIcon aria-hidden="true" className="size-4" />
        )}
      </button>
    </div>
  );
}
