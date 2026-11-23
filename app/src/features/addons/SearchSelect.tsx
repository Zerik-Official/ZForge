import { useEffect, useRef, useState } from "react";
import { useThemeControls } from "@/store/themeStore";
import { frameStyle, imageStyle } from "@/utils/theme";

/** An option of {@link SearchSelect}. */
export interface SearchSelectOption {
  value: string;
  label: string;
  /** Secondary text shown under the label and used by the search. */
  sublabel?: string;
  /** Short text shown at the right of the option. */
  badge?: string;
}

interface SearchSelectProps {
  value: string;
  options: SearchSelectOption[];
  onChange: (value: string) => void;
  /** Text of the search box inside the menu. */
  searchPlaceholder: string;
  /** Text shown when no option matches the search. */
  emptyText: string;
}

/**
 * Dropdown like `Select` with a search box at the top of its menu, for long
 * lists such as accounts and characters.
 */
export function SearchSelect({ value, options, onChange, searchPlaceholder, emptyText }: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const skin = useThemeControls()?.select ?? null;

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
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? options.filter(
        (option) =>
          option.label.toLowerCase().includes(needle) || (option.sublabel?.toLowerCase().includes(needle) ?? false),
      )
    : options;

  function toggle() {
    setQuery("");
    setOpen((current) => !current);
  }

  return (
    <div className="select-root" ref={rootRef}>
      <button
        type="button"
        className="select-trigger cursor-pointer"
        style={skin ? frameStyle(skin.frame) : undefined}
        onClick={toggle}
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate">{selected?.label ?? ""}</span>
          {selected?.sublabel ? (
            <span className="truncate text-[11px] text-(--muted)">{selected.sublabel}</span>
          ) : null}
        </span>
        {skin?.arrow ? (
          <span className="shrink-0" style={imageStyle(skin.arrow, 20, 20)} />
        ) : (
          <i className={`fa-solid fa-chevron-down select-chevron${open ? " select-chevron--open" : ""}`} />
        )}
      </button>

      {open ? (
        <div className="select-menu max-h-80!" style={skin ? frameStyle(skin.frame) : undefined}>
          <div className="sticky top-0 z-10 bg-(--bg-elevated) pb-1">
            <input
              className="field-input w-full"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
                if (event.key === "Enter" && filtered.length > 0) {
                  onChange(filtered[0].value);
                  setOpen(false);
                }
              }}
              placeholder={searchPlaceholder}
              spellCheck={false}
              autoComplete="off"
              autoFocus
            />
          </div>
          {filtered.length === 0 ? (
            <span className="block px-3 py-2 text-[11.5px] text-(--muted)">{emptyText}</span>
          ) : (
            filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`select-option${option.value === value ? " select-option--active" : ""} cursor-pointer`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="flex min-w-0 flex-1 flex-col items-start">
                  <span className="truncate">{option.label}</span>
                  {option.sublabel ? (
                    <span className="truncate text-[10.5px] text-(--muted)">{option.sublabel}</span>
                  ) : null}
                </span>
                {option.badge ? <span className="shrink-0 text-[10.5px] text-(--muted)">{option.badge}</span> : null}
                {option.value === value ? <i className="fa-solid fa-check select-check" /> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
