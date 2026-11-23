import { t, useLocale } from "@/locales/i18n";
import type { ConfigConflict } from "@/types/domains/settings";
import type { ConflictChoice } from "@/hooks/useConfigConflict";

interface ConfigConflictModalProps {
  conflict: ConfigConflict;
  onResolve: (choice: ConflictChoice) => void;
}

export function ConfigConflictModal({ conflict, onResolve }: ConfigConflictModalProps) {
  useLocale();
  const applyFirst = conflict.recommended === "db";

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/65 p-6 animate-[fadeIn_0.16s_ease_both]">
      <div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-(--radius-lg) border border-(--border-strong) bg-(--bg-card) p-6 shadow-(--shadow-lg) animate-[popIn_0.18s_ease-out_both]">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[7px] bg-(--warning)/12">
            <i className="fa-solid fa-triangle-exclamation text-[14px] text-(--warning)" />
          </div>
          <h2 className="text-[17px] leading-tight font-[650] text-(--text)">{t("common.configConflict.title")}</h2>
        </div>

        <p className="text-[13px] leading-relaxed text-(--text-soft)">
          {t("common.configConflict.description")
            .replace("{name}", conflict.name)
            .replace("{expansion}", conflict.expansion)}
        </p>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            className={`ghost-btn rounded-[7px] px-4 py-2 text-[13px] cursor-pointer ${applyFirst ? "" : "ring-1 ring-(--primary)"}`}
            onClick={() => onResolve("pull")}
          >
            {t("common.configConflict.useGame")}
          </button>
          <button
            className="play-btn rounded-[7px] px-4 py-2 text-[13px] font-semibold cursor-pointer"
            onClick={() => onResolve("apply")}
          >
            {t("common.configConflict.useSaved")}
          </button>
        </div>
      </div>
    </div>
  );
}
