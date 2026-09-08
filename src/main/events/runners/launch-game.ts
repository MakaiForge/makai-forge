import { registerEvent } from "../register-event";
import {
  installRunner,
  launchGame,
  fetchLatestRelease,
  getRunnerDir,
} from "@emulators/installer";
import { getRunnerById } from "@emulators/registry";
import { readFile } from "fs/promises";
import path from "path";
import { WindowManager } from "@main/services";

registerEvent("launchGame", async (_event, runnerId: string, romPath: string) => {
  const def = getRunnerById(runnerId);
  if (!def) throw new Error(`Runner não encontrado: ${runnerId}`);

  if (def.repo) {
    try {
      const release = await fetchLatestRelease(def.repo);
      const runnerDir = getRunnerDir(runnerId);
      let currentVersion: string | undefined;
      try {
        currentVersion = (await readFile(path.join(runnerDir, ".version"), "utf-8")).trim();
      } catch {}

      if (currentVersion && release.tag_name !== currentVersion) {
        await installRunner(def);
      }
    } catch {
      // Se falhar, só abre o emulador
    }
  }

  await launchGame(runnerId, romPath, (id) => {
    WindowManager.mainWindow?.webContents.send("on-runner-stopped", id);
  });

  WindowManager.mainWindow?.webContents.send("on-runner-started", runnerId);
});
