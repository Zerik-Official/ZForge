import { useEffect, useRef, useState } from "react";

/**
 * A single option in the {@link Select} dropdown.
 */
export interface SelectOption {
  /** Internal value sent to the parent state when selected. */
  value: string;
  /** Label shown to the user in the dropdown list. */
  label: string;
  /** Optional image shown alongside the label, such as a game or server logo. */
  thumb?: string;
}

/**
 * Properties for the {@link Select} component.
 */
interface SelectProps {
  /** Currently selected value. */
  value: string;
  /** List of options displayed in the dropdown menu. */
  options: SelectOption[];
  /** Callback fired when a different option is selected. */
  onChange: (value: string) => void;
  /** Text shown when no option is currently selected. @default "Seleccionar" */
  placeholder?: string;
}

/**
 * Themed dropdown used instead of a native `<select>`.
 *
 * Native option popups can't be reliably restyled across platforms, so this
 * renders its own listbox and supports an optional thumbnail per option.
 *
 * @example
 * ```tsx
 * <Select
 *   value={selectedRegion}
 *   options={regions}
 *   onChange={setSelectedRegion}
 *   placeholder="Seleccionar región"
 * />
 * ```
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
