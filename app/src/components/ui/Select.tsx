import { useEffect, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
  thumb?: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * Themed dropdown used instead of a native <select>.
 *
 * Native option popups can't be reliably restyled across platforms, so this
 * renders its own listbox and supports an optional thumbnail per option.
 */
export function Select({ value, options, onChange, placeholder = "Seleccionar" }: SelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = options.find((option) => option.value === value);

  return (
    <div className="select-root" ref={rootRef}>
      <button type="button" className="select-trigger cursor-pointer" onClick={() => setOpen((prev) => !prev)}>
        <span className="flex min-w-0 items-center gap-2">
          {selected?.thumb ? <img src={selected.thumb} alt="" className="select-thumb" /> : null}
          <span className="truncate">{selected?.label ?? placeholder}</span>
        </span>
        <i className={`fa-solid fa-chevron-down select-chevron${open ? " select-chevron--open" : ""}`} />
      </button>

      {open ? (
        <div className="select-menu">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`select-option${option.value === value ? " select-option--active" : ""} cursor-pointer`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.thumb ? <img src={option.thumb} alt="" className="select-thumb" /> : null}
              <span className="truncate">{option.label}</span>
              {option.value === value ? <i className="fa-solid fa-check select-check" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
