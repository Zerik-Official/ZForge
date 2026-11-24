import { classColor, classIconSrc, portraitSrc, UNKNOWN_PORTRAIT } from "@/utils/characters";

/**
 * Properties for the {@link CharacterPortrait} component.
 */
interface CharacterPortraitProps {
  race: number;
  gender: number;
  classId: number;
  /** Side of the square in pixels. @default 40 */
  size?: number;
  /** Description of the image, such as the race and class names. */
  label?: string;
}

/**
 * Portrait of the race and gender of a character, framed in its class color, with the
 * class icon in the corner.
 */
export function CharacterPortrait({ race, gender, classId, size = 40, label = "" }: CharacterPortraitProps) {
  const color = classColor(classId);
  const classIcon = classIconSrc(classId);
  const badge = Math.round(size * 0.45);

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <img
        src={portraitSrc(race, gender)}
        alt={label}
        width={size}
        height={size}
        draggable={false}
        onError={(event) => {
          if (!event.currentTarget.src.endsWith(UNKNOWN_PORTRAIT)) event.currentTarget.src = UNKNOWN_PORTRAIT;
        }}
        className="h-full w-full rounded-[7px] object-cover select-none"
        style={{ boxShadow: `0 0 0 1px ${color ?? "var(--border-strong)"}` }}
      />
      {classIcon ? (
        <img
          src={classIcon}
          alt=""
          width={badge}
          height={badge}
          draggable={false}
          className="absolute -right-1 -bottom-1 rounded-[4px] border-2 border-[var(--portrait-bg,var(--bg-card))] select-none"
          style={{ width: badge, height: badge }}
        />
      ) : null}
    </span>
  );
}
