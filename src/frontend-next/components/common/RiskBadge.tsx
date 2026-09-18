import React from "react";
import { Tag } from "@carbon/react";
import { F } from "@/lib/utils";
import type { RiskLevel } from "@/types/grid";

interface RiskBadgeProps {
  level?: RiskLevel | string;
  className?: string;
  /** Carbon tag sizes. `sm` for dense table cells, `md` everywhere else. */
  size?: "sm" | "md" | "lg";
}

/**
 * Severity as a Carbon Tag.
 *
 * The tag palette is remapped in styles/carbon.scss so the four types this can
 * emit are exactly the four severity colours — there is no way for a Carbon
 * tag in this app to render a hue that is not part of the ramp. The level is
 * always spelled out as text, so colour is never the only carrier.
 */
export const RiskBadge: React.FC<RiskBadgeProps> = ({
  level = "LOW",
  className = "",
  size = "sm",
}) => {
  const { text } = F.sev(level);
  return (
    <Tag type={F.sevTag(level)} size={size} className={className}>
      {text}
    </Tag>
  );
};
