export { parseScriptYaml } from "./parser";
export { downloadFile } from "./downloader";
export { detectArchiveMagic, extractArchive } from "./extractor";
export type {
  ParsedScriptYaml,
  InstallConfig,
  InstallerConfig,
  ScriptFile,
  DownloadResult,
  InstallScriptResult,
} from "./types";
