import { useEffect, useMemo, useState } from "react";
import { Notice } from "@/components/layout/Notice";
import { PageState } from "@/components/layout/PageState";
import { SettingsGroup, SettingsPage, SettingsRow } from "@/components/layout/SettingsPage";
import { SdkRequirement } from "@/components/sdk/SdkRequirement";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select, type SelectOption } from "@/components/ui/Select";
import { useAccounts } from "@/hooks/useAccounts";
import { featureStatus, useCapabilities } from "@/hooks/useCapabilities";
import { useSession } from "@/hooks/useSession";
import { t, useLocale } from "@/locales/i18n";
import { api, errorCode, presenceApi } from "@/services/api";
import { useGamesStore } from "@/store/gamesStore";
import type { PresenceActivity, PresenceSample } from "@/types/domains/presence";
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

/** Place the preview uses for each expansion while no character is in the world. */
const SAMPLE_PLACES: Record<string, { mapId: number; mapAreaId: number; zone: string; subZone: string }> = {
  classic: { mapId: 0, mapAreaId: 302, zone: "stormwind", subZone: "tradeDistrict" },
  tbc: { mapId: 530, mapAreaId: 481, zone: "shattrath", subZone: "terraceOfLight" },
  wotlk: { mapId: 571, mapAreaId: 505, zone: "dalaran", subZone: "violetCitadel" },
};

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
    const expansion = game?.expansion ?? "wotlk";
    const place = SAMPLE_PLACES[expansion] ?? SAMPLE_PLACES.wotlk;
    const latest = (accounts ?? [])
      .flatMap((account) => account.characters)
      .sort((a, b) => b.updated_at - a.updated_at)[0];
    return {
      name: latest?.name ?? t("launcher.settings.richPresence.preview.sampleName"),
      level: latest?.level ?? 80,
      raceId: latest?.race_id ?? 10,
      classId: latest?.class_id ?? 4,
      zone: t(`launcher.settings.richPresence.preview.places.${place.zone}`),
      subZone: t(`launcher.settings.richPresence.preview.places.${place.subZone}`),
      mapId: place.mapId,
      mapAreaId: place.mapAreaId,
      expansion,
    };
  }, [accounts, game]);

  useEffect(() => {
    let cancelled = false;
    presenceApi
      .previewPresence(options, sample)
      .then((activity) => {
        if (!cancelled) setPreview(activity);
      })
      .catch((e: unknown) => console.error("Could not build the Rich Presence preview", e));
    return () => {
      cancelled = true;
    };
  }, [options, sample, session]);

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
            {session?.phase === "in_world"
              ? t("launcher.settings.richPresence.preview.live")
              : t("launcher.settings.richPresence.preview.sample")}
          </span>
        </div>
        <PresencePreview
          activity={preview}
          assets={assets}
          fallbackImage={toDisplaySrc(game?.box || game?.icon || "")}
          gameName={t("launcher.settings.richPresence.preview.gameName")}
        />
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
