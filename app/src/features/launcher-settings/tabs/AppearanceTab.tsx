import { PageState } from "@/components/layout/PageState";
import { SettingsGroup, SettingsPage } from "@/components/layout/SettingsPage";
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { t, useLocale } from "@/locales/i18n";
import { api, errorCode, isApiError, themesApi } from "@/services/api";
import { useThemeStore } from "@/store/themeStore";
import { BUILT_IN_THEME, type ThemeError, type ThemeSummary } from "@/types/domains/theme";
import { toDisplaySrc } from "@/utils/asset";
import { ThemeDetailsModal } from "../components/ThemeDetailsModal";

/** Translated explanation of a theme problem. */
function problemText(error: ThemeError): string {
  return t(`launcher.settings.appearance.problems.${error.problem}`, { detail: error.detail });
}

/** Message of a failed theme command, with the theme problem when there is one. */
function commandError(error: unknown): string {
  if (isApiError(error) && error.code === "theme_invalid" && error.details) {
    return problemText(error.details as ThemeError);
  }
  return t(`common.errors.codes.${errorCode(error)}`);
}

/**
 * Appearance tab: pick the active theme, import theme zips and manage the
 * themes folder.
 */
export function AppearanceTab() {
  useLocale();
  const loadTheme = useThemeStore((state) => state.load);
  const [themes, setThemes] = useState<ThemeSummary[] | null>(null);
  const [activeId, setActiveId] = useState<string>(BUILT_IN_THEME);
  const [deleting, setDeleting] = useState<ThemeSummary | null>(null);
  const [viewing, setViewing] = useState<ThemeSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, config] = await Promise.all([themesApi.listThemes(), api.getAppConfig()]);
      setThemes(list);
      setActiveId(config.theme || BUILT_IN_THEME);
    } catch (e) {
      setError(t(`common.errors.codes.${errorCode(e)}`));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([themesApi.listThemes(), api.getAppConfig()])
      .then(([list, config]) => {
        if (cancelled) return;
        setThemes(list);
        setActiveId(config.theme || BUILT_IN_THEME);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(t(`common.errors.codes.${errorCode(e)}`));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function activate(id: string) {
    if (busy || id === activeId) return;
    setBusy(true);
    try {
      await api.saveAppConfig({ theme: id });
      setActiveId(id);
      await loadTheme();
      setError(null);
    } catch (e) {
      setError(t(`common.errors.codes.${errorCode(e)}`));
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    setBusy(true);
    try {
      const imported = await themesApi.importTheme();
      await refresh();
      if (imported && imported.id === activeId) await loadTheme();
      setError(null);
    } catch (e) {
      setError(commandError(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    const theme = deleting;
    setDeleting(null);
    if (!theme) return;
    try {
      if (theme.id === activeId) {
        await api.saveAppConfig({ theme: BUILT_IN_THEME });
        await loadTheme();
      }
      await themesApi.deleteTheme(theme.id);
      await refresh();
      setError(null);
    } catch (e) {
      setError(t(`common.errors.codes.${errorCode(e)}`));
    }
  }

  async function openFolder() {
    try {
      await themesApi.openThemesFolder();
    } catch (e) {
      setError(t(`common.errors.codes.${errorCode(e)}`));
    }
  }

  if (!themes) {
    return <PageState error={error} />;
  }

  const builtIn: ThemeSummary = {
    id: BUILT_IN_THEME,
    name: t("launcher.settings.appearance.builtIn.name"),
    author: "ZForge",
    version: "",
    description: t("launcher.settings.appearance.builtIn.description"),
    icon: null,
    previews: [],
    requires: null,
    compatible: true,
    error: null,
  };

  return (
    <SettingsPage
      title={t("launcher.settings.appearance.title")}
      description={t("launcher.settings.appearance.description")}
      actions={
        <>
          <button
            className="ghost-btn flex items-center gap-2 rounded-[7px] px-3 py-2 text-[13px] font-medium cursor-pointer"
            onClick={() => void openFolder()}
          >
            <i className="fa-solid fa-folder-open text-[12px]" />
            {t("launcher.settings.appearance.openFolder")}
          </button>
          <button
            className="play-btn flex items-center gap-2 rounded-[7px] px-4 py-2 text-[13px] font-semibold disabled:opacity-50 cursor-pointer"
            onClick={() => void handleImport()}
            disabled={busy}
          >
            <i className="fa-solid fa-file-zipper text-[11px]" />
            {t("launcher.settings.appearance.import")}
          </button>
        </>
      }
    >
      <SettingsGroup>
        {[builtIn, ...themes].map((theme) => {
          const active = theme.id === activeId;
          const valid = theme.error === null;
          const usable = valid && theme.compatible;
          const detail = theme.description.trim() || theme.author.trim();
          return (
            <div key={theme.id} className={`relative flex items-center gap-3.5 px-4.5 py-3.25 ${active ? "bg-(--primary-soft)" : ""}`}>
              {active ? <span className="absolute inset-y-0 left-0 w-0.5 bg-(--primary)" /> : null}
              {theme.icon ? (
                <img src={toDisplaySrc(theme.icon)} alt="" className="h-9 w-9 shrink-0 rounded-[7px] object-cover" />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] bg-(--bg-elevated)">
                  <i className={`fa-solid ${theme.id === BUILT_IN_THEME ? "fa-moon" : "fa-palette"} text-[13px] text-(--muted)`} />
                </span>
              )}
              <button
                className={`flex min-w-0 flex-1 flex-col gap-0.75 text-left ${valid && theme.id !== BUILT_IN_THEME ? "cursor-pointer" : "cursor-default"}`}
                onClick={() => {
                  if (valid && theme.id !== BUILT_IN_THEME) setViewing(theme);
                }}
              >
                <span className="truncate text-[13.5px] font-[550] text-(--text)">
                  {theme.name}
                  {theme.version ? <span className="ml-2 text-[12px] font-normal text-(--muted-2)">v{theme.version}</span> : null}
                </span>
                {theme.error ? (
                  <span className="text-[12.5px] leading-snug text-(--danger)">{problemText(theme.error)}</span>
                ) : !theme.compatible ? (
                  <span className="truncate text-[12.5px] text-(--danger)">
                    {t("launcher.settings.appearance.requiresLauncher", { requires: theme.requires ?? "" })}
                  </span>
                ) : detail ? (
                  <span className="truncate text-[12.5px] text-(--muted)">{detail}</span>
                ) : null}
              </button>
              {active ? (
                <span className="rounded-md bg-(--primary-dim) px-2 py-0.5 text-[11.5px] font-semibold text-(--primary)">
                  {t("launcher.settings.appearance.active")}
                </span>
              ) : usable ? (
                <button
                  className="ghost-btn rounded-[7px] px-3 py-1.5 text-[12.5px] disabled:opacity-50 cursor-pointer"
                  onClick={() => void activate(theme.id)}
                  disabled={busy}
                >
                  {t("launcher.settings.appearance.use")}
                </button>
              ) : null}
              {theme.id === BUILT_IN_THEME ? null : (
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-[7px] text-(--muted) transition-colors hover:bg-(--bg-hover) hover:text-(--danger) cursor-pointer"
                  onClick={() => setDeleting(theme)}
                  aria-label={t("common.delete")}
                >
                  <i className="fa-solid fa-trash text-[11px]" />
                </button>
              )}
            </div>
          );
        })}
      </SettingsGroup>

      <p className="max-w-[72ch] text-[12.5px] leading-relaxed text-(--muted)">{t("launcher.settings.appearance.help")}</p>
      {error ? <span className="text-[12.5px] text-(--danger)">{error}</span> : null}

      {viewing ? (
        <ThemeDetailsModal
          theme={viewing}
          active={viewing.id === activeId}
          busy={busy}
          onUse={() => {
            void activate(viewing.id);
            setViewing(null);
          }}
          onClose={() => setViewing(null)}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        icon="fa-solid fa-trash"
        destructive
        title={t("launcher.settings.appearance.confirmDelete")}
        description={t("launcher.settings.appearance.confirmDeleteDescription", { name: deleting?.name ?? "" })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </SettingsPage>
  );
}
