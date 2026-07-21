// app/_main/container — High-level container + Wine prefix orchestration.
// Low-level bwrap construction is in ./makai_time/engine/container/
// (builder.py, steps/). This directory manages lifecycle, IPC, and prefix UI.

export type { PrefixOptions, PrefixResult, ScanFixResult } from "./types";

export { logOperation, logCall, logError as logPrefixError } from "./activity-logger";

export {
  parseLibraryFolders,
  findAllSteamLibraries,
  findProtonPath,
  findSteamClientPath,
  findSteamAppPath,
  findCompatData,
} from "./core/steam-paths";

export {
  createPrefix,
  initPrefix,
  initPrefixViaUmu,
  checkAndCreateWinePrefix,
  ensureGamePrefix,
} from "./core/init";
export type { CreatePrefixOptions, CreatePrefixResult, EnsureGamePrefixOptions, EnsureGamePrefixResult } from "./core/init";

export {
  clearCompatData,
  ensureCompatData,
  deleteGamePrefix,
} from "./core/clear";

export {
  validatePrefix,
  ensurePrefixDir,
  type ValidationResult,
} from "./core/validate";

export {
  applyWineDllOverrides,
  applyGameDllOverrides,
  BETHESDA_COMMON_DLL_OVERRIDES,
  MODERN_DIRECTX_DEPS,
  type DllOverridesMap,
} from "./core/dll-overrides";

export { Wine } from "./core/wine-prefix";

export { getVenvPythonPath, getPrefixPythonDir } from "./core/venv";
