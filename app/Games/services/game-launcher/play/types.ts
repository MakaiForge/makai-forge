export interface PlayProgress {
  step: string
  message: string
  status: "working" | "done" | "error" | "waiting"
  promptType?: "config" | "proton"
}

export type SendProgress = (
  step: string,
  message: string,
  status: string,
  promptType?: string,
) => void

export interface PlayResult {
  success: boolean
  method?: "skse" | "steam" | "direct" | "engine"
  error?: string
  failedStep?: string
  gamePath?: string
  steamAppId?: string
}
