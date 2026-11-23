import { t, useLocale } from "@/locales/i18n";

interface EmptyStateProps {
  onAdd: () => void;
}

export function EmptyState({ onAdd }: EmptyStateProps) {
  useLocale();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 bg-(--bg)">
      <div className="flex h-19 w-19 items-center justify-center rounded-(--radius-lg) border border-(--border-strong) bg-(--bg-card)">
        <i className="fa-solid fa-gamepad text-2xl text-(--muted-2)" />
      </div>
      <div className="flex max-w-sm flex-col items-center gap-1.5 text-center">
        <h1 className="text-[16px] font-semibold text-(--text)">{t("launcher.home.emptyTitle")}</h1>
        <p className="text-[13px] leading-relaxed text-(--muted)">{t("launcher.home.emptyDesc")}</p>
      </div>
      <button
        className="flex items-center gap-2 rounded-lg bg-(--primary) hover:bg-(--primary-hover) px-5 py-2.5 text-[13px] font-semibold text-(--on-primary) transition-[transform,filter] duration-150 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
        onClick={onAdd}
      >
        <i className="fa-solid fa-plus text-[12px]" />
        {t("common.addGame")}
      </button>
    </div>
  );
}
