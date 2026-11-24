import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { TooltipSimple } from "@/components/ui/Tooltip";
import { t } from "@/locales/i18n";
import type { PresenceActivity } from "@/types/domains/presence";
import { classIconSrc } from "@/utils/characters";

/** Class ids by the class image keys of the Discord application. */
const CLASS_IDS: Record<string, number> = {
  warrior: 1,
  paladin: 2,
  hunter: 3,
  rogue: 4,
  priest: 5,
  deathknight: 6,
  shaman: 7,
  mage: 8,
  warlock: 9,
  druid: 11,
};

interface PresencePreviewProps {
  activity: PresenceActivity | null;
  /** Image addresses by asset key, read from the Discord application. */
  assets: Record<string, string>;
  /** Image shown when the large image of the Discord application is not available. */
  fallbackImage: string;
  /** Game name shown as the activity title. */
  gameName: string;
}

/** The image with its hover text, as Discord shows it, when there is one. */
function withTooltip(text: string | null, node: ReactElement): ReactElement {
  return text ? (
    <TooltipSimple content={text} side="top">
      {node}
    </TooltipSimple>
  ) : (
    node
  );
}

/** Elapsed time since `start` (Unix seconds) as `h:mm:ss` or `mm:ss`, refreshed every second. */
function useElapsed(start: number | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (start === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [start]);
  if (start === null) return null;
  const total = Math.max(0, Math.floor(now / 1000 - start));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => value.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * The Rich Presence activity drawn the way Discord shows it on a profile: large image with
 * the class icon in its corner, the game, both text lines, the group size and the time.
 */
export function PresencePreview({ activity, assets, fallbackImage, gameName }: PresencePreviewProps) {
  const elapsed = useElapsed(activity?.start ?? null);

  if (!activity) {
    return (
      <div className="flex h-31 items-center justify-center rounded-(--radius) border border-dashed border-(--border-strong) text-[12.5px] text-(--muted)">
        {t("launcher.settings.richPresence.preview.empty")}
      </div>
    );
  }

  const largeImage = assets[activity.largeImage] ?? fallbackImage;
  const smallImage = activity.smallImage
    ? (assets[activity.smallImage] ?? classIconSrc(CLASS_IDS[activity.smallImage] ?? 0))
    : null;

  return (
    <div className="rounded-(--radius) bg-[#232428] p-4 text-[#dbdee1] shadow-(--shadow-lg)">
      <span className="text-[12px] font-semibold text-[#b5bac1]">{t("launcher.settings.richPresence.preview.playing")}</span>
      <div className="mt-2.5 flex items-center gap-3.5">
        <span className="relative shrink-0">
          {withTooltip(
            activity.largeText,
            <img src={largeImage} alt="" draggable={false} className="h-20 w-20 rounded-lg bg-black/40 object-cover" />,
          )}
          {smallImage
            ? withTooltip(
                activity.smallText,
                <img
                  src={smallImage}
                  alt=""
                  draggable={false}
                  className="absolute -right-1.5 -bottom-1.5 h-7 w-7 rounded-full border-[3px] border-[#232428] bg-[#232428] object-cover"
                />,
              )
            : null}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5 text-[13px] leading-snug">
          <span className="truncate font-semibold text-[#f2f3f5]">{gameName}</span>
          {activity.details ? <span className="truncate">{activity.details}</span> : null}
          {activity.state || activity.party ? (
            <span className="truncate">
              {activity.state}
              {activity.party
                ? ` ${t("launcher.settings.richPresence.preview.party", { current: activity.party[0], max: activity.party[1] })}`
                : ""}
            </span>
          ) : null}
          {elapsed ? (
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-[#23a55a]">
              <i className="fa-solid fa-gamepad text-[10px]" />
              {elapsed}
            </span>
          ) : null}
        </div>
      </div>
      {activity.largeText || activity.smallText ? (
        <div className="mt-3 flex flex-col gap-1 border-t border-white/8 pt-2.5 text-[11.5px] text-[#b5bac1]">
          {activity.largeText ? (
            <span className="flex items-center gap-2 truncate">
              <i className="fa-solid fa-image w-3 text-center text-[10px]" />
              {activity.largeText}
            </span>
          ) : null}
          {activity.smallText ? (
            <span className="flex items-center gap-2 truncate">
              <i className="fa-solid fa-circle-user w-3 text-center text-[10px]" />
              {activity.smallText}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
