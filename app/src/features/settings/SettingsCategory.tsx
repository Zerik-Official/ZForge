import { SettingsRenderer } from "./SettingsRenderer";
import { t } from "@/locales/i18n";
import type { SettingsCategory as Category } from "@/types/domains/schema";

interface SettingsCategoryProps {
  category: Category;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  sources?: Record<string, import("@/components/ui/Combobox").ComboboxOption[]>;
  extraOptions?: Record<string, import("@/components/ui/Select").SelectOption[]>;
}

export function SettingsCategory({ category, values, onChange, sources, extraOptions }: SettingsCategoryProps) {
  const checkboxes = category.settings.filter((setting) => setting.type === "checkbox");
  const others = category.settings.filter((setting) => setting.type !== "checkbox");

  function renderSetting(setting: (typeof category.settings)[number]) {
    return (
      <SettingsRenderer
        key={setting.key}
        setting={setting}
        value={values[setting.key]}
        allValues={values}
        onChange={(value) => onChange(setting.key, value)}
        sources={sources}
        extraOptions={extraOptions}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <span className="section-label">
        <i className={category.icon} /> {t(category.label)}
      </span>

      {others.length > 0 && (
        <div className="flex flex-wrap gap-5">
          {others.map((setting) => (
            <div key={setting.key} className="min-w-0 basis-full md:basis-[calc(50%-10px)]">
              {renderSetting(setting)}
            </div>
          ))}
        </div>
      )}

      {checkboxes.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {checkboxes.map((setting) => (
            <div key={setting.key} className="min-w-0 basis-full md:basis-[calc(50%-6px)]">
              {renderSetting(setting)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}