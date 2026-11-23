/**
 * Properties for the {@link Sigil} component.
 */
interface SigilProps {
  /** Rendered size in pixels. @default 24 */
  size?: number;
  /** Stroke width in viewBox units (the box is 100 wide). @default 7 */
  strokeWidth?: number;
  className?: string;
}

/** Outline of the hexagon that frames the ZForge sigil. */
export const SIGIL_HEXAGON = "M50 6 L88 28 V72 L50 94 L12 72 V28 Z";
/** The Z crossing the sigil. */
export const SIGIL_Z = "M31 32 H69 L31 68 H69";
/** Vertical axis through the sigil. */
export const SIGIL_AXIS = "M50 18 V82";
/** Short bar across the middle of the axis. */
export const SIGIL_BAR = "M41 50 H59";

/**
 * ZForge sigil: a Z crossed by an axis inside a hexagon, drawn in the primary color.
 */
export function Sigil({ size = 24, strokeWidth = 7, className }: SigilProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={SIGIL_HEXAGON} />
      <path d={SIGIL_Z} />
      <path d={SIGIL_AXIS} />
      <path d={SIGIL_BAR} />
    </svg>
  );
}
