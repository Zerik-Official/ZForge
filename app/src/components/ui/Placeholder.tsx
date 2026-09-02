import { t, useLocale } from "@/locales/i18n";

interface PlaceholderProps {
  title: string;
}

export function Placeholder({ title }: PlaceholderProps) {
  useLocale();
  return (
    <div className="flex h-full w-full items-center justify-center bg-(--bg) text-(--muted)">
      <span className="text-lg">
        {title}
        {t("common.comingSoon")}
      </span>
    </div>
  );
}
