import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { CheckboxField, Link, ProtonPathPicker } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector } from "@renderer/hooks";
import type { ProtonVersion } from "@types";
import { LinkExternalIcon } from "@primer/octicons-react";
import { Tooltip } from "react-tooltip";

import "./settings-behavior.scss";
import "./settings-general.scss";

export function SettingsContextCompatibility() {
  const MANGOHUD_SITE_URL = "https://mangohud.com";
  const GAMEMODE_SITE_URL = "https://github.com/FeralInteractive/gamemode";

  const { t } = useTranslation("settings");
  const { t: tGameDetails } = useTranslation("game_details");
  const { updateUserPreferences } = useContext(settingsContext);

  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );

  const [protonVersions, setProtonVersions] = useState<ProtonVersion[]>([]);
  const [protonVersionsLoaded, setProtonVersionsLoaded] = useState(false);
  const [selectedDefaultProtonPath, setSelectedDefaultProtonPath] =
    useState("");

  const [autoRunMangohud, setAutoRunMangohud] = useState(false);
  const [autoRunGamemode, setAutoRunGamemode] = useState(false);
  const [gamemodeAvailable, setGamemodeAvailable] = useState(false);
  const [mangohudAvailable, setMangohudAvailable] = useState(false);

  useEffect(() => {
    if (!userPreferences) return;

    setSelectedDefaultProtonPath(userPreferences.defaultProtonPath ?? "");
    setAutoRunMangohud(userPreferences.autoRunMangohud ?? false);
    setAutoRunGamemode(userPreferences.autoRunGamemode ?? false);
  }, [userPreferences]);

  useEffect(() => {
    if (window.electron.platform !== "linux") {
      setGamemodeAvailable(false);
      setMangohudAvailable(false);
      return;
    }

    window.electron
      .isGamemodeAvailable()
      .then(setGamemodeAvailable)
      .catch(() => setGamemodeAvailable(false));

    window.electron
      .isMangohudAvailable()
      .then(setMangohudAvailable)
      .catch(() => setMangohudAvailable(false));
  }, []);

  useEffect(() => {
    if (window.electron.platform !== "linux") return;

    window.electron
      .getInstalledProtonVersions()
      .then(setProtonVersions)
      .catch(() => setProtonVersions([]))
      .finally(() => setProtonVersionsLoaded(true));
  }, []);

  useEffect(() => {
    if (!protonVersionsLoaded || !selectedDefaultProtonPath) return;

    const hasSelectedVersion = protonVersions.some(
      (version) => version.path === selectedDefaultProtonPath
    );

    if (!hasSelectedVersion) {
      setSelectedDefaultProtonPath("");
    }
  }, [protonVersions, protonVersionsLoaded, selectedDefaultProtonPath]);

  const protonVersionAutoLabel = t("proton_version_auto", {
    ns: ["settings", "game_details"],
  });

  const protonSourceUmuDefault = t("proton_source_umu_default", {
    ns: ["settings", "game_details"],
  });

  const protonSourceSteam = t("proton_source_steam", {
    ns: ["settings", "game_details"],
  });

  const protonSourceCompatibilityTools = t(
    "proton_source_compatibility_tools",
    {
      ns: ["settings", "game_details"],
    }
  );

  return (
    <div className="settings-context-panel settings-context-compatibility">
      {window.electron.platform === "linux" && (
        <div className="settings-context-panel__group">
          <div className="settings-context-compatibility__stack">
            <div className="settings-behavior__proton-section settings-context-compatibility__section">
              <p className="settings-behavior__proton-description">
                {t("default_proton_version_description")}
              </p>

              <ProtonPathPicker
                versions={protonVersions}
                selectedPath={selectedDefaultProtonPath}
                onChange={(value) => {
                  setSelectedDefaultProtonPath(value);
                  updateUserPreferences({ defaultProtonPath: value || null });
                }}
                radioName="default-proton-version"
                autoLabel={protonVersionAutoLabel}
                autoSourceDescription={protonSourceUmuDefault}
                steamSourceDescription={protonSourceSteam}
                compatibilityToolsSourceDescription={
                  protonSourceCompatibilityTools
                }
              />
            </div>

            <div className="settings-context-compatibility__section settings-context-compatibility__global-toggles">
              <h3 className="settings-behavior__proton-title">
                {t("behavior")}
              </h3>

              <div className="settings-behavior__gamemode-toggle">
                <CheckboxField
                  label={
                    <span
                      className={`settings-behavior__gamemode-label ${
                        !gamemodeAvailable
                          ? "settings-behavior__gamemode-label--disabled"
                          : ""
                      }`}
                      data-tooltip-id={
                        !gamemodeAvailable
                          ? "settings-gamemode-unavailable-tooltip"
                          : undefined
                      }
                      data-tooltip-content={
                        !gamemodeAvailable
                          ? tGameDetails("gamemode_not_available_tooltip", {
                              defaultValue:
                                "GameMode is not available in your PATH",
                            })
                          : undefined
                      }
                    >
                      <span>{tGameDetails("run_with_gamemode_prefix")}</span>
                      <Link
                        to={GAMEMODE_SITE_URL}
                        className="settings-behavior__gamemode-link"
                      >
                        GameMode
                        <LinkExternalIcon />
                      </Link>
                    </span>
                  }
                  checked={autoRunGamemode}
                  disabled={!gamemodeAvailable}
                  onChange={() =>
                    setAutoRunGamemode((previousValue) => {
                      const nextValue = !previousValue;
                      updateUserPreferences({ autoRunGamemode: nextValue });
                      return nextValue;
                    })
                  }
                />

                {!gamemodeAvailable && (
                  <Tooltip id="settings-gamemode-unavailable-tooltip" />
                )}
              </div>

              <div className="settings-behavior__mangohud-toggle">
                <CheckboxField
                  label={
                    <span
                      className={`settings-behavior__mangohud-label ${
                        !mangohudAvailable
                          ? "settings-behavior__mangohud-label--disabled"
                          : ""
                      }`}
                      data-tooltip-id={
                        !mangohudAvailable
                          ? "settings-mangohud-unavailable-tooltip"
                          : undefined
                      }
                      data-tooltip-content={
                        !mangohudAvailable
                          ? tGameDetails("mangohud_not_available_tooltip", {
                              defaultValue:
                                "MangoHud is not available in your PATH",
                            })
                          : undefined
                      }
                    >
                      <span>{tGameDetails("run_with_mangohud_prefix")}</span>
                      <Link
                        to={MANGOHUD_SITE_URL}
                        className="settings-behavior__mangohud-link"
                      >
                        MangoHud
                        <LinkExternalIcon />
                      </Link>
                    </span>
                  }
                  checked={autoRunMangohud}
                  disabled={!mangohudAvailable}
                  onChange={() =>
                    setAutoRunMangohud((previousValue) => {
                      const nextValue = !previousValue;
                      updateUserPreferences({ autoRunMangohud: nextValue });
                      return nextValue;
                    })
                  }
                />

                {!mangohudAvailable && (
                  <Tooltip id="settings-mangohud-unavailable-tooltip" />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
