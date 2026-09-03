import { useState } from "react";
import { Modal, ModalHeader } from "@/components/ui/Modal";
import { TooltipSimple } from "@/components/ui/Tooltip";
import { t, useLocale } from "@/locales/i18n";
import { api } from "@/services/api";

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
          setLicenseError(res.error ?? "Failed to load license");
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
        <div className="flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold text-(--text)">{t("launcher.settings.richPresence.info.whatTitle")}</h3>
          <p className="text-[12px] leading-relaxed text-(--muted)">{t("launcher.settings.richPresence.info.whatDescription")}</p>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold text-(--text)">{t("launcher.settings.richPresence.info.howTitle")}</h3>
          <p className="text-[12px] leading-relaxed text-(--muted)">{t("launcher.settings.richPresence.info.howDescription")}</p>
          <ul className="flex flex-col gap-1.5 rounded-lg border border-(--border-strong) bg-(--bg-input) p-3 text-[12px] text-(--muted)">
            <li className="flex items-start gap-2">
              <i className="fa-solid fa-code mt-0.5 text-[11px] text-(--primary)" /> Lua execution, unit queries, group/raid, world state, player info
            </li>
            <li className="flex items-start gap-2">
              <i className="fa-solid fa-network-wired mt-0.5 text-[11px] text-(--primary)" /> Named pipe <span className="font-mono text-[11px] text-(--text-soft)">\\.\pipe\WowGameCommand</span> · JSON-RPC 2.0 · +40 methods
            </li>
            <li className="flex items-start gap-2">
              <i className="fa-brands fa-windows mt-0.5 text-[11px] text-(--primary)" /> WoW 3.3.5a (12340) · Windows 10+
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-2">
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
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-(--bg-elevated) p-3 text-[11px] leading-relaxed text-(--text-soft)">
                {license}
              </pre>
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