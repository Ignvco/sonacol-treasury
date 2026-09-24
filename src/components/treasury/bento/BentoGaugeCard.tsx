import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BentoGauge } from "./BentoGauge";
import { BentoCard, BentoHeader } from "./BentoShell";

/**
 * Sunken card whose centre is a share gauge. Whatever explains the gauge
 * (headline figure, breakdown rows) is passed as children.
 */
export function BentoGaugeCard({
  icon,
  title,
  subtitle,
  trailing,
  ratio,
  className,
  style,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  trailing?: ReactNode;
  ratio: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <BentoCard
      surface="sunken"
      className={cn("flex flex-col", className)}
      style={style}
    >
      <BentoHeader
        icon={icon}
        title={title}
        subtitle={subtitle}
        trailing={trailing}
      />
      <div className="mt-5 rounded-[22px] bg-gradient-brand-soft p-4 sm:p-5">
        <div className="flex justify-center">
          <BentoGauge ratio={ratio} />
        </div>
        {children}
      </div>
    </BentoCard>
  );
}
