export function getFrameworks(): Record<string, string> {
  return { "Script Extender": "nvse_loader.exe" };
}

export function getPreferredLaunchExe(): string {
  return "nvse_loader.exe";
}
