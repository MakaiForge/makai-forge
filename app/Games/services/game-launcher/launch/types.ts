export interface LaunchOptions {
  exePath: string
  prefixPath: string
  protonPath: string
  gamePath?: string
  gameId?: string
  envOverrides?: Record<string, string>
  onLog?: (line: string) => void
}

export interface LaunchResult {
  success: boolean
  pid?: number
  method?: string
  error?: string
}
