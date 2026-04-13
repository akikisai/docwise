import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/utils";

const variants = {
  ghost: "text-muted-foreground hover:text-foreground hover:bg-surface-secondary",
  danger: "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
} as const;

export type IconButtonVariant = keyof typeof variants;

export function IconButton({
  variant = "ghost",
  className,
  ...props
}: { variant?: IconButtonVariant } & ComponentPropsWithoutRef<"button">) {
  return (
    <button
      {...props}
      className={cn(
        "shrink-0 p-1.5 rounded-md transition-all active:scale-[0.98]",
        variants[variant],
        className
      )}
    />
  );
}
