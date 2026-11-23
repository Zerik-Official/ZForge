import { useEffect, useRef, useState } from "react";
import type { ComboboxOption } from "@/components/ui/Combobox";
import type { SelectOption } from "@/components/ui/Select";
import { t, useLocale } from "@/locales/i18n";
import type { SettingControl } from "@/types/domains/schema";
import type { ThemeFrame, ThemeLayout } from "@/types/domains/theme";
import { frameStyle } from "@/utils/theme";
import { SettingsRenderer } from "./SettingsRenderer";

/** Largest zoom applied to a layout narrower than the modal. */
const MAX_SCALE = 1.5;

interface ThemedLayoutProps {
  layout: ThemeLayout;
  /** Every setting of the schema by key. */
  settings: Record<string, SettingControl>;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** Frame drawn around framed sections; a plain box without one. */
  panel: ThemeFrame | null;
  sources?: Record<string, ComboboxOption[]>;
  extraOptions?: Record<string, SelectOption[]>;
}

/**
 * A settings category laid out by the active theme: sections and controls at
 * fixed positions on a canvas that scales to the available width.
 */
export function ThemedLayout({ layout, settings, values, onChange, panel, sources, extraOptions }: ThemedLayoutProps) {
  useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(Math.min(MAX_SCALE, entry.contentRect.width / layout.width));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [layout.width]);

  return (
    <div ref={containerRef} className="w-full" style={{ height: layout.height * scale }}>
      <div
        className="relative"
        style={{ width: layout.width, height: layout.height, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        {layout.sections.map((section, index) => (
          <div
            key={`${section.title ?? "section"}-${index}`}
            className={`absolute ${section.framed && !panel ? "rounded-(--radius) border border-(--border-strong) bg-(--bg-input)" : ""}`}
            style={{
              left: section.x,
              top: section.y,
              width: section.width,
              height: section.height,
              ...(section.framed && panel ? frameStyle(panel) : {}),
            }}
          >
            {section.title ? (
              <span className="section-label absolute left-3 top-2">{t(section.title)}</span>
            ) : null}
            {section.controls.map((control) => {
              const setting = settings[control.setting];
              if (!setting) return null;
              return (
                <div key={control.setting} className="absolute" style={{ left: control.x, top: control.y, width: control.width }}>
                  <SettingsRenderer
                    setting={setting}
                    value={values[control.setting]}
                    allValues={values}
                    onChange={(value) => onChange(control.setting, value)}
                    sources={sources}
                    extraOptions={extraOptions}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
