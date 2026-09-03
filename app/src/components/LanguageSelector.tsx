import { useState } from "react";
import { ES, US } from "country-flag-icons/react/3x2";
import type { Locale } from "@/locales/i18n";

/**
 * Props for {@link LanguageSelector}.
 */
interface LanguageSelectorProps {
  /** Called when the user picks a language. Should persist the choice. */
  onSelect: (locale: Locale) => Promise<void> | void;
}

type LanguageOption = {
  locale: Locale;
  label: string;
  nativeLabel: string;
  Flag: React.ComponentType<{ title?: string; className?: string }>;
};

/**
 * Full-screen language picker shown when `AppConfig.language` is `null`.
 *
 * Displays two large flag buttons (ES / EN). The component is intentionally
 * bilingual and does not depend on the current `t()` locale, so it can be
 * shown before a locale is chosen.
 */
export function LanguageSelector({ onSelect }: LanguageSelectorProps) {
  const [pending, setPending] = useState<Locale | null>(null);

  const options: LanguageOption[] = [
    { locale: "es", label: "Español", nativeLabel: "Spanish · ES", Flag: ES },
    { locale: "en", label: "English", nativeLabel: "English · EN", Flag: US },
  ];

  async function handlePick(locale: Locale) {
    if (pending) return;
    setPending(locale);
    try {
      await onSelect(locale);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-(--bg) px-6">
      <img
        src="/assets/app/logo.svg"
        alt="ZForge"
        draggable={false}
        className="mb-8 h-16 w-16 select-none"
      />

      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-[20px] font-semibold text-(--text)">Choose your language</h1>
        <p className="mt-1 text-[13px] text-(--muted)">Select a language to continue</p>
      </div>

      <div className="mt-8 flex gap-4">
        {options.map((opt) => {
          const isPending = pending === opt.locale;
          const isBusy = pending !== null;
          return (
            <button
              key={opt.locale}
              disabled={isBusy}
              onClick={() => handlePick(opt.locale)}
              className={`group flex w-42 flex-col items-center gap-3 rounded-2xl border bg-(--bg-card) px-6 py-7 transition-all duration-200 cursor-pointer
                ${pending === opt.locale ? "border-(--primary) bg-(--primary-dim) scale-[0.98]" : "border-(--border-strong) hover:border-(--primary) hover:bg-(--bg-elevated) hover:-translate-y-1 hover:shadow-[0_10px_30px_rgba(0,0,0,0.35)]"}
                ${isBusy && !isPending ? "opacity-60 cursor-not-allowed" : ""}
              `}
            >
              <span className="flex h-12 w-18 items-center justify-center overflow-hidden rounded-lg bg-(--bg-elevated) shadow-inner ring-1 ring-(--border-strong) transition-transform duration-200 group-hover:scale-110">
                <opt.Flag title={opt.label} className="h-full w-full object-cover" />
              </span>
              <span className="flex flex-col items-center">
                <span className="text-[15px] font-semibold text-(--text)">{opt.label}</span>
                <span className="text-[11px] tracking-wide text-(--muted)">{opt.nativeLabel}</span>
              </span>
              {isPending && <i className="fa-solid fa-spinner fa-spin text-[12px] text-(--primary)" />}
            </button>
          );
        })}
      </div>

      <p className="mt-8 text-[11px] text-(--muted-2)">You can change this later in Settings</p>
    </div>
  );
}