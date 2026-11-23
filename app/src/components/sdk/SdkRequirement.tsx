import { Notice } from "@/components/layout/Notice";
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
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-(--warning)/10 px-2 py-0.5 text-[11px] font-semibold text-(--warning)">
          <i className="fa-solid fa-cube text-[9px]" />
          {title}
        </span>
      </TooltipSimple>
    );
  }

  return (
    <Notice
      tone="warning"
      icon="fa-solid fa-cube"
      title={title}
      description={reasonText(status)}
      action={
        status.fixable && !installing ? (
          <button
            className="flex shrink-0 items-center gap-2 rounded-[7px] bg-(--primary) px-3 py-1.5 text-[12.5px] font-semibold text-(--on-primary) transition-colors hover:bg-(--primary-hover) cursor-pointer"
            onClick={() => void install()}
          >
            <i className="fa-solid fa-download text-[11px]" />
            {t(actionKey(status))}
          </button>
        ) : null
      }
    >
      {installing ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[12px] text-(--muted)">
            <span>{t("capabilities.installing")}</span>
            <span className="tabular-nums">{progress ? `${progress.percent}%` : ""}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--bg-input)">
            <div className="h-full bg-(--primary) transition-all duration-200" style={{ width: `${progress?.percent ?? 0}%` }} />
          </div>
        </div>
      ) : null}
      {error ? <span className="text-[12px] text-(--danger)">{error}</span> : null}
    </Notice>
  );
}
