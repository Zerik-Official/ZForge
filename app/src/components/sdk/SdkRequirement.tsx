import { TooltipSimple } from "@/components/ui/Tooltip";
import { useSdkInstall } from "@/hooks/useSdkInstall";
import { t } from "@/locales/i18n";
import type { FeatureStatus } from "@/types/domains/capabilities";

interface SdkRequirementProps {
  /** Status of the feature; nothing is shown while loading or when it is available. */
  status: FeatureStatus | null;
  /**
   * `banner` explains the requirement and offers the install, update or repair
   * button; `badge` is a small pill for a single control.
   * @default "banner"
   */
  variant?: "banner" | "badge";
}

function actionKey(status: FeatureStatus): string {
  if (status.reason === "sdk_corrupted") return "capabilities.actions.repair";
  if (status.reason === "sdk_outdated") return "capabilities.actions.update";
  return "capabilities.actions.install";
}

function reasonText(status: FeatureStatus): string {
  const reason = t(`capabilities.reasons.${status.reason ?? "sdk_missing"}`);
  return status.fixable ? reason : `${reason} ${t("capabilities.notPublished")}`;
}

/**
 * What a feature needs from the SDK, with a single button that installs,
 * updates or repairs it in place.
 */
export function SdkRequirement({ status, variant = "banner" }: SdkRequirementProps) {
  const { installing, progress, error, install } = useSdkInstall();

  if (!status || status.available) return null;

  const title = t("capabilities.requires", { version: status.required_version });

  if (variant === "badge") {
    return (
      <TooltipSimple content={reasonText(status)} side="top">
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
          <i className="fa-solid fa-cube text-[9px]" />
          {title}
        </span>
      </TooltipSimple>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <i className="fa-solid fa-cube mt-0.5 text-[13px] text-amber-500" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[12px] font-semibold text-amber-500">{title}</span>
          <span className="text-[11px] leading-relaxed text-(--muted)">{reasonText(status)}</span>
        </div>
        {status.fixable && !installing ? (
          <button
            className="flex shrink-0 items-center gap-2 rounded-lg bg-[linear-gradient(160deg,var(--primary-hover),var(--primary-active))] px-3 py-1.5 text-[12px] font-semibold text-white hover:brightness-105 cursor-pointer"
            onClick={() => void install()}
          >
            <i className="fa-solid fa-download text-[11px]" />
            {t(actionKey(status))}
          </button>
        ) : null}
      </div>
      {installing ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] text-(--muted)">
            <span>{t("capabilities.installing")}</span>
            <span>{progress ? `${progress.percent}%` : ""}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full border border-(--border-strong) bg-(--bg-input)">
            <div className="h-full bg-(--primary) transition-all duration-200" style={{ width: `${progress?.percent ?? 0}%` }} />
          </div>
        </div>
      ) : null}
      {error ? <span className="text-[11px] text-(--danger)">{error}</span> : null}
    </div>
  );
}
