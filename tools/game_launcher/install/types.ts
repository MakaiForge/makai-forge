export interface InstallCandidate {
  path: string
  name: string
  size: number
  type?: string
}

export interface InstallResult {
  success: boolean
  candidates: InstallCandidate[]
  suggested_dir: string | null
  method: "installer" | "portable" | "installer_fallback_copy" | "restore"
  error?: string
}

export type ProgressCallback = (step: string, percent: number, message: string) => void
