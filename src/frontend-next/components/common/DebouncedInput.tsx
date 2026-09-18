"use client";

import React, { useState, useEffect } from "react";
import { Search } from "@carbon/react";

interface DebouncedInputProps {
  value: string;
  onChange: (value: string) => void;
  debounce?: number;
  className?: string;
  placeholder?: string;
  /** Visible label; Carbon requires one and hides it, so it must say something
   *  useful to a screen reader rather than repeat the placeholder. */
  labelText?: string;
  id?: string;
  size?: "sm" | "md" | "lg";
}

/**
 * Carbon Search with the keystroke debounce this console needs — filtering a
 * 220-row table on every keypress is what made the asset list feel sticky.
 * Carbon has no debounced variant, so the delay is here and everything visible
 * is Carbon's.
 */
export const DebouncedInput: React.FC<DebouncedInputProps> = ({
  value: initialValue,
  onChange,
  debounce = 250,
  className = "",
  placeholder = "Search…",
  labelText = "Search",
  id,
  size = "sm",
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
    <Search
      id={id}
      size={size}
      labelText={labelText}
      placeholder={placeholder}
      closeButtonLabelText="Clear search"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClear={() => setValue("")}
      className={className}
    />
  );
};
