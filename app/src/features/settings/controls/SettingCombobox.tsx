import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { t, useLocale } from "@/locales/i18n";
import type { ComboboxSetting } from "@/types/domains/schema";

interface SettingComboboxProps {
  setting: ComboboxSetting;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (option: ComboboxOption) => void;
  options: ComboboxOption[];
  disabled?: boolean;
}

export function SettingCombobox({ setting, value, onChange, onSelect, options, disabled }: SettingComboboxProps) {
  useLocale();
  return (
    <div className={`flex flex-col gap-1.5 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <label className="field-label">{t(setting.label)}</label>
      <Combobox value={value} onChange={onChange} onSelect={onSelect} options={options} placeholder={setting.placeholder ? t(setting.placeholder) : undefined} />
    </div>
  );
}
