export interface SettingsSchema {
  id: string;
  game: string;
  expansion: string;
  version: string;
  categories: SettingsCategory[];
}

export interface SettingsCategory {
  id: string;
  label: string;
  icon: string;
  settings: SettingControl[];
}

export type SettingControl = SliderSetting | SelectSetting | CheckboxSetting | TextSetting | ComboboxSetting;

interface BaseSetting {
  key: string;
  label: string;
  description?: string;
  default: unknown;
  wtf: { key: string; type: string; present?: string; absentMeans?: unknown; invert?: boolean } | null;
  visibleWhen?: { field: string; equals: unknown };
}

export interface SliderSetting extends BaseSetting {
  type: "slider";
  min?: number;
  max?: number;
  step?: number;
  options?: number[];
}

export interface SelectSetting extends BaseSetting {
  type: "select";
  options: { value: string; label: string }[] | number[] | string[];
}

export interface CheckboxSetting extends BaseSetting {
  type: "checkbox";
}

export interface TextSetting extends BaseSetting {
  type: "text";
  placeholder?: string;
}

export interface ComboboxSetting extends BaseSetting {
  type: "combobox";
  source?: string;
  placeholder?: string;
}