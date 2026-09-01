import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { t } from "@/locales/i18n";
import type { ComboboxSetting } from "@/types/domains/schema";

interface SettingComboboxProps {
  setting: ComboboxSetting;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (option: ComboboxOption) => void;
  options: ComboboxOption[];
}

export function SettingCombobox({ setting, value, onChange, onSelect, options }: SettingComboboxProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="field-label">{t(setting.label)}</label>
      <Combobox value={value} onChange={onChange} onSelect={onSelect} options={options} placeholder={setting.placeholder ? t(setting.placeholder) : undefined} />
    </div>
  );
}
