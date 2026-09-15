"use client";

import React, { useState, useEffect } from "react";
import { Search } from "lucide-react";

interface DebouncedInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  debounce?: number;
  showIcon?: boolean;
}

export const DebouncedInput: React.FC<DebouncedInputProps> = ({
  value: initialValue,
  onChange,
  debounce = 250,
  showIcon = true,
  className = "",
  placeholder = "Search...",
  ...props
}) => {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(value);
    }, debounce);

    return () => clearTimeout(timer);
  }, [value, debounce, onChange]);

  return (
    <div className="relative flex items-center w-full">
      {showIcon && (
        <Search className="absolute left-2.5 w-4 h-4 text-[#707971] pointer-events-none" />
      )}
      <input
        {...props}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className={`w-full h-8 ${
          showIcon ? "pl-8" : "pl-3"
        } pr-3 bg-[#eff4ff] text-[#0b1c30] text-[12.5px] rounded-md border border-[#c0c9c0]/60 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0f5132] focus:border-[#0f5132] transition-colors placeholder:text-[#707971] ${className}`}
      />
    </div>
  );
};
