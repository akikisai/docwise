import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: Icon;
  title?: string;
  description: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <Icon size={40} weight="duotone" className="text-border" />
      {title && (
        <p className="text-sm font-medium text-foreground">{title}</p>
      )}
      <div className="text-sm text-muted-foreground space-y-1">{description}</div>
    </div>
  );
}
