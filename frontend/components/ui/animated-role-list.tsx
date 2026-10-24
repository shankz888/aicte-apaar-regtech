"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";

export type RoleListOption = {
  value: string;
  label: string;
  description: string;
};

type AnimatedRoleListProps = {
  id: string;
  value: string;
  options: RoleListOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function AnimatedRoleList({ id, value, options, onChange, disabled = false }: AnimatedRoleListProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[selectedIndex]?.focus();
  }, [open, selectedIndex]);

  const choose = (option: RoleListOption) => {
    onChange(option.value);
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const focusOption = (index: number) => optionRefs.current[(index + options.length) % options.length]?.focus();

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
    if (event.key === "Escape") setOpen(false);
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown") { event.preventDefault(); focusOption(index + 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); focusOption(index - 1); }
    else if (event.key === "Home") { event.preventDefault(); focusOption(0); }
    else if (event.key === "End") { event.preventDefault(); focusOption(options.length - 1); }
    else if (event.key === "Escape") { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
  };

  return (
    <div className="animated-role-dropdown" ref={rootRef}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-label="Authorization role"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        disabled={disabled}
        className={`animated-role-trigger ${open ? "is-open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="animated-role-value">{selected?.label}</span>
        <ChevronDown aria-hidden="true" className="animated-role-chevron" />
      </button>
      {open && (
        <div id={`${id}-listbox`} role="listbox" aria-labelledby={id} className="animated-role-list">
          {options.map((option, index) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="option"
                aria-selected={active}
                tabIndex={-1}
                className={`animated-role-option ${active ? "is-selected" : ""}`}
                style={{ animationDelay: `${index * 45}ms` }}
                onClick={() => choose(option)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
              >
                <span className="animated-role-option-copy"><strong>{option.label}</strong><small>{option.description}</small></span>
                <Check aria-hidden="true" className="animated-role-check" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
