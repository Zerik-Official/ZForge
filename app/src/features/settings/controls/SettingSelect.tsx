import { Select, type SelectOption } from "@/components/ui/Select";
import { t } from "@/locales/i18n";
import type { SelectSetting } from "@/types/domains/schema";

interface SettingSelectProps {
  setting: SelectSetting;
  value: string;
  onChange: (value: string) => void;
  options?: SelectOption[];
}

export function SettingSelect({ setting, value, onChange, options }: SettingSelectProps) {
  const opts: SelectOption[] =
    options ??
    (Array.isArray(setting.options)
      ? (setting.options as unknown[]).map((opt) => {
          if (typeof opt === "object" && opt !== null && "value" in (opt as Record<string, unknown>)) {
            const o = opt as { value: string | number; label: string };
            return { value: String(o.value), label: t(o.label) };
          }
          return { value: String(opt), label: String(opt) };
        })
      : []);
  return (
    <div className="flex flex-col gap-1.5">
      <label className="field-label">{t(setting.label)}</label>
      <Select value={value} options={opts} onChange={onChange} />
    </div>
  );
}
