import fs from "node:fs";
import path from "node:path";
import { registerEvent } from "@main/events/register-event";
import { WindowManager, logger } from "@main/services";
import { MakaiRPC } from "@mods-manager/services/makai-rpc";

type FileSelectResolve = (result: { 
  canceled: boolean; 
  candidates: Array<{ path: string; name: string; size: number }>; 
  suggestedDir: string | null;
}) => void;

let pendingResolve: FileSelectResolve | null = null;

export function waitForFolderSelection(): Promise<{ 
  canceled: boolean; 
  candidates: Array<{ path: string; name: string; size: number }>; 
  suggestedDir: string | null;
}> {
  return new Promise((resolve) => {
    pendingResolve = resolve;
  });
}

registerEvent("getPendingFileSelection", async () => {
  return WindowManager.getPendingFileSelectData();
});

registerEvent("confirmFileSelection", async (
  _event: Electron.IpcMainInvokeEvent,
  _shop: string,
  _objectId: string,
  selectedPaths: string[],
) => {
  const resolve = pendingResolve;
  pendingResolve = null;
  const pending = WindowManager.getPendingFileSelectData();

  if (!resolve || !pending) {
    WindowManager.closeFolderSelectWindow();
    return { canceled: true, candidates: [], suggestedDir: null };
  }

  const { folderPath, prefixPath } = pending;
  const gameFolderName = path.basename(folderPath);

  try {
    const driveC = path.resolve(prefixPath, "drive_c");
    const destRoot = path.join(driveC, gameFolderName);
    fs.mkdirSync(destRoot, { recursive: true });

    for (const src of selectedPaths) {
      const stat = fs.statSync(src, { throwIfNoEntry: false });
      if (!stat) continue;
      const rel = path.relative(folderPath, src);
      const dest = path.join(destRoot, rel);
      if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        copyRecursiveSync(src, dest);
      } else {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
    }

    const scan = await MakaiRPC.call<any>("scan_prefix_for_exes", {
      prefix_path: prefixPath,
      game_folder_name: gameFolderName,
    });

    const result = {
      canceled: false,
      candidates: scan.candidates || [],
      suggestedDir: scan.suggested_dir || destRoot,
    };
    resolve(result);
    WindowManager.closeFolderSelectWindow();
    return result;
  } catch (err) {
    const msg = String(err);
    logger.error(`[folderSelect] ${msg}`);
    const result = { canceled: true, candidates: [], suggestedDir: null };
    resolve(result);
    WindowManager.closeFolderSelectWindow();
    return result;
  }
});

registerEvent("cancelFileSelection", async () => {
  const resolve = pendingResolve;
  pendingResolve = null;
  resolve?.({ canceled: true, candidates: [], suggestedDir: null });
  WindowManager.closeFolderSelectWindow();
  return { canceled: true };
});

function copyRecursiveSync(src: string, dest: string) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyRecursiveSync(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}
