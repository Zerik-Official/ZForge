import { useEffect, useState, type ReactElement } from "react";
import { TooltipSimple } from "@/components/ui/Tooltip";
import { t } from "@/locales/i18n";
import type { PresenceActivity } from "@/types/domains/presence";
import { classIconSrc } from "@/utils/characters";
import { localCopy } from "@/utils/presenceImages";

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

/** Elapsed time since `start` (Unix seconds) as Discord writes it: `m:ss` or `h:mm:ss`. */
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
  const seconds = (total % 60).toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
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

/** Address of an image key or URL: the Discord application asset, the URL itself or a local copy. */
function useImage(key: string | null, assets: Record<string, string>, fallback: string) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!key) return { src: null, onError: undefined };
  const isUrl = /^https?:\/\//i.test(key);
  const remote = isUrl ? key : assets[key];
  const local = (isUrl ? localCopy(key) : undefined) ?? fallback;
  const src = remote && failed !== remote ? remote : local;
  return { src: src || null, onError: remote ? () => setFailed(remote) : undefined };
}

/**
 * The Rich Presence activity drawn the way Discord shows it on a profile: large image with
 * the small image in its corner, the game, both text lines, the group size and the time.
 */
export function PresencePreview({ activity, assets, fallbackImage, gameName }: PresencePreviewProps) {
  const elapsed = useElapsed(activity?.start ?? null);
  const smallFallback = activity?.smallImage ? (classIconSrc(CLASS_IDS[activity.smallImage] ?? 0) ?? "") : "";
  const large = useImage(activity?.largeImage ?? null, assets, fallbackImage);
  const small = useImage(activity?.smallImage ?? null, assets, smallFallback);

  if (!activity) {
    return (
      <div className="flex h-28 items-center justify-center rounded-lg bg-[#1e1f22] text-[12.5px] text-[#b5bac1]">
        {t("launcher.settings.richPresence.preview.empty")}
      </div>
    );
  }

  const party = activity.party
    ? t("launcher.settings.richPresence.preview.party", { current: activity.party[0], max: activity.party[1] })
    : null;
  const stateText = [activity.state, party].filter(Boolean).join(" ");

  return (
    <div className="rounded-lg bg-[#1e1f22] p-3 text-[#dbdee1] [font-family:'gg_sans','Noto_Sans',ui-sans-serif,system-ui,sans-serif]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[#f2f3f5]">{t("launcher.settings.richPresence.preview.playing")}</span>
        <i className="fa-solid fa-ellipsis text-[13px] text-[#b5bac1]" />
      </div>
      <div className="flex items-center gap-3">
        <span className="relative h-15 w-15 shrink-0">
          {large.src
            ? withTooltip(
                activity.largeText,
                <img
                  src={large.src}
                  onError={large.onError}
                  alt=""
                  draggable={false}
                  className="h-15 w-15 rounded-lg bg-black/40 object-cover"
                />,
              )
            : null}
          {small.src
            ? withTooltip(
                activity.smallText,
                <img
                  src={small.src}
                  onError={small.onError}
                  alt=""
                  draggable={false}
                  className="absolute -right-1 -bottom-1 h-5.5 w-5.5 rounded-full border-2 border-[#1e1f22] bg-[#1e1f22] object-cover"
                />,
              )
            : null}
        </span>
        <div className="flex min-w-0 flex-col text-[12px] leading-[1.35]">
          <span className="truncate text-[14px] font-semibold text-[#f2f3f5]">{gameName}</span>
          {activity.details ? <span className="truncate">{activity.details}</span> : null}
          <span className="flex min-w-0 flex-wrap items-center gap-x-2.5">
            {stateText ? (
              <span className="flex min-w-0 items-center gap-1.5 truncate">
                {activity.party ? <i className="fa-solid fa-user-group text-[9px] text-[#b5bac1]" /> : null}
                <span className="truncate">{stateText}</span>
              </span>
            ) : null}
            {elapsed ? (
              <span className="flex items-center gap-1 font-semibold text-[#23a55a] tabular-nums">
                <i className="fa-solid fa-gamepad text-[10px]" />
                {elapsed}
              </span>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}
