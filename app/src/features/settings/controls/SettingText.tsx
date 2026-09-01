import { t } from "@/locales/i18n";
import type { TextSetting } from "@/types/domains/schema";

interface SettingTextProps {
  setting: TextSetting;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function SettingText({ setting, value, onChange, disabled }: SettingTextProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <label className="field-label">{t(setting.label)}</label>
      <input
        className="field-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={setting.placeholder ? t(setting.placeholder) : undefined}
        disabled={disabled}
      />
    </div>
  );
}