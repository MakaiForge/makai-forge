import type { GameShop } from "@types"

export interface SnapshotEntry {
  path: string
  size: number
  mtimeMs: number
  isDirectory: boolean
}

export interface InstallCandidate {
  path: string
  name: string
  size: number
}

export interface InstallResult {
  wasOpened: boolean
  candidates: InstallCandidate[]
  suggestedDir: string | null
  executableSelectWindowOpened?: boolean
  autoSetExe?: string
}

export interface InstallConfig {
  dxvk: boolean | null
  vkd3d: boolean | null
  esync: boolean | null
  fsync: boolean | null
  env: Record<string, string>
  winetricks: string[]
}

export interface InstallOptions {
  gameId?: string
  winePrefixPath?: string | null
  protonPath?: string | null
  gameTitle?: string | null
  gameKey?: string
  shop?: GameShop
  objectId?: string
  onLog?: (line: string) => void
  wineDebug?: string
  winetricksVerbs?: string[]
  installConfig?: InstallConfig
}

export interface FolderScanResult {
  candidates: InstallCandidate[]
  suggestedDir: string | null
}
