import { useState, type ReactNode } from "react";
import { useThemeControls } from "@/store/themeStore";
import { imageStyle } from "@/utils/theme";

/** Size of a skinned checkbox when the theme does not set one. */
const SKIN_SIZE = 22;

/**
 * Properties for the {@link Checkbox} component.
 */
interface CheckboxProps {
  /** Whether the checkbox is currently selected. */
  checked: boolean;
  /** Callback fired whenever the checked state changes. */
  onChange: (checked: boolean) => void;
  /** Primary label shown beside the checkbox. */
  label: string;
  /** Optional supporting text displayed beneath the label. */
  description?: string;
  /** Disables interaction and visually dims the component when true. */
  disabled?: boolean;
  /**
   * `inline` puts the box before the label. `row` fills a settings panel row: label on the
   * left, box on the right, and the whole row is clickable.
   * @default "inline"
   */
  layout?: "inline" | "row";
  /** Font Awesome class of an icon tile shown before the label in the `row` layout. */
  icon?: string;
  /** Extra content placed before the box in the `row` layout, such as a badge. */
  trailing?: ReactNode;
}

/**
 * Themed checkbox component used instead of a native `<input type="checkbox">`.
 *
 * Renders a custom-styled box driven by the `checked` prop while keeping
 * a hidden native input (`sr-only`) intact for screen readers and accessibility.
 * A theme can replace the box and the check with its own images.
 *
 * @example
 * ```tsx
 * <Checkbox
 *   checked={isEnabled}
 *   label="Enable notifications"
 *   description="Receive updates about your downloads."
 *   onChange={setIsEnabled}
 * />
 * ```
 */
export function Checkbox({ checked, onChange, label, description, disabled, layout = "inline", icon, trailing }: CheckboxProps) {
  const skin = useThemeControls()?.checkbox ?? null;
  const [hovered, setHovered] = useState(false);

  let box: ReactNode;
  if (skin) {
    const image = hovered && !disabled && skin.hover ? skin.hover : skin.box;
    const check = disabled && skin.checkDisabled ? skin.checkDisabled : skin.check;
    const size = image.width ?? SKIN_SIZE;
    box = (
      <span className="relative flex shrink-0 items-center justify-center" style={imageStyle(image, size, size)}>
        {checked ? <span className="absolute" style={imageStyle(check, size, size)} /> : null}
      </span>
    );
  } else {
    box = (
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors duration-150 ${
          checked
            ? "border-(--primary) bg-(--primary)"
            : `border-(--border-strong) bg-(--bg-input) ${disabled ? "" : "group-hover:border-(--muted-2)"}`
        }`}
      >
        <i
          className={`fa-solid fa-check text-[11px] text-(--on-primary) transition-opacity duration-100 ${
            checked ? "opacity-100" : "opacity-0"
          }`}
        />
      </span>
    );
  }

  const input = (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="peer sr-only"
    />
  );

  if (layout === "row") {
    return (
      <label
        className={`group flex items-center gap-3.5 px-4.5 py-3.25 transition-colors has-focus-visible:bg-(--bg-hover) ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-(--bg-elevated)/50"
        }`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {input}
        {icon ? (
          <span className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-[7px] bg-(--bg-elevated) text-[13px] text-(--muted)">
            <i className={icon} />
          </span>
        ) : null}
        <span className="flex min-w-0 flex-1 flex-col gap-0.75">
          <span className="text-[13.5px] font-[550] text-(--text)">{label}</span>
          {description ? <span className="text-[12.5px] leading-snug text-(--muted)">{description}</span> : null}
        </span>
        {trailing}
        {box}
      </label>
    );
  }

  return (
    <label
      className={`group flex items-start gap-2.5 text-[13px] text-(--text-soft) ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {input}
      <span className="mt-px">{box}</span>
      <span className="flex flex-col gap-0.5">
        <span>{label}</span>
        {description ? <span className="text-[12px] text-(--muted)">{description}</span> : null}
      </span>
    </label>
  );
}
