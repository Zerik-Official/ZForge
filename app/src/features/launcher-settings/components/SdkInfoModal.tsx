import { useState } from "react";
import { Modal, ModalHeader } from "@/components/ui/Modal";
import { TooltipSimple } from "@/components/ui/Tooltip";
import { t, useLocale } from "@/locales/i18n";
import { api } from "@/services/api";
import { getApiErrorMessage } from "@/utils/apiErrors";

const APACHE_LICENSE_INFO = {
  permissions: ["commercialUse", "modification", "distribution", "patentUse", "privateUse"],
  limitations: ["trademarkUse", "liability", "warranty"],
  conditions: ["licenseAndCopyrightNotice", "stateChanges"],
} as const;

type LicenseColumn = keyof typeof APACHE_LICENSE_INFO;

const LICENSE_COLUMN_META: Record<LicenseColumn, { titleKey: string; icon: string; color: string }> = {
  permissions: { titleKey: "license.permissionsTitle", icon: "fa-solid fa-check", color: "text-(--success)" },
  limitations: { titleKey: "license.limitationsTitle", icon: "fa-solid fa-xmark", color: "text-(--danger)" },
  conditions: { titleKey: "license.conditionsTitle", icon: "fa-solid fa-circle-info", color: "text-(--info)" },
};

/**
 * Props for the {@link SdkInfoModal} component.
 */
interface SdkInfoModalProps {
  /** Controls visibility. */
  open: boolean;
  /** Close callback. */
  onClose: () => void;
}

/**
 * Wide informational modal about the WoWControlSDK.
 */
export function SdkInfoModal({ open, onClose }: SdkInfoModalProps) {
  useLocale();
  const [license, setLicense] = useState<string | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [showLicense, setShowLicense] = useState(false);
  const [showRawLicense, setShowRawLicense] = useState(false);

  async function handleOpenLicense() {
    if (license && showLicense) {
      setShowLicense(!showLicense);
      return;
    }
    if (!license) {
      setLicenseLoading(true);
      setLicenseError(null);
      try {
        const res = await api.getSdkLicense();
        if (res.ok && res.content) {
          setLicense(res.content);
          setShowLicense(true);
        } else {
          const apiResult = res as unknown as import("@/types/domains/api").ApiResult;
          setLicenseError(getApiErrorMessage(apiResult) ?? res.error ?? "Failed to load license");
        }
      } catch (e) {
        setLicenseError(String(e));
      } finally {
        setLicenseLoading(false);
      }
    } else {
      setShowLicense(!showLicense);
    }
  }

  async function handleOpenUrl(url: string) {
    try {
      await api.openExternalUrl(url);
    } catch {
      window.open(url, "_blank");
    }
  }

  return (
    <Modal open={open} onClose={onClose} className="w-full max-w-3xl">
      <ModalHeader icon="fa-solid fa-cube" title={t("launcher.settings.richPresence.info.title")} onClose={onClose} />

      <div className="flex max-h-[65vh] flex-col gap-5 overflow-y-auto px-6 py-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <h3 className="text-[13px] font-semibold text-(--text)">{t("launcher.settings.richPresence.info.whatTitle")}</h3>
          <p className="text-[12px] leading-relaxed text-(--muted)">{t("launcher.settings.richPresence.info.whatDescription")}</p>
        </div>

        <div className="flex flex-col items-center gap-2 text-center">
          <h3 className="text-[13px] font-semibold text-(--text)">{t("launcher.settings.richPresence.info.forWhatTitle")}</h3>
          <p className="text-[12px] leading-relaxed text-(--muted)">{t("launcher.settings.richPresence.info.forWhatDescription")}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <TooltipSimple content={t("launcher.settings.richPresence.info.viewLicense")} side="top">
            <button
              className="flex items-center gap-2 rounded-lg border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-[12px] font-medium text-(--text-soft) hover:bg-(--bg-hover) hover:text-(--text) cursor-pointer"
              onClick={handleOpenLicense}
            >
              <i className="fa-solid fa-scale-balanced text-[12px]" />
              {showLicense ? t("launcher.settings.richPresence.info.hideLicense") : t("launcher.settings.richPresence.info.viewLicense")}
            </button>
          </TooltipSimple>

          <TooltipSimple content="github.com/Zerik-Official/WoWControlSDK" side="top">
            <button
              className="flex items-center gap-2 rounded-lg border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-[12px] font-medium text-(--text-soft) hover:bg-(--bg-hover) hover:text-(--text) cursor-pointer"
              onClick={() => handleOpenUrl("https://github.com/Zerik-Official/WoWControlSDK")}
            >
              <i className="fa-brands fa-github text-[12px]" />
              {t("launcher.settings.richPresence.info.repository")}
            </button>
          </TooltipSimple>

          <TooltipSimple content="github.com/Zerik-Official" side="top">
            <button
              className="flex items-center gap-2 rounded-lg border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-[12px] font-medium text-(--text-soft) hover:bg-(--bg-hover) hover:text-(--text) cursor-pointer"
              onClick={() => handleOpenUrl("https://github.com/Zerik-Official")}
            >
              <i className="fa-solid fa-user text-[12px]" />
              {t("launcher.settings.richPresence.info.author")}
            </button>
          </TooltipSimple>
        </div>

        {showLicense ? (
          <div className="flex flex-col gap-2 rounded-xl border border-(--border-strong) bg-(--bg-input) p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-(--muted)">Apache License 2.0</span>
              <button
                className="text-[11px] text-(--muted) hover:text-(--text-soft) cursor-pointer"
                onClick={() => setShowLicense(false)}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            {licenseLoading ? (
              <div className="flex items-center justify-center py-6 text-(--muted)">
                <i className="fa-solid fa-spinner fa-spin text-[14px]" />
              </div>
            ) : licenseError ? (
              <span className="text-[12px] text-(--danger)">{licenseError}</span>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {(Object.keys(APACHE_LICENSE_INFO) as LicenseColumn[]).map((column) => {
                    const meta = LICENSE_COLUMN_META[column];
                    return (
                      <div key={column} className="flex flex-col gap-2">
                        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-(--muted)">
                          {t(`launcher.settings.richPresence.info.${meta.titleKey}`)}
                        </span>
                        <ul className="flex flex-col gap-1.5">
                          {APACHE_LICENSE_INFO[column].map((item) => (
                            <li key={item} className="flex items-start gap-2 text-[11.5px] text-(--text-soft)">
                              <i className={`${meta.icon} mt-0.5 text-[10px] ${meta.color}`} />
                              {t(`launcher.settings.richPresence.info.license.items.${item}`)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>

                <button
                  className="flex items-center gap-1.5 self-start text-[11px] font-medium text-(--muted) hover:text-(--text-soft) cursor-pointer"
                  onClick={() => setShowRawLicense(!showRawLicense)}
                >
                  <i className={`fa-solid fa-chevron-${showRawLicense ? "up" : "down"} text-[9px]`} />
                  {showRawLicense
                    ? t("launcher.settings.richPresence.info.license.hideRaw")
                    : t("launcher.settings.richPresence.info.license.showRaw")}
                </button>

                {showRawLicense ? (
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap wrap-break-word rounded-lg bg-(--bg-elevated) p-3 text-[11px] leading-relaxed text-(--text-soft)">
                    {license}
                  </pre>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-(--border) px-6 py-4">
        <button className="ghost-btn rounded-lg px-4 py-2 text-[13px] cursor-pointer" onClick={onClose}>
          {t("common.cancel") !== "Cancel" ? t("common.cancel") : "Close"}
        </button>
      </div>
    </Modal>
  );
}