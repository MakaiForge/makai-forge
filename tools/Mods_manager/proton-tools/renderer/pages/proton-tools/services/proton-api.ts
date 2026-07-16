export async function getProtonTools(): Promise<unknown[]> {
  return window.electron.getProtonTools();
}

export async function getInstalledProtonTools(): Promise<unknown[]> {
  return window.electron.getInstalledProtonTools();
}

export async function downloadProtonTool(toolId: string, release: unknown): Promise<boolean> {
  return window.electron.downloadProtonTool(toolId, release);
}

export async function removeProtonTool(toolId: string, toolPath: string): Promise<boolean> {
  return window.electron.removeProtonTool(toolId, toolPath);
}

export async function getProtonReleases(toolId: string): Promise<unknown[]> {
  return window.electron.getProtonReleases(toolId);
}

export async function syncSteamLibrary(): Promise<unknown[]> {
  return window.electron.syncSteamLibrary();
}

export async function getInstalledProtonVersions(): Promise<unknown[]> {
  return window.electron.getInstalledProtonVersions();
}

export async function getSteamGameProton(appId: string): Promise<unknown> {
  return window.electron.getSteamGameProton(appId);
}

export async function setSteamGameProton(appId: string, value: string | null): Promise<boolean> {
  return window.electron.setSteamGameProton(appId, value);
}

export async function clearSteamPrefix(appId: string, protonName?: string): Promise<boolean> {
  return window.electron.clearSteamPrefix(appId, protonName);
}

export async function showItemInFolder(path: string): Promise<void> {
  return window.electron.showItemInFolder(path);
}
