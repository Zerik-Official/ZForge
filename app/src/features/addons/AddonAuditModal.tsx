import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/Modal";
import { t, useLocale } from "@/locales/i18n";
import type { AddonReport } from "@/types/domains/addon";
import { SEVERITY_STYLE } from "./severity";

interface AddonAuditModalProps {
  /** Title of the addon whose findings are shown. */
  title: string | null;
  report: AddonReport | null;
  onClose: () => void;
}

/**
 * What the addon check found in one addon: each rule with its explanation, where it
 * appears and the code itself.
 */
export function AddonAuditModal({ title, report, onClose }: AddonAuditModalProps) {
  useLocale();
  const open = title !== null && report !== null;

  return (
    <Modal open={open} onClose={onClose} className="flex max-h-[86vh] w-full max-w-2xl flex-col">
      <ModalHeader
        icon="fa-solid fa-magnifying-glass-chart"
        title={t("launcher.addons.audit.title", { name: title ?? "" })}
        subtitle={report ? t("launcher.addons.audit.count", { count: report.findings.length }) : undefined}
        onClose={onClose}
      />
      <ModalBody className="gap-3">
        {(report?.findings ?? []).map((finding) => {
          const style = SEVERITY_STYLE[finding.severity];
          const where = finding.file
            ? finding.line > 0
              ? `${finding.file}:${finding.line}`
              : finding.file
            : null;
          return (
            <article
              key={`${finding.rule}-${finding.file}`}
              className="flex flex-col gap-2 rounded-(--radius) border border-(--border) bg-(--bg-elevated)/40 px-4 py-3"
            >
              <header className="flex items-start gap-2.5">
                <i className={`${style.icon} mt-0.5 text-[13px] ${style.text}`} aria-hidden="true" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-(--text)">
                      {t(`launcher.addons.audit.rules.${finding.rule}.title`)}
                    </span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${style.badge}`}>
                      {t(`launcher.addons.audit.severity.${finding.severity}`)}
                    </span>
                  </span>
                  <span className="text-[12.5px] leading-relaxed text-(--muted)">
                    {t(`launcher.addons.audit.rules.${finding.rule}.description`)}
                  </span>
                </div>
              </header>
              {where || finding.count > 1 ? (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-6 text-[12px] text-(--muted-2)">
                  {where ? <span className="font-mono break-all">{where}</span> : null}
                  {finding.count > 1 ? <span>{t("launcher.addons.audit.times", { count: finding.count })}</span> : null}
                </span>
              ) : null}
              {finding.excerpt ? (
                <code className="ml-6 block overflow-x-auto rounded-md bg-(--bg) px-3 py-2 font-mono text-[12px] whitespace-pre text-(--text-soft)">
                  {finding.excerpt}
                </code>
              ) : null}
            </article>
          );
        })}
        <p className="pt-1 text-[12px] leading-relaxed text-(--muted-2)">{t("launcher.addons.audit.disclaimer")}</p>
      </ModalBody>
      <ModalFooter>
        <button className="ghost-btn rounded-[7px] px-4 py-2 text-[13px] cursor-pointer" onClick={onClose}>
          {t("common.close")}
        </button>
      </ModalFooter>
    </Modal>
  );
}
