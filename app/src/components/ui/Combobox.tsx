import { useEffect, useRef, useState } from "react";

/**
 * A single selectable item in the {@link Combobox} suggestion list.
 */
export interface ComboboxOption<T = unknown> {
  /** The internal value written back to the parent state. */
  value: string;
  /** Visible text shown for the option in the dropdown. */
  label: string;
  /** Optional secondary metadata displayed beneath the label. */
  sublabel?: string;
  /** Optional image URL shown on the left side of the option. */
  thumb?: string;
  /** Small status badge rendered next to the label. */
  badge?: string;
  /** Arbitrary payload associated with the option for downstream logic. */
  meta?: T;
}

/**
 * Properties for the {@link Combobox} component.
 */
interface ComboboxProps<T = unknown> {
  /** Current text value bound to the input. */
  value: string;
  /** Callback fired whenever the user edits the input text. */
  onChange: (value: string) => void;
  /** Full list of available suggestions to filter from. */
  options: ComboboxOption<T>[];
  /** Optional callback when a suggestion is chosen. */
  onSelect?: (option: ComboboxOption<T>) => void;
  /** Placeholder shown when the input is empty. */
  placeholder?: string;
}

/**
 * Free-text input with a filtered suggestion list underneath.
 *
 * Unlike `Select`, the value isn't limited to one of the options: the user
 * can keep whatever they typed if nothing matches, or click a suggestion to
 * adopt it. Built on the same `.select-*` classes as `Select` for a
 * consistent look, with an `<input>` in place of the trigger button.
 *
 * @example
 * ```tsx
 * <Combobox
 *   value={serverName}
 *   onChange={setServerName}
 *   options={servers}
 *   placeholder="Search for a server"
 * />
 * ```
 */
export function Combobox<T = unknown>({ value, onChange, options, onSelect, placeholder }: ComboboxProps<T>) {
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

  const query = value.trim().toLowerCase();
  const filtered = query
    ? options.filter(
        (option) =>
          option.label.toLowerCase().includes(query) ||
          option.value.toLowerCase().includes(query) ||
          (option.sublabel?.toLowerCase().includes(query) ?? false),
      )
    : options;

  return (
    <div className="select-root" ref={rootRef}>
      <input
        className="field-input w-full cursor-text"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
      />

      {open && filtered.length > 0 ? (
        <div className="select-menu">
          {filtered.map((option) => (
            <button
              key={option.value}
              type="button"
              className="select-option cursor-pointer"
              spellCheck="false"
              onClick={() => {
                onChange(option.value);
                onSelect?.(option);
                setOpen(false);
              }}
            >
              {option.thumb ? (
                <img
                  src={option.thumb}
                  alt=""
                  className="select-thumb"
                  onError={(event) => {
                    event.currentTarget.style.visibility = "hidden";
                  }}
                />
              ) : (
                <span className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-md bg-(--bg-card)">
                  <i className="fa-solid fa-server text-[10px] text-(--muted)" />
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col items-start">
                <span className="flex items-center gap-1.5 truncate">
                  {option.label}
                  {option.badge ? (
                    <span className="shrink-0 rounded-full bg-(--accent-dim) px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-(--accent)">
                      {option.badge}
                    </span>
                  ) : null}
                </span>
                {option.sublabel ? (
                  <span className="truncate text-[10.5px] text-(--muted)">{option.sublabel}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
