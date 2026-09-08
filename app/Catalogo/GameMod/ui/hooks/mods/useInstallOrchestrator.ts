/**
 * useInstallOrchestrator — Hook React para instalação de mods com progresso.
 *
 * Fluxo:
 * 1. Usuário clica "Instalar Mod"
 * 2. verifyGameReady roda → se ❌, mostra modal e guarda archivePath pendente
 * 3. Usuário configura no modal (prefixo, proton, etc)
 * 4. Modal re-verifica automaticamente
 * 5. Quando tudo ✅ → instalação dispara automaticamente
 * 6. Se mod já existe → popup de overwrite
 * 7. Deploy é automático (staging → jogo)
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  InstallStage,
  InstallProgress,
  InstallResult,
  InstallConfig,
} from "../../../types/install.types";

export interface UseInstallOrchestratorReturn {
  stage: InstallStage;
  progress: InstallProgress | null;
  result: InstallResult | null;
  isInstalling: boolean;
  canCancel: boolean;
  startInstall: (archivePath: string, config?: Partial<InstallConfig>) => Promise<InstallResult | null>;
  cancel: () => void;
  dismissResult: () => void;
  stageLabel: string;
  stagePercent: number;
  elapsedTime: string;
  /** Resultado da verificação de pré-requisitos (null = não verificado) */
  verifyResult: VerifyResult | null;
  /** Fecha popup de verificação (se tudo ok, auto-prossegue com install pendente) */
  dismissVerify: () => void;
  /** Re-verifica após criar prefixo (se tudo ok, auto-prossegue com install pendente) */
  reVerify: () => Promise<void>;
  /** Nome do mod pendente de overwrite (null = nada pendente) */
  pendingOverwrite: { archivePath: string; modName: string } | null;
  /** Confirma overwrite e re-instala com overwriteExisting: true */
  confirmOverwrite: () => Promise<void>;
  /** Cancela overwrite */
  cancelOverwrite: () => void;
}

export interface VerifyCheck {
  id: string;
  label: string;
  ok: boolean;
  message: string;
  action?: "configure" | "create_prefix" | "install_proton";
}

export interface VerifyResult {
  ok: boolean;
  checks: VerifyCheck[];
}

