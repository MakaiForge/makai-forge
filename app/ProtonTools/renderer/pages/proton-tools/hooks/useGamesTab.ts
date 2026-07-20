import { useEffect, useState, useCallback } from "react";
import i18next from "i18next";
import type { SteamInstalledGame, ProtonVersion } from "@types";
import * as api from "../services/proton-api";

export interface ModalResult {
  appId: string;
  ok: boolean;
  msg: string;
}

export function useGamesTab() {
  const [games, setGames] = useState<SteamInstalledGame[]>([]);
  const [protonVersions, setProtonVersions] = useState<ProtonVersion[]>([]);
  const [gameProtons, setGameProtons] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState(false);
  const [changing, setChanging] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<Record<string, string>>({});
  const [modalResult, setModalResult] = useState<ModalResult | null>(null);
  const [status, setStatus] = useState<{
    appId: string;
    msg: string;
    ok: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    setSyncing(true);
    setStatus(null);
    try {
      const g = (await api.syncSteamLibrary()) as SteamInstalledGame[];
      setGames(g);
      const versions = (await api
        .getInstalledProtonVersions()
        .catch(() => [])) as ProtonVersion[];
      setProtonVersions(versions);
      const protonMap: Record<string, string> = {};
      for (const game of g) {
        const current = await api
          .getSteamGameProton(game.appId)
          .catch(() => null);
        if (current) protonMap[game.appId] = (current as any).name;
      }
      setGameProtons(protonMap);
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsub = window.electron.onPrefixProgress((appId: string, msg: string) => {
      setProgressMsg((prev) => {
        const updated = { ...prev, [appId]: (prev[appId] || "") + msg + "\n" };
        return updated;
      });
    });
    return unsub;
  }, []);

  const handleChangeProton = useCallback(
    async (appId: string, toolName: string) => {
      if (!toolName) {
        const ok = await api.setSteamGameProton(appId, null);
        if (ok) {
          setGameProtons((prev) => {
            const next = { ...prev };
            delete next[appId];
            return next;
          });
          setStatus({ appId, msg: i18next.t("proton_tools:proton_removed"), ok: true });
        } else {
          setStatus({ appId, msg: i18next.t("proton_tools:save_failed"), ok: false });
        }
        return;
      }

      const msg = i18next.t("proton_tools:confirm_change_prefix", {
        tool: toolName,
        defaultValue: `Deseja limpar o prefixo e recriar com "${toolName}"? O prefixo atual será deletado.`,
      });
      if (!confirm(msg)) return;

      setChanging(appId);
      setModalResult(null);
      setProgressMsg((prev) => ({ ...prev, [appId]: "" }));

      const configOk = await api.setSteamGameProton(appId, toolName);
      if (!configOk) {
        setModalResult({ appId, ok: false, msg: "Falha ao salvar no config.vdf!" });
        return;
      }

      setGameProtons((prev) => {
        const next = { ...prev };
        next[appId] = toolName;
        return next;
      });

      const prefixOk = await api.clearSteamPrefix(appId, toolName);
      if (prefixOk) {
        setGames((prev) =>
          prev.map((g) =>
            g.appId === appId ? { ...g, hasPrefix: false } : g
          )
        );
        setModalResult({
          appId,
          ok: true,
          msg: i18next.t("proton_tools:prefix_cleared", { tool: toolName, defaultValue: `Prefixo recriado com "${toolName}"` }),
        });
      } else {
        setModalResult({
          appId,
          ok: false,
          msg: i18next.t("proton_tools:prefix_not_found", { defaultValue: `Falha ao recriar prefixo com "${toolName}"` }),
        });
      }
    },
    []
  );

  const closeModal = useCallback(() => {
    setChanging(null);
    setModalResult(null);
  }, []);

  return {
    games,
    protonVersions,
    gameProtons,
    syncing,
    changing,
    progressMsg,
    modalResult,
    status,
    load,
    handleChangeProton,
    closeModal,
  };
}
