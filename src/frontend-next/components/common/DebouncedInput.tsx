"use client";

import React, { useState, useEffect, useRef } from "react";
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
 *
 * Two details below are load-bearing, and getting either wrong reintroduces a
 * bug that is very hard to see:
 *
 * 1. `onChange` is held in a ref and kept OUT of the effect's dependencies.
 *    Callers pass an inline arrow, so its identity changes on every parent
 *    render. As a dependency it re-armed the timer on every render and fired
 *    `onChange` again — and since the asset page's handler resets pagination,
 *    "Next" set page 1, the re-render re-fired this, and the page snapped
 *    straight back to 1 of 19. The table looked like it simply would not page.
 *
 * 2. The effect fires only when the debounced text differs from what the
 *    parent already has. Without that it emits once on mount and after every
 *    externally-driven value change, which is the same unwanted write.
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

  // Always call the newest handler without depending on its identity.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Track what the parent last told us, so an echo of our own emit — or a
  // programmatic reset — does not bounce back out as a fresh change.
  const parentValueRef = useRef(initialValue);
  useEffect(() => {
    parentValueRef.current = initialValue;
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (value === parentValueRef.current) return;
    const timer = setTimeout(() => {
      parentValueRef.current = value;
      onChangeRef.current(value);
    }, debounce);
    return () => clearTimeout(timer);
  }, [value, debounce]);

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
