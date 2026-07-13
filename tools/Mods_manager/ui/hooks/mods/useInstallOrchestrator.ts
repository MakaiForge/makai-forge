/**
 * useInstallOrchestrator — Hook React para instalação de mods com progresso.
 *
 * Fornece interface completa para o fluxo de instalação:
 * - Estado atual (stage)
 * - Progresso (percent, message, files)
 * - Resultado (success, plugins, verified)
 * - Controles (start, cancel, dismiss)
 * - Verificação de pré-requisitos (verifyGameReady)
 * - Overwrite dialog (mod já existe no staging)
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  InstallStage,
  InstallProgress,
  InstallResult,
  InstallConfig,
} from "../../types/install.types";

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
  /** Fecha popup de verificação */
  dismissVerify: () => void;
  /** Re-verifica após criar prefixo */
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
  const progressRef = useRef(progress);
  const gameIdRef = useRef(gameId);
  const configRef = useRef({ gameId, profile, stagingDir });

  // Manter configRef atualizado
  useEffect(() => {
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

        // Mod já existe — não fecha o resultado, deixa o UI tratar
        if (installResult.alreadyExists) {
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

        return installResult;
      } catch (err) {
        const errorStr = String(err);

        // Tratar archive protegido por senha
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
                success: false,
                modName,
                gameName: "",
                gameId: cfg.gameId,
                stagingDir: config.stagingDir,
                archiveInfo: {
                  path: archivePath,
                  name: archivePath.split("/").pop() || "",
                  totalSize: 0,
                  totalFiles: 0,
                  compressedSize: 0,
                  format: "zip",
                  isPasswordProtected: true,
                  entries: [],
                },
                extractedFiles: [],
                verified: false,
                plugins: [],
                hasFomod: false,
                hasSkse: false,
                category: "unknown",
                error: `${t("install_error")}: ${String(retryErr)}`,
                durationMs: 0,
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
          success: false,
          modName,
          gameName: "",
          gameId: cfg.gameId,
          stagingDir: config.stagingDir,
          archiveInfo: {
            path: archivePath,
            name: archivePath.split("/").pop() || "",
            totalSize: 0,
            totalFiles: 0,
            compressedSize: 0,
            format: "zip",
            isPasswordProtected: false,
            entries: [],
          },
          extractedFiles: [],
          verified: false,
          plugins: [],
          hasFomod: false,
          hasSkse: false,
          category: "unknown",
          error: String(err),
          durationMs: 0,
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
   * Inicia instalação de um mod.
   * Primeiro roda verifyGameReady — se falhar, mostra popup e para.
   * Se mod já existe, mostra popup de overwrite.
   */
  const startInstall = useCallback(
    async (
      archivePath: string,
      configOverrides?: Partial<InstallConfig>,
    ): Promise<InstallResult | null> => {
      // ── Pré-verificação ──
      try {
        const verify: VerifyResult = await (window.electron as any).verifyGameReady(gameIdRef.current);
        setVerifyResult(verify);
        if (!verify.ok) {
          addLog(`❌ Pré-verificação falhou: ${verify.checks.filter(c => !c.ok).map(c => c.message).join("; ")}`);
          return null;
        }
      } catch (verifyErr) {
        console.warn("[INSTALL] verifyGameReady not available:", verifyErr);
      }

      // ── Executa instalação ──
      const installResult = await doInstall(archivePath, configOverrides || {});

      // Se mod já existe, abre popup de overwrite
      if (installResult?.alreadyExists) {
        const modName = installResult.modName;
        setPendingOverwrite({ archivePath, modName });
        addLog(`⚠️ Mod "${modName}" já existe — aguardando confirmação de overwrite`);
        return installResult;
      }

      return installResult;
    },
    [doInstall, addLog],
  );

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
    addLog(t("install_cancelled"));
  }, [addLog, t]);

  /**
   * Fecha overlay de resultado.
   */
  const dismissResult = useCallback(() => {
    setResult(null);
  }, []);

  /**
   * Fecha popup de verificação.
   */
  const dismissVerify = useCallback(() => {
    setVerifyResult(null);
  }, []);

  /**
   * Re-verifica pré-requisitos (chamar após criar prefixo).
   */
  const reVerify = useCallback(async () => {
    try {
      const verify: VerifyResult = await (window.electron as any).verifyGameReady(gameIdRef.current);
      setVerifyResult(verify);
    } catch (err) {
      console.warn("[INSTALL] reVerify failed:", err);
    }
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
