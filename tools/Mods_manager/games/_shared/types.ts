import type { DeploymentResult, ModlistEntry } from "@types";

export type LinkMode = "symlink" | "hardlink" | "copy";

export interface ScriptExtenderRelease {
  version: string
  url: string
  loaderName: string
  dllPattern: RegExp
}

export interface GameModule {
  id: string
  displayName?: string
  aliases: string[]
  steamAppId?: string
  altSteamAppIds?: readonly string[]
  nexusDomain?: string
  lootType?: string
  exeName?: string
  preferredLaunchExe?: string
  detect(gamePath: string): boolean
  getDeployTarget(gamePath: string): string
  shouldWritePluginsTxt(): boolean
  getPluginExtensions(): string[]
  onBeforeDeploy?(gamePath: string, stagingDir: string, modlist: ModlistEntry[]): void
  onAfterDeploy?(gamePath: string, stagingDir: string, modlist: ModlistEntry[], result: DeploymentResult): void
  deploy?(gamePath: string, stagingDir: string, modlist: ModlistEntry[],
          profile: string, prefixPath?: string, mode?: LinkMode): Promise<DeploymentResult>
  restore?(gamePath: string, stagingDir: string, profile: string,
           prefixPath?: string): Promise<void>
  /** Default link mode for this game's deploy (overridden by user config) */
  defaultLinkMode?: LinkMode
  /** Whether to create a Core backup before deploying (default: true) */
  coreBackupEnabled?: boolean
  /** Case normalization mode for filemap paths: "lower" for case-sensitive games */
  filemapCasing?: "lower" | "preserve"
  getLaunchCommand?(): string[] | null
  /** Extra args appended to the launch command (e.g. "-windowed") */
  getLaunchArgs?(): string[]
  getLaunchEnv?(gamePath: string, prefixPath: string, protonPath?: string): Record<string, string>
  /** Retorna o executável correto para launch (prioridade sobre preferredLaunchExe) */
  getLaunchExe?(gamePath: string, hasSkse: boolean, sksePath?: string): string | null
  getWineDllOverrides?(): Record<string, string>
  getAutoInstallDeps?(): string[]
  getWinetricksComponents?(): string[]
  /** Semeia registro Bethesda via proton run reg add (cada jogo Bethesda implementa) */
  seedRegistry?(prefixPath: string, gamePath: string, protonPath: string, steamAppId?: string, libraryPath?: string): boolean
  /** Retorna o subpath para o diretório My Games (ex: "Skyrim", "Fallout4") */
  getMyGamesSubpath?(): string
  getCustomRoutingRules?(): CustomRule[]
  /** Frameworks detectados (chave=nome, valor=caminho do arquivo) */
  getFrameworks?(): Record<string, string>
  /** Frameworks com auto-download disponível */
  getAutoInstallFrameworks?(): FrameworkDef[]
  getArchiveInvalidationConfig?(): ArchiveInvalidationConfig | null
  getArchiveHandlers(): ArchiveHandler[]
  getScriptExtender(): ScriptExtenderDef | null
  /** Release info para download automático do script extender */
  getScriptExtenderRelease?(): ScriptExtenderRelease | null
  getExternalTools(): ExternalToolDef[]
}

export interface CustomRule {
  dest: string
  filenames?: string[]
  extensions?: readonly string[]
  folders?: string[]
  flatten?: boolean
  looseOnly?: boolean
  toPrefix?: boolean
  mirrorDests?: string[]
}

export interface ArchiveInvalidationConfig {
  enabled: boolean
  bsaName: string | null
  bsaVersion: number | null
  archiveListKey: string
  archiveListInPrefsIni: boolean
  needsModBsas: boolean
  modBsaExtensions: string[]
  invalidationIniKey: string
  customIniFilename?: string
  archiveListFixName?: string
  archiveListFixPath?: string
  iniFilename: string
  prefsIniFilename?: string
}

export interface ArchiveHandler {
  ext: string
  name: string
  extract(archivePath: string, targetDir: string): Promise<void>
  list(archivePath: string): Promise<string[]>
}

export interface ScriptExtenderDef {
  name: string
  pattern: RegExp
  installDir: string
  dllPattern?: RegExp
}

export interface ExternalToolDef {
  name: string
  exeName: string
  searchPaths: string[]
}

export interface FrameworkDef {
  /** Nome exibido ao usuário */
  name: string
  /** URL de download direto (zip/7z) */
  downloadUrl: string
  /** Detector: arquivo que deve existir no game root se já instalado */
  detector: {
    file?: string
    folder?: string
  }
  /** Pasta dentro do zip que contém os arquivos (se houver) */
  innerFolder?: string
  /** Arquivos pra chmod +x após extrair */
  chmodFiles?: string[]
  /** Pós-install: mover arquivos pra locais específicos */
  postInstall?: (gamePath: string) => Promise<void>
}
