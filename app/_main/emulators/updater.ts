import { getRunnerById, allRunnerDefinitions } from "./registry";
import { isInstalled, getInstalledVersions } from "./installer";
import { app } from "electron";
import path from "path";
import fs from "fs/promises";

interface UpdateCheckResult {
  runnerId: string;
  humanName: string;
  currentVersion: string;
  latestVersion: string;
}

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

function getLastCheckPath(): string {
  return path.join(app.getPath("userData"), "runners", ".last-update-check");
}

async function fetchLatestTag(repo: {
  owner: string;
  repo: string;
}): Promise<string> {
  const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/latest`;
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github.v3+json" },
  });
  if (!res.ok) {
    if (res.status === 403) throw new Error("Rate limited");
    if (res.status === 404) return "unknown";
    throw new Error(`GitHub API error: ${res.status}`);
  }
  const data = await res.json();
  return data.tag_name;
}

export async function checkForRunnerUpdates(
  runnerId?: string
): Promise<UpdateCheckResult[]> {
  const results: UpdateCheckResult[] = [];
  const versions = await getInstalledVersions();
  const defs = runnerId
    ? [getRunnerById(runnerId)].filter(Boolean)
    : allRunnerDefinitions;

  for (const def of defs) {
    if (!def) continue;
    const currentVersion = versions.get(def.id);
    if (!currentVersion || currentVersion === "unknown") continue;
    if (!def.repo) continue;

    try {
      const latestVersion = await fetchLatestTag(def.repo);
      if (latestVersion && latestVersion !== currentVersion && latestVersion !== "unknown") {
        results.push({
          runnerId: def.id,
          humanName: def.humanName,
          currentVersion,
          latestVersion,
        });
      }
    } catch {
      continue;
    }
  }

  await fs
    .writeFile(getLastCheckPath(), Date.now().toString(), "utf-8")
    .catch(() => {});

  return results;
}

export async function hasUpdatesAvailable(): Promise<boolean> {
  const results = await checkForRunnerUpdates();
  return results.length > 0;
}

export async function getRunnersWithUpdates(): Promise<UpdateCheckResult[]> {
  return checkForRunnerUpdates();
}

export function shouldCheckForUpdates(): Promise<boolean> {
  return fs
    .readFile(getLastCheckPath(), "utf-8")
    .then((content) => {
      const lastCheck = parseInt(content, 10);
      return Date.now() - lastCheck > CHECK_INTERVAL_MS;
    })
    .catch(() => true);
}
