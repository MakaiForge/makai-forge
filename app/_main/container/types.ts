export interface PrefixOptions {
  winePrefix?: string
  steamCompatDataPath?: string
  steamClientPath?: string
  protonPath?: string
  gameId?: string
}

export interface PrefixResult {
  success: boolean
  prefixPath?: string
  error?: string
}

export interface ScanFixResult {
  found: boolean
  gamePath?: string
  steamAppId?: string
  steamLibraryPath?: string
  skseFound?: boolean
  configSaved?: boolean
  error?: string
}
