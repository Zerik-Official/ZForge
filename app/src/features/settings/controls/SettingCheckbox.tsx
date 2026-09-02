import { Checkbox } from "@/components/ui/Checkbox";
import { t, useLocale } from "@/locales/i18n";
import type { CheckboxSetting } from "@/types/domains/schema";

interface SettingCheckboxProps {
  setting: CheckboxSetting;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

export function SettingCheckbox({ setting, checked, onChange, disabled }: SettingCheckboxProps) {
  useLocale();
  return <Checkbox checked={checked} onChange={onChange} label={t(setting.label)} disabled={disabled} />;
}
