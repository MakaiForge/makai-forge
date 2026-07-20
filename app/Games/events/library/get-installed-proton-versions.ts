import { registerEvent } from "@main/events/register-event";
import { Umu } from "@main/services";
import { ProtonRecommendationService } from "@provision/proton_recommended/services/proton-recommendation";
import type { ProtonVersion } from "@types";

const getInstalledProtonVersions = async (): Promise<ProtonVersion[]> => {
  const [installed, forks] = await Promise.all([
    Umu.getInstalledProtonVersions(),
    ProtonRecommendationService.getInstalledForks().catch(() => [] as any[]),
  ]);

  const map = new Map<string, ProtonVersion>();

  for (const v of installed) {
    map.set(v.path, { ...v, isInstalled: true });
  }

  for (const fork of forks) {
    const forkPath = `fork://${fork.id}`;
    if (!map.has(forkPath)) {
      map.set(forkPath, {
        name: fork.name,
        path: forkPath,
        source: "fork_catalog",
        isInstalled: false,
        forkId: fork.id,
        version: fork.versions?.join(", ") ?? "",
        tierScore: fork.tierScore,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
};

registerEvent("getInstalledProtonVersions", getInstalledProtonVersions);
