import { TooltipSimple } from "@/components/ui/Tooltip";
import { useBuildInfo } from "@/hooks/useBuildInfo";
import { getLocale, t, useLocale } from "@/locales/i18n";
import { api } from "@/services/api";
import type { BuildInfo } from "@/types/domains/system";
import { formatDateTime } from "@/utils/formatters";

/** Tooltip of the commit: its date, and a note when the build had uncommitted changes. */
function commitTooltip(info: BuildInfo): string {
  const date = info.commit_date ? formatDateTime(info.commit_date, getLocale()) : null;
  const lines = [date ? t("launcher.build.commitDate", { date }) : t("launcher.build.commitDateUnknown")];
  if (info.dirty) lines.push(t("launcher.build.dirty"));
  if (info.commit_url) lines.push(t("launcher.build.openCommit"));
  return lines.join("\n");
}

/**
 * Properties for the {@link CommitLink} component.
 */
interface CommitLinkProps {
  info: BuildInfo;
  className?: string;
}

/**
 * Abbreviated commit hash; hovering shows its date and clicking opens it on GitHub.
 */
export function CommitLink({ info, className = "" }: CommitLinkProps) {
  useLocale();
  if (!info.commit_short) {
    return <span className={className}>{t("launcher.build.noCommit")}</span>;
  }
  const label = `${info.commit_short}${info.dirty ? "*" : ""}`;
  return (
    <TooltipSimple content={<span className="whitespace-pre-line">{commitTooltip(info)}</span>} side="top" align="end">
      <button
        className={`inline-flex items-center gap-1.5 rounded-md font-mono transition-colors ${
          info.commit_url ? "cursor-pointer hover:text-(--text)" : "cursor-default"
        } ${className}`}
        onClick={() => {
          if (info.commit_url) void api.openExternalUrl(info.commit_url);
        }}
        aria-label={t("launcher.build.commitLabel", { commit: label })}
      >
        <i className="fa-brands fa-github text-[11px]" aria-hidden="true" />
        {label}
      </button>
    </TooltipSimple>
  );
}

/**
 * Launcher version and commit in the bottom corners of a full-screen view, such as the
 * boot screen.
 */
export function BuildCorners() {
  useLocale();
  const info = useBuildInfo();
  if (!info) return null;
  return (
    <>
      <span className="pointer-events-none absolute bottom-4 left-5 text-[11.5px] text-(--muted-2) tabular-nums select-none">
        {t("launcher.build.version", { version: info.version })}
      </span>
      <span className="absolute right-5 bottom-3.5 text-[11.5px] text-(--muted-2)">
        <CommitLink info={info} className="px-1.5 py-0.5" />
      </span>
    </>
  );
}
