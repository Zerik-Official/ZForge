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
  const isVisible = !setting.visibleWhen || allValues[setting.visibleWhen.field] === setting.visibleWhen.equals;
  if (!isVisible) return null;
  const enabledWhen = (setting as unknown as { enabledWhen?: { field: string; equals: unknown } }).enabledWhen;
  const disabled = enabledWhen ? allValues[enabledWhen.field] !== enabledWhen.equals : false;

  switch (setting.type) {
    case "slider":
      return <SettingSlider setting={setting} value={value as number} onChange={onChange as (v: number) => void} disabled={disabled} />;
    case "select":
      return (
        <SettingSelect
          setting={setting}
          value={String(value ?? "")}
          onChange={onChange as (v: string) => void}
          options={extraOptions?.[setting.key] ?? (setting as unknown as { options?: unknown[] }).options as unknown as import("@/components/ui/Select").SelectOption[] | undefined}
          disabled={disabled}
        />
      );
    case "checkbox":
      return <SettingCheckbox setting={setting} checked={Boolean(value)} onChange={onChange as (v: boolean) => void} disabled={disabled} />;
    case "text":
      return <SettingText setting={setting} value={String(value ?? "")} onChange={onChange as (v: string) => void} disabled={disabled} />;
    case "combobox":
      return (
        <SettingCombobox
          setting={setting}
          value={String(value ?? "")}
          onChange={onChange as (v: string) => void}
          options={sources?.[setting.source ?? ""] ?? []}
          disabled={disabled}
        />
      );
    default:
      return null;
  }
}
