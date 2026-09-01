import { SettingSlider } from "./controls/SettingSlider";
import { SettingSelect } from "./controls/SettingSelect";
import { SettingCheckbox } from "./controls/SettingCheckbox";
import { SettingText } from "./controls/SettingText";
import { SettingCombobox } from "./controls/SettingCombobox";
import type { SettingControl } from "@/types/domains/schema";
import type { ComboboxOption } from "@/components/ui/Combobox";

interface SettingsRendererProps {
  setting: SettingControl;
  value: unknown;
  onChange: (value: unknown) => void;
  allValues: Record<string, unknown>;
  sources?: Record<string, ComboboxOption[]>;
  extraOptions?: Record<string, import("@/components/ui/Select").SelectOption[]>;
}

export function SettingsRenderer({ setting, value, onChange, allValues, sources, extraOptions }: SettingsRendererProps) {
  if (setting.visibleWhen) {
    const current = allValues[setting.visibleWhen.field];
    if (current !== setting.visibleWhen.equals) return null;
  }

  switch (setting.type) {
    case "slider":
      return <SettingSlider setting={setting} value={value as number} onChange={onChange as (v: number) => void} />;
    case "select":
      return (
        <SettingSelect
          setting={setting}
          value={String(value ?? "")}
          onChange={onChange as (v: string) => void}
          options={extraOptions?.[setting.key]}
        />
      );
    case "checkbox":
      return <SettingCheckbox setting={setting} checked={Boolean(value)} onChange={onChange as (v: boolean) => void} />;
    case "text":
      return <SettingText setting={setting} value={String(value ?? "")} onChange={onChange as (v: string) => void} />;
    case "combobox":
      return (
        <SettingCombobox
          setting={setting}
          value={String(value ?? "")}
          onChange={onChange as (v: string) => void}
          options={sources?.[setting.source ?? ""] ?? []}
        />
      );
    default:
      return null;
  }
}
