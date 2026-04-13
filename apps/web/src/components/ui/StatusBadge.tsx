import {
  SpinnerIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { cn } from "../../lib/utils";

const variants = {
  processing: {
    className: "bg-warning/15 text-warning",
    icon: <SpinnerIcon size={12} weight="bold" className="animate-spin" />,
  },
  uploaded: {
    className: "bg-accent/15 text-accent",
    icon: <CheckCircleIcon size={12} weight="fill" />,
  },
  done: {
    className: "bg-accent/15 text-accent",
    icon: <CheckCircleIcon size={12} weight="fill" />,
  },
  error: {
    className: "bg-destructive/15 text-destructive",
    icon: <XCircleIcon size={12} weight="fill" />,
  },
} as const;

export type StatusBadgeVariant = keyof typeof variants;

export function StatusBadge({
  variant,
  label,
}: {
  variant: StatusBadgeVariant;
  label: string;
}) {
  const { className, icon } = variants[variant];

  return (
    <span
      className={cn(
        "shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium",
        className
      )}
    >
      {icon}
      {label}
    </span>
  );
}
