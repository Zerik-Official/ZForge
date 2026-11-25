import { useEffect, useMemo, useState } from "react";
import { Notice } from "@/components/layout/Notice";
import { PageState } from "@/components/layout/PageState";
import { SettingsGroup, SettingsPage, SettingsRow } from "@/components/layout/SettingsPage";
import { SdkRequirement } from "@/components/sdk/SdkRequirement";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select, type SelectOption } from "@/components/ui/Select";
import { TooltipSimple } from "@/components/ui/Tooltip";
import { useAccounts } from "@/hooks/useAccounts";
import { featureStatus, useCapabilities } from "@/hooks/useCapabilities";
import { useSession } from "@/hooks/useSession";
import { t, useLocale } from "@/locales/i18n";
import { api, errorCode, presenceApi } from "@/services/api";
import { useGamesStore } from "@/store/gamesStore";
import type { PresenceActivity, PresenceSample, PresenceScene } from "@/types/domains/presence";
import type { SdkStatus } from "@/types/domains/sdk";
import type { LocationPrivacy, PresenceOptions } from "@/types/domains/settings";
import { toDisplaySrc } from "@/utils/asset";
import { PresencePreview } from "../components/PresencePreview";

const DEFAULT_OPTIONS: PresenceOptions = {
  show_name: true,
  show_level: true,
  show_xp: true,
  show_class: true,
  location: "exact",
  show_status: true,
  show_group: true,
  show_elapsed: true,
};

const LOCATIONS: LocationPrivacy[] = ["exact", "zone", "random", "hidden"];

/** Switches of what the presence reveals, in the order they are listed. */
const SWITCHES = ["show_name", "show_level", "show_xp", "show_class", "show_status", "show_group", "show_elapsed"] as const;

/** Moments of a session the preview plays in order. */
const SCENES: PresenceScene[] = [
  "launching",
  "login",
  "realm_list",
  "character_select",
  "character_create",
  "loading",
  "world",
  "party",
  "raid",
  "dungeon",
  "combat",
  "afk",
  "dead",
];

const sceneButton =
  "flex h-7 w-7 items-center justify-center rounded-md border border-(--border-strong) bg-(--bg-elevated) text-[10px] text-(--muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text) cursor-pointer";

/** Time each scene stays on screen while the sequence plays. */
const SCENE_MS = 3500;

/**
 * Rich Presence settings tab. The SDK itself is managed in the SDK tab; this
 * tab only shows what Rich Presence needs from it.
 */
