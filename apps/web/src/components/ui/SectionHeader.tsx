import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";

export function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: Icon;
  title: string;
  description?: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon size={20} weight="duotone" className="text-muted-foreground" />
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      </div>
      {description && (
        <p className="text-xs text-muted-foreground mt-0.5 ml-7">
          {description}
        </p>
      )}
    </div>
  );
}
