interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

/**
 * Themed checkbox component used instead of a native `<input type="checkbox">`.
 *
 * Renders a custom-styled box driven by the `checked` prop while keeping 
 * a hidden native input (`sr-only`) intact for screen readers and accessibility.
 *
 * @example
 * ```tsx
 * <Checkbox * checked="{isEnabled}" description="Receive updates about your downloads." label="Enable notifications" onChange="{setIsEnabled}"/>
 * ```
 */
export function Checkbox({ checked, onChange, label, description, disabled }: CheckboxProps) {
  return (
    <label
      className={`group flex items-start gap-2.5 text-[13px] text-(--text-soft) ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      <span
        className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-[5px] border transition-all duration-150 ${
          checked
            ? "border-(--primary) bg-[linear-gradient(160deg,var(--primary-hover),var(--primary-active))]"
            : `border-(--border-strong) bg-(--bg-input) ${disabled ? "" : "group-hover:border-(--primary)"}`
        }`}
      >
        <i
          className={`fa-solid fa-check text-[10px] text-white transition-opacity duration-100 ${
            checked ? "opacity-100" : "opacity-0"
          }`}
        />
      </span>
      <span className="flex flex-col gap-0.5">
        <span>{label}</span>
        {description ? <span className="text-[11px] text-(--muted)">{description}</span> : null}
      </span>
    </label>
  );
}
