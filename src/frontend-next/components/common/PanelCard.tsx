import React from "react";

interface PanelCardProps {
  title: string;
  icon?: React.ReactNode;
  extraHeader?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const PanelCard: React.FC<PanelCardProps> = ({
  title,
  icon,
  extraHeader,
  children,
  className = "",
}) => {
  return (
    <div
      className={`bg-white rounded-lg shadow-sm border border-[#c0c9c0]/50 overflow-hidden ${className}`}
    >
      <div className="px-3.5 py-2 bg-[#dce9ff] flex items-center justify-between border-b border-[#c0c9c0]/50">
        <div className="flex items-center gap-2">
          {icon && <span className="text-[#003820]">{icon}</span>}
          <span className="font-mono text-[11.5px] font-bold text-[#0b1c30] uppercase tracking-tight">
            {title}
          </span>
        </div>
        {extraHeader}
      </div>
      <div className="p-3.5">{children}</div>
    </div>
  );
};