export function useInstallOrchestrator(
  gameId: string,
  profile: string,
  stagingDir: string,
  addLog: (msg: string) => void,
  onRefresh: () => void,
): UseInstallOrchestratorReturn {
  const { t } = useTranslation("mod_manager");
  const [stage, setStage] = useState<InstallStage>("idle");
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [result, setResult] = useState<InstallResult | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<{ archivePath: string; modName: string } | null>(null);
  const [pendingArchivePath, setPendingArchivePath] = useState<string | null>(null);
  const progressRef = useRef(progress);
  const gameIdRef = useRef(gameId);
  const configRef = useRef({ gameId, profile, stagingDir });
  const installingRef = useRef(false);

  useEffect(() => {
    gameIdRef.current = gameId;
    configRef.current = { gameId, profile, stagingDir };
  }, [gameId, profile, stagingDir]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // Listener para progresso do backend
  useEffect(() => {
    const cleanup = window.electron.onInstallProgress?.((data: InstallProgress) => {
      setProgress(data);
      setStage(data.stage);
    });
    return () => cleanup?.();
  }, []);

  // Labels de stage traduzidos
  const stageLabels = useMemo<Record<InstallStage, string>>(() => ({
    idle: t("install_stage_idle"),
    reading_archive: t("install_stage_reading_archive"),
    extracting: t("install_stage_extracting"),
    verifying: t("install_stage_verifying"),
    analyzing: t("install_stage_analyzing"),
    preparing: t("install_stage_preparing"),
    saving: t("install_stage_saving"),
    ready: t("install_stage_ready"),
    error: t("install_stage_error"),
  }), [t]);

  /**
   * Executa a instalação real (chamado tanto pelo startInstall quanto pelo confirmOverwrite).
   */
  const doInstall = useCallback(
    async (
      archivePath: string,
      configOverrides: Partial<InstallConfig>,
    ): Promise<InstallResult | null> => {
      if (installingRef.current) return null;
      installingRef.current = true;

      const cfg = configRef.current;
      const config: InstallConfig = {
        gameId: cfg.gameId,
        profile: cfg.profile,
        stagingDir: cfg.stagingDir,
        overwriteExisting: false,
        verifyAfterExtract: true,
        maxRetries: 2,
        timeoutMs: 300_000,
        ...configOverrides,
      };

      setStage("reading_archive");
      setResult(null);

      const modName = archivePath.split("/").pop()?.replace(/\.\w+$/, "") || "unknown";
      addLog(`${t("installing_mod")} ${modName}`);

      try {
        const installResult = await window.electron.installModOrchestrated(archivePath, config);

        setResult(installResult);

        if (installResult.alreadyExists) {
          installingRef.current = false;
          return installResult;
        }

        if (installResult.success) {
          addLog(
            `✅ ${installResult.modName} ${t("install_complete")}` +
            ` (${installResult.extractedFiles.length} ${t("files")}` +
            `, ${installResult.verified ? t("verified") : t("not_verified")})`,
          );
          await onRefresh();
        } else {
          addLog(`❌ ${t("install_error")}: ${installResult.error}`);
        }

        installingRef.current = false;
        return installResult;
      } catch (err) {
        installingRef.current = false;
        const errorStr = String(err);

        if (errorStr.includes("ARCHIVE_PASSWORD_PROTECTED") || /wrong password|encrypted/i.test(errorStr)) {
          const password = window.prompt(`${t("archive_password_protected")}\n${modName}`);
          if (password !== null && password !== "") {
            try {
              const retryResult = await window.electron.installModOrchestrated(archivePath, { ...config, password });
              setResult(retryResult);
              if (retryResult.success) {
                addLog(`✅ ${retryResult.modName} ${t("install_complete")} (${t("verified")})`);
                await onRefresh();
              } else {
                addLog(`❌ ${t("install_error")}: ${retryResult.error}`);
              }
              return retryResult;
            } catch (retryErr) {
              const retryErrorResult: InstallResult = {
                success: false, modName, gameName: "", gameId: cfg.gameId,
                stagingDir: config.stagingDir,
                archiveInfo: { path: archivePath, name: archivePath.split("/").pop() || "", totalSize: 0, totalFiles: 0, compressedSize: 0, format: "zip", isPasswordProtected: true, entries: [] },
                extractedFiles: [], verified: false, plugins: [], hasFomod: false, hasSkse: false, category: "unknown",
                error: `${t("install_error")}: ${String(retryErr)}`, durationMs: 0,
              };
              setResult(retryErrorResult);
              addLog(`❌ ${t("install_error")}`);
              return retryErrorResult;
            }
          }
          addLog(`❌ ${t("install_cancelled")}`);
          setStage("idle");
          return null;
        }

        const errorResult: InstallResult = {
          success: false, modName, gameName: "", gameId: cfg.gameId,
          stagingDir: config.stagingDir,
          archiveInfo: { path: archivePath, name: archivePath.split("/").pop() || "", totalSize: 0, totalFiles: 0, compressedSize: 0, format: "zip", isPasswordProtected: false, entries: [] },
          extractedFiles: [], verified: false, plugins: [], hasFomod: false, hasSkse: false, category: "unknown",
          error: String(err), durationMs: 0,
        };
        setResult(errorResult);
        addLog(`❌ ${t("install_error")}: ${String(err)}`);
        return errorResult;
      } finally {
        setStage("idle");
      }
    },
    [addLog, onRefresh, t],
  );

  /**
   * Tenta prosseguir com a instalação pendente.
   * Chamado quando o modal de verificação fecha com todos os checks ✅.
   */
  const proceedPendingInstall = useCallback(async () => {
    if (!pendingArchivePath || installingRef.current) return;
    const archivePath = pendingArchivePath;
    setPendingArchivePath(null);
    setVerifyResult(null);
    await doInstall(archivePath, {});
  }, [pendingArchivePath, doInstall]);

  /**
   * Inicia instalação de um mod.
   * Primeiro roda verifyGameReady — se falhar, mostra popup e guarda archivePath.
   * Quando o modal fecha com tudo ok, dispara install automaticamente.
   */
  const startInstall = useCallback(
    async (
      archivePath: string,
      configOverrides?: Partial<InstallConfig>,
    ): Promise<InstallResult | null> => {
      // ── Pré-verificação ──
      const verify: VerifyResult = await (window.electron as any).verifyGameReady(gameIdRef.current);
      setVerifyResult(verify);
      if (!verify.ok) {
        // Guarda archivePath pra continuar depois que o usuário configurar
        setPendingArchivePath(archivePath);
        addLog(`❌ Pré-verificação falhou — aguardando configuração do jogo`);
        return null;
      }

      // ── Verificação ok — executa instalação ──
      const installResult = await doInstall(archivePath, configOverrides || {});

      if (installResult?.alreadyExists) {
        setPendingOverwrite({ archivePath, modName: installResult.modName });
        addLog(`⚠️ Mod "${installResult.modName}" já existe — aguardando confirmação de overwrite`);
        return installResult;
      }

      return installResult;
    },
    [doInstall, addLog],
  );

  /**
   * Fecha popup de verificação.
   * Se tudo ok e tem install pendente, dispara automaticamente.
   */
  const dismissVerify = useCallback(() => {
    const currentVerify = verifyResult;
    setVerifyResult(null);
    if (currentVerify?.ok && pendingArchivePath) {
      proceedPendingInstall();
    }
  }, [verifyResult, pendingArchivePath, proceedPendingInstall]);

  /**
   * Re-verifica pré-requisitos (chamar após criar prefixo/configurar proton).
   * Se tudo ok, dispara install pendente automaticamente.
   */
  const reVerify = useCallback(async () => {
    try {
      const verify: VerifyResult = await (window.electron as any).verifyGameReady(gameIdRef.current);
      setVerifyResult(verify);
      if (verify.ok && pendingArchivePath) {
        // Usuário configurou tudo — dispara install automaticamente
        addLog(`✅ Todos os pré-requisitos OK — iniciando instalação...`);
        proceedPendingInstall();
      }
    } catch (err) {
      console.warn("[INSTALL] reVerify failed:", err);
    }
  }, [pendingArchivePath, proceedPendingInstall, addLog]);

  /**
   * Confirma overwrite — re-instala com overwriteExisting: true.
   */
  const confirmOverwrite = useCallback(async () => {
    if (!pendingOverwrite) return;
    const { archivePath, modName } = pendingOverwrite;
    setPendingOverwrite(null);
    addLog(`🔄 Sobrescrevendo mod "${modName}"...`);
    await doInstall(archivePath, { overwriteExisting: true });
  }, [pendingOverwrite, doInstall, addLog]);

  /**
   * Cancela overwrite.
   */
  const cancelOverwrite = useCallback(() => {
    if (!pendingOverwrite) return;
    addLog(`❌ Overwrite cancelado para "${pendingOverwrite.modName}"`);
    setPendingOverwrite(null);
    setResult(null);
    setStage("idle");
  }, [pendingOverwrite, addLog]);

  /**
   * Cancela instalação em andamento.
   */
  const cancel = useCallback(() => {
    window.electron.abortInstall?.();
    setStage("idle");
    setProgress(null);
    setPendingArchivePath(null);
    addLog(t("install_cancelled"));
  }, [addLog, t]);

  /**
   * Fecha overlay de resultado.
   */
  const dismissResult = useCallback(() => {
    setResult(null);
  }, []);

  // ── Helpers computados ─────────────────────────────────────────────────

  const isInstalling = stage !== "idle" && stage !== "error";
  const canCancel = isInstalling && stage !== "saving" && stage !== "ready";

  const stagePercent = progress?.percent ??
    (stage === "idle" ? 0 : stage === "ready" ? 100 : 50);

  const elapsedMs = progress?.elapsedMs ?? 0;
  const minutes = Math.floor(elapsedMs / 60000);
  const seconds = Math.floor((elapsedMs % 60000) / 1000);
  const elapsedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return {
    stage,
    progress,
    result,
    isInstalling,
    canCancel,
    startInstall,
    cancel,
    dismissResult,
    stageLabel: stageLabels[stage],
    stagePercent,
    elapsedTime,
    verifyResult,
    dismissVerify,
    reVerify,
    pendingOverwrite,
    confirmOverwrite,
    cancelOverwrite,
  };
}
