"use client";

import * as React from "react";
import { Label as LabelPrimitive } from "radix-ui";

import { cn } from "@/shared/lib/utils";

/**
 * `required` (form canon 1.5, wave 198) appends « *». The star is decoration
 * and `aria-hidden`: the requirement reaches assistive tech through `required`
 * / `aria-required` on the control itself, so the name stays «Назва», not
 * «Назва зірочка».
 */
function Label({
  className,
  required = false,
  children,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & { required?: boolean }) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:text-disabled-foreground peer-disabled:cursor-not-allowed peer-disabled:text-disabled-foreground",
        className,
      )}
      {...props}
    >
      {children}
      {required ? (
        <span aria-hidden="true" className="-ml-1.5">
          {" *"}
        </span>
      ) : null}
    </LabelPrimitive.Root>
  );
}

export { Label };
