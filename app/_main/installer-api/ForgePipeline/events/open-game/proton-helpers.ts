import { getInstalledTools } from "@proton/main/services/installer";
import { getTools } from "@proton/main/services/tools";
import type { ProtonRelease } from "@proton/main/services/types";

export function findInstalledProton(version: string): string | null {
  const search = version.toLowerCase().replace(/^v/, "");
  for (const tool of getInstalledTools()) {
    if (tool.version.toLowerCase().replace(/^v/, "") === search) return tool.path;
  }
  return null;
}

export function extractToolId(protonVersion: string): string | null {
  const ver = protonVersion.replace(/^v/, "");
  for (const tool of getTools()) {
    const fmt = tool.directoryNameFormat.replace("$version", "").toLowerCase();
    if (ver.toLowerCase().startsWith(fmt) || ver.toLowerCase().includes(fmt)) return tool.id;
  }
  return null;
}

export async function fetchRelease(toolId: string, tag: string): Promise<ProtonRelease | null> {
  const tool = getTools().find((t) => t.id === toolId);
  if (!tool) return null;

  if (tool.type === "github" || tool.type === "forgejo") {
    const base = tool.endpoint.replace(/\/releases\/?$/, "");
    const url = `${base}/tags/${encodeURIComponent(tag)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return null;
      const data = await res.json();
      return {
        tag_name: data.tag_name || tag,
        assets: (data.assets || []).map((a: any) => ({
          name: a.name,
          browser_download_url: a.browser_download_url || a.url,
        })),
        html_url: data.html_url,
        published_at: data.published_at || "",
        tarball_url: data.tarball_url,
        zipball_url: data.zipball_url,
      };
    } catch { return null; }
  }

  try {
    const all = await (await fetch(tool.endpoint, { signal: AbortSignal.timeout(15000) })).json();
    const releases: ProtonRelease[] = Array.isArray(all) ? all : [];
    return releases.find((r) => r.tag_name === tag || r.tag_name === `v${tag}`) || null;
  } catch { return null; }
}
