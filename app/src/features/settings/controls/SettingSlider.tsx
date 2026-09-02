import { Slider } from "@/components/ui/Slider";
import { t, useLocale } from "@/locales/i18n";
import type { SliderSetting } from "@/types/domains/schema";

interface SettingSliderProps {
  setting: SliderSetting;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function SettingSlider({ setting, value, onChange, disabled }: SettingSliderProps) {
  useLocale();
  return (
    <div className="flex flex-col gap-1.5">
      <label className="field-label">{t(setting.label)}</label>
      <Slider
        value={value}
        min={setting.min}
        max={setting.max}
        step={setting.step}
        options={setting.options}
        onChange={onChange}
        disabled={disabled}
      />
      <div className="flex justify-between text-[10px] text-(--muted)">
        <span>{t("common.low")}</span>
        <span>{t("common.high")}</span>
      </div>
    </div>
  );
}