export function RichPresenceTab() {
  useLocale();
  const capabilities = useCapabilities();
  const session = useSession();
  const { accounts } = useAccounts();
  const games = useGamesStore((state) => state.games);
  const activeId = useGamesStore((state) => state.activeId);
  const storedOptions = useGamesStore((state) => state.config?.presence);
  const saveConfig = useGamesStore((state) => state.saveConfig);
  const [options, setOptions] = useState<PresenceOptions>(storedOptions ?? DEFAULT_OPTIONS);
  const [preview, setPreview] = useState<PresenceActivity | null>(null);
  const [assets, setAssets] = useState<Record<string, string>>({});
  const live = session !== null && session.phase !== "idle";
  const [pickedScene, setPickedScene] = useState<PresenceScene | null>(null);
  const [playing, setPlaying] = useState(true);
  const scene: PresenceScene = pickedScene ?? (live ? "live" : "launching");
  const scenes: PresenceScene[] = live ? ["live", ...SCENES] : SCENES;

  useEffect(() => {
    if (!playing || scene === "live") return;
    const timer = window.setTimeout(() => {
      const index = SCENES.indexOf(scene);
      setPickedScene(SCENES[(index + 1) % SCENES.length]);
    }, SCENE_MS);
    return () => window.clearTimeout(timer);
  }, [playing, scene]);

  function step(offset: number) {
    const index = scenes.indexOf(scene);
    setPickedScene(scenes[(index + offset + scenes.length) % scenes.length]);
    setPlaying(false);
  }
  const [status, setStatus] = useState<SdkStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getSdkStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(t(`common.errors.codes.${errorCode(e)}`));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const game = games.find((entry) => entry.id === activeId) ?? games[0] ?? null;

  const sample = useMemo<PresenceSample>(() => {
    const account = [...(accounts ?? [])].sort((a, b) => {
      const latest = (list: typeof a.characters) => Math.max(0, ...list.map((character) => character.updated_at));
      return latest(b.characters) - latest(a.characters);
    })[0];
    const realm = account?.default_realm || account?.characters[0]?.realm || null;
    return {
      name: "Zerik",
      level: 79,
      raceId: 11,
      classId: 7,
      zone: t("launcher.settings.richPresence.preview.places.stormwind"),
      subZone: t("launcher.settings.richPresence.preview.places.tradeDistrict"),
      mapId: 0,
      mapAreaId: 302,
      dungeon: t("launcher.settings.richPresence.preview.places.hallsOfStone"),
      raid: t("launcher.settings.richPresence.preview.places.icecrownCitadel"),
      expansion: game?.expansion ?? "wotlk",
      realmlist: account?.realmlist ?? null,
      realm,
    };
  }, [accounts, game]);

  useEffect(() => {
    let cancelled = false;
    presenceApi
      .previewPresence(options, scene, sample)
      .then((activity) => {
        if (!cancelled) setPreview(activity);
      })
      .catch((e: unknown) => console.error("Could not build the Rich Presence preview", e));
    return () => {
      cancelled = true;
    };
  }, [options, scene, sample, session]);

  useEffect(() => {
    let cancelled = false;
    presenceApi
      .getPresenceAssets()
      .then((urls) => {
        if (!cancelled) setAssets(urls);
      })
      .catch(() => {
        // Without Discord the preview uses the images bundled with the launcher.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveOptions(next: PresenceOptions) {
    const previous = options;
    setOptions(next);
    try {
      await saveConfig({ presence: next });
      setError(null);
    } catch (e) {
      setOptions(previous);
      setError(t(`common.errors.codes.${errorCode(e)}`));
    }
  }

  const locationOptions: SelectOption[] = LOCATIONS.map((location) => ({
    value: location,
    label: t(`launcher.settings.richPresence.location.${location}`),
  }));

  async function handleToggleDiscord(value: boolean) {
    try {
      await api.saveAppConfig({ discord_enabled: value });
      setStatus((prev) => (prev ? { ...prev, discord_enabled: value } : prev));
      setError(null);
    } catch (e) {
      setError(t(`common.errors.codes.${errorCode(e)}`));
    }
  }

  if (!status) {
    return <PageState error={error} />;
  }

  return (
    <SettingsPage title={t("launcher.settings.richPresence.title")} description={t("launcher.settings.richPresence.description")}>
      {status.application_id_configured ? null : (
        <Notice
          tone="warning"
          icon="fa-solid fa-circle-info"
          title={t("launcher.settings.richPresence.applicationIdMissing.title")}
          description={t("launcher.settings.richPresence.applicationIdMissing.description")}
        />
      )}

      <SdkRequirement status={featureStatus(capabilities, "live_session")} />

      <SettingsGroup>
        <Checkbox
          layout="row"
          checked={status.discord_enabled}
          onChange={(value) => void handleToggleDiscord(value)}
          label={t("launcher.settings.richPresence.settings.enableDiscord")}
          description={t("launcher.settings.richPresence.settings.enableDiscordDescription")}
          disabled={!status.application_id_configured}
        />
      </SettingsGroup>

      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-4 px-0.5">
          <h2 className="text-[14px] font-semibold text-(--text-soft)">{t("launcher.settings.richPresence.preview.title")}</h2>
          <span className="text-[12px] text-(--muted-2)">
            {scene === "live" ? t("launcher.settings.richPresence.preview.live") : t("launcher.settings.richPresence.preview.sample")}
          </span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_17rem] gap-4 rounded-(--radius) border border-(--border) bg-(--bg-card) p-4">
          <div className="flex flex-col justify-center rounded-[10px] bg-[#111214] p-3">
            <PresencePreview
              activity={preview}
              assets={assets}
              fallbackImage={toDisplaySrc(game?.icon || "")}
              gameName={t("launcher.settings.richPresence.preview.gameName")}
            />
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-1.5">
              <TooltipSimple content={t("launcher.settings.richPresence.preview.previous")} side="top">
                <button className={sceneButton} onClick={() => step(-1)} aria-label={t("launcher.settings.richPresence.preview.previous")}>
                  <i className="fa-solid fa-backward-step" />
                </button>
              </TooltipSimple>
              <TooltipSimple
                content={playing ? t("launcher.settings.richPresence.preview.pause") : t("launcher.settings.richPresence.preview.play")}
                side="top"
              >
                <button
                  className={sceneButton}
                  onClick={() => {
                    if (scene === "live") setPickedScene("launching");
                    setPlaying((value) => !value);
                  }}
                  aria-label={playing ? t("launcher.settings.richPresence.preview.pause") : t("launcher.settings.richPresence.preview.play")}
                >
                  <i className={`fa-solid ${playing && scene !== "live" ? "fa-pause" : "fa-play"}`} />
                </button>
              </TooltipSimple>
              <TooltipSimple content={t("launcher.settings.richPresence.preview.next")} side="top">
                <button className={sceneButton} onClick={() => step(1)} aria-label={t("launcher.settings.richPresence.preview.next")}>
                  <i className="fa-solid fa-forward-step" />
                </button>
              </TooltipSimple>
              <span className="ml-auto truncate text-[12px] font-medium text-(--text-soft)">
                {t(`launcher.settings.richPresence.preview.scenes.${scene}`)}
              </span>
            </div>
            <div role="radiogroup" aria-label={t("launcher.settings.richPresence.preview.title")} className="grid grid-cols-2 gap-1">
              {scenes.map((entry) => (
                <button
                  key={entry}
                  role="radio"
                  aria-checked={entry === scene}
                  onClick={() => {
                    setPickedScene(entry);
                    setPlaying(false);
                  }}
                  className={`truncate rounded-md px-2 py-1 text-left text-[11.5px] transition-colors cursor-pointer ${
                    entry === scene ? "bg-(--bg-hover) text-(--text)" : "text-(--muted) hover:bg-(--bg-elevated) hover:text-(--text-soft)"
                  }`}
                >
                  {entry === "live" ? <i className="fa-solid fa-circle mr-1.5 text-[6px] text-(--success)" /> : null}
                  {t(`launcher.settings.richPresence.preview.scenes.${entry}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <SettingsGroup title={t("launcher.settings.richPresence.privacy.title")}>
        <SettingsRow
          label={t("launcher.settings.richPresence.privacy.location")}
          description={t(`launcher.settings.richPresence.location.${options.location}Description`)}
          control={
            <div className="w-52">
              <Select
                value={options.location}
                options={locationOptions}
                onChange={(value) => void saveOptions({ ...options, location: value as LocationPrivacy })}
              />
            </div>
          }
        />
        {SWITCHES.map((key) => (
          <Checkbox
            key={key}
            layout="row"
            checked={options[key]}
            onChange={(value) => void saveOptions({ ...options, [key]: value })}
            label={t(`launcher.settings.richPresence.privacy.${key}`)}
            description={t(`launcher.settings.richPresence.privacy.${key}Description`)}
            disabled={key === "show_xp" && !options.show_level}
          />
        ))}
      </SettingsGroup>

      {error ? <span className="text-[12.5px] text-(--danger)">{error}</span> : null}
    </SettingsPage>
  );
}
