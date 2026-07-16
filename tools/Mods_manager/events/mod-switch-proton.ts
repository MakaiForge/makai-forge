import fs from "node:fs";
import path from "node:path";
import { registerEvent } from "@main/events/register-event";
import { MakaiRPC } from "@mods-manager/services/makai-rpc";
import { ModStorageService } from "@main/services";
import { logPlay } from "@game-launcher/play/logger";
import { gameDllCatalog } from "../services/game-dlls-service";

type ModGameConfig = {
  gamePath: string;
  stagingDir: string;
  protonPrefix: string;
  protonVersion?: string;
};

const DEP_TO_VERB: Record<string, string> = {
  vcredist: "vcrun2022",
  d3dcompiler_47: "d3dcompiler_47",
  dxvk: "dxvk",
};

function getVerbsForGame(gameId: string): string[] {
  const verbs: string[] = [];
  const gameInfo = gameDllCatalog.getGame(gameId);
  if (gameInfo?.autoInstallDeps) {
    for (const dep of gameInfo.autoInstallDeps) {
      const verb = DEP_TO_VERB[dep];
      if (verb) verbs.push(verb);
    }
  }
  if (gameInfo?.winetricksComponents?.length) {
    verbs.push(...gameInfo.winetricksComponents);
  }
  return [...new Set(verbs)];
}

/**
 * modSwitchProton — Troca a versão do Proton de um jogo.
 *
 * Fluxo:
 * 1. Lê config do jogo (gamePath, protonPrefix, protonVersion)
 * 2. Valida que novo Proton existe
 * 3. Lista saves no prefixo atual
 * 4. Backup dos saves em /tmp
 * 5. Deleta prefixo antigo
 * 6. Cria prefixo novo com o novo Proton
 * 7. Restaura saves
 * 8. Atualiza config do jogo (protonVersion = novoProtonPath)
 */
