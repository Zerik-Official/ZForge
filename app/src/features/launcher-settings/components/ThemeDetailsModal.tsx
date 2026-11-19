import { useState } from "react";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/Modal";
import { t } from "@/locales/i18n";
import type { ThemeSummary } from "@/types/domains/theme";
import { toDisplaySrc } from "@/utils/asset";

interface ThemeDetailsModalProps {
  theme: ThemeSummary;
  active: boolean;
  busy: boolean;
  onUse: () => void;
  onClose: () => void;
}

/**
 * Details of a theme: screenshots, description, author, version and the
 * launcher versions it supports.
 */
export function ThemeDetailsModal({ theme, active, busy, onUse, onClose }: ThemeDetailsModalProps) {
  const [selected, setSelected] = useState(0);
  const preview = theme.previews[selected] ?? theme.previews[0] ?? null;

  return (
    <Modal open onClose={onClose} className="w-full max-w-2xl max-h-[88vh]">
      <ModalHeader
        icon="fa-solid fa-palette"
        title={theme.name}
        subtitle={[theme.author, theme.version ? `v${theme.version}` : ""].filter((part) => part !== "").join(" · ")}
        onClose={onClose}
      />
      <ModalBody className="gap-4">
        {preview ? (
          <div className="flex flex-col gap-2">
            <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-(--border-strong) bg-(--bg-input)">
              <img src={toDisplaySrc(preview)} alt="" className="h-full w-full object-contain" />
            </div>
            {theme.previews.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {theme.previews.map((file, index) => (
                  <button
                    key={file}
                    className={`h-14 w-24 shrink-0 overflow-hidden rounded-lg border cursor-pointer ${
                      index === selected ? "border-(--primary)" : "border-(--border-strong) opacity-70 hover:opacity-100"
                    }`}
                    onClick={() => setSelected(index)}
                  >
                    <img src={toDisplaySrc(file)} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-(--border-strong) text-(--muted-2)">
            <i className="fa-solid fa-image text-[20px]" />
            <span className="text-[11px]">{t("launcher.settings.appearance.noPreviews")}</span>
          </div>
        )}

        {theme.description ? <p className="text-[12.5px] leading-relaxed text-(--text-soft)">{theme.description}</p> : null}

        <div className="grid grid-cols-2 gap-3 text-[11.5px]">
          <div className="flex flex-col gap-0.5">
            <span className="field-label">{t("launcher.settings.appearance.details.author")}</span>
            <span className="text-(--text-soft)">{theme.author || "—"}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="field-label">{t("launcher.settings.appearance.details.version")}</span>
            <span className="text-(--text-soft)">{theme.version || "—"}</span>
          </div>
          <div className="col-span-2 flex flex-col gap-0.5">
            <span className="field-label">{t("launcher.settings.appearance.details.requires")}</span>
            <span className={theme.compatible ? "text-(--text-soft)" : "text-(--danger)"}>
              {theme.requires ? `ZForge ${theme.requires}` : t("launcher.settings.appearance.details.anyVersion")}
              {theme.compatible ? "" : ` · ${t("launcher.settings.appearance.incompatible")}`}
            </span>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <button className="ghost-btn rounded-lg px-4 py-2 text-[13px] cursor-pointer" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          className="play-btn rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40 cursor-pointer"
          onClick={onUse}
          disabled={active || busy || !theme.compatible || theme.error !== null}
        >
          {active ? t("launcher.settings.appearance.active") : t("launcher.settings.appearance.use")}
        </button>
      </ModalFooter>
    </Modal>
  );
}