registerEvent("modSwitchProton", async (_event, gameId: string, newProtonPath: string) => {
  const config = ModStorageService.get<ModGameConfig | null>(`game:${gameId}:config`);
  if (!config) {
    logPlay(gameId, "modSwitchProton", { error: "jogo_nao_configurado" });
    return { ok: false, error: "Jogo não configurado." };
  }

  const oldProtonPath = (config.protonVersion || "").replace(/\/+$/, "");
  const prefixPath = (config.protonPrefix || "").replace(/\/+$/, "");
  newProtonPath = newProtonPath.replace(/\/+$/, "");

  if (!prefixPath) {
    return { ok: false, error: "Prefixo não configurado. Configure o jogo primeiro." };
  }

  if (!newProtonPath) {
    return { ok: false, error: "Novo caminho do Proton não pode ser vazio." };
  }

  if (oldProtonPath === newProtonPath) {
    return { ok: false, error: "O Proton selecionado é o mesmo que já está em uso." };
  }

  logPlay(gameId, "modSwitchProton_started", {
    oldProton: oldProtonPath,
    newProton: newProtonPath,
    prefixPath,
  });

  // 1. Validar que o novo Proton existe
  const protonBin = path.join(newProtonPath, "proton");
  if (!fs.existsSync(protonBin)) {
    return { ok: false, error: `Proton não encontrado em: ${newProtonPath}` };
  }
  if (!fs.statSync(protonBin).isFile()) {
    return { ok: false, error: `O caminho não é um Proton válido (proton não é arquivo): ${newProtonPath}` };
  }

  // 2. Verificar se o jogo não está rodando (wineserver ativo)
  let gameRunning = false;
  try {
    const psResult = await MakaiRPC.call("exec_command", {
      command: "pgrep -a wineserver 2>/dev/null || true",
      timeout: 5,
    });
    gameRunning = (psResult.stdout || "").trim().length > 0;
  } catch { /* ignore */ }

  if (gameRunning) {
    return { ok: false, error: "Feche o jogo antes de trocar o Proton. (wineserver detectado)" };
  }

  // 3. Limpar backups anteriores deste jogo
  try {
    const oldBackups = fs.readdirSync("/tmp").filter(f => f.startsWith(`makai-forge-backup-${gameId}-`));
    const pathsToDelete = oldBackups.map(f => `/tmp/${f}`);
    if (pathsToDelete.length > 0) {
      await MakaiRPC.call("delete_paths", { paths: pathsToDelete });
    }
  } catch { /* ignore */ }

  // 4. Listar saves no prefixo atual
  let saves: string[] = [];
  const prefixExists = fs.existsSync(prefixPath);

  if (!prefixExists) {
    logPlay(gameId, "modSwitchProton_no_prefix", { prefixPath });
  } else {
    try {
      const savesResult = await MakaiRPC.call<{ saves: string[] }>(
        "get_prefix_saves",
        { prefix_path: prefixPath, game_id: gameId },
      );
      saves = savesResult.saves || [];
      logPlay(gameId, "modSwitchProton_saves", { saves: saves.join(",") });
    } catch (err) {
      logPlay(gameId, "modSwitchProton_saves_error", { error: String(err) });
    }
  }

  // 6. Backup dos saves em /tmp
  const tmpBackup = `/tmp/makai-forge-backup-${gameId}-${Date.now()}`;
  let backupSuccess = false;

  if (saves.length > 0) {
    try {
      const space = await MakaiRPC.call<{ free: number }>("disk_space", { path: "/tmp" });
      if (space.free < 104_857_600) {
        logPlay(gameId, "modSwitchProton_backup_no_space", { free: String(space.free) });
      } else {
        for (const save of saves) {
          const src = path.join(prefixPath, save);
          const dst = path.join(tmpBackup, save);
          await MakaiRPC.call("exec_command", {
            command: `mkdir -p "${path.dirname(dst)}" && cp -a "${src}" "${dst}"`,
            timeout: 30,
          });
        }
        backupSuccess = true;
        logPlay(gameId, "modSwitchProton_backup", { backupPath: tmpBackup, saves: saves.join(",") });
      }
    } catch (err) {
      logPlay(gameId, "modSwitchProton_backup_failed", { error: String(err) });
    }
  }

  // 5. Deletar prefixo antigo
  if (prefixExists) {
    try {
      const deleteResult = await MakaiRPC.call<{ success: boolean }>(
        "delete_prefix",
        { prefix_path: prefixPath },
      );
      if (!deleteResult.success) {
        return { ok: false, error: "Falha ao deletar prefixo antigo." };
      }
      logPlay(gameId, "modSwitchProton_deleted", { prefixPath });
    } catch (err) {
      return { ok: false, error: `Erro ao deletar prefixo: ${String(err).slice(0, 200)}` };
    }
  } else {
    logPlay(gameId, "modSwitchProton_skip_delete", { prefixPath });
  }

  // 6. Criar prefixo novo com o novo Proton
  const extraVerbs = getVerbsForGame(gameId);
  let createResult;
  try {
    createResult = await MakaiRPC.call<{
      success: boolean;
      prefix_path: string;
      initialized: boolean;
      dlls_installed: string[];
      errors: string[];
    }>("create_prefix", {
      game_id: gameId,
      proton_path: newProtonPath,
      prefix_path: prefixPath,
      auto_dlls: true,
      extra_verbs: extraVerbs,
    });

    if (!createResult.success) {
      return {
        ok: false,
        error: `Falha ao criar novo prefixo: ${createResult.errors?.join(", ") || "erro desconhecido"}`,
      };
    }
    logPlay(gameId, "modSwitchProton_created", {
      prefixPath,
      dlls: (createResult.dlls_installed || []).join(","),
    });
  } catch (err) {
    return { ok: false, error: `Erro ao criar prefixo: ${String(err).slice(0, 200)}` };
  }

  // 8. Restaurar saves
  let restoredCount = 0;
  if (backupSuccess && saves.length > 0) {
    try {
      const restoreResult = await MakaiRPC.call<{ restored: string[]; errors: string[] }>(
        "restore_saves",
        { prefix_path: prefixPath, saves_backup: saves, backup_source: tmpBackup },
      );
      restoredCount = (restoreResult.restored || []).length;
      logPlay(gameId, "modSwitchProton_restore", {
        restored: (restoreResult.restored || []).join(","),
        errors: (restoreResult.errors || []).join(","),
      });
    } catch (err) {
      logPlay(gameId, "modSwitchProton_restore_error", { error: String(err) });
    }
  }

  // 8. Atualizar config do jogo
  ModStorageService.put(`game:${gameId}:config`, {
    ...config,
    protonVersion: newProtonPath,
  });

  // 9. Limpar backup temporário
  if (backupSuccess) {
    try { await MakaiRPC.call("delete_paths", { paths: [tmpBackup] }); } catch { /* ignore */ }
  }

  logPlay(gameId, "modSwitchProton_completed", {
    newProton: newProtonPath,
    prefixPath,
    savesCount: String(saves.length),
    restoredCount: String(restoredCount),
  });

  return {
    ok: true,
    data: {
      newProtonPath,
      prefixPath,
      savesRestored: restoredCount,
      dllsInstalled: createResult?.dlls_installed || [],
    },
  };
});
