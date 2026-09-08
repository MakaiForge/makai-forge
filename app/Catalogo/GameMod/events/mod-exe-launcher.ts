import { registerEvent } from "@main/events/register-event";
import { MakaiRPC } from "@mods-manager/services/makai-rpc";
import { ModStorageService } from "@main/services";
import path from "node:path";
import fs from "node:fs";
import { getGameModule } from "@games/registry";
import { installTool, resolveToolPath } from "@mods/services/external-tool-installer";

const TOOLS_KEY = "external_tools";

interface ToolEntry {
  name: string;
  exePath: string;
  args: string;
  gameId: string;
  useProton: boolean;
}

registerEvent("getExternalTools", async (_event, gameId: string) => {
  const all: ToolEntry[] = ModStorageService.get(TOOLS_KEY) || [];
  return all.filter(t => t.gameId === gameId);
});

registerEvent("saveExternalTool", async (_event, tool: ToolEntry) => {
  const all: ToolEntry[] = ModStorageService.get(TOOLS_KEY) || [];
  const idx = all.findIndex(t => t.name === tool.name && t.gameId === tool.gameId);
  if (idx >= 0) all[idx] = tool;
  else all.push(tool);
  ModStorageService.put(TOOLS_KEY, all);
  return { ok: true };
});

registerEvent("removeExternalTool", async (_event, name: string, gameId: string) => {
  let all: ToolEntry[] = ModStorageService.get(TOOLS_KEY) || [];
  all = all.filter(t => !(t.name === name && t.gameId === gameId));
  ModStorageService.put(TOOLS_KEY, all);
  return { ok: true };
});

registerEvent("installExternalTool", async (_event, gameId: string, toolName: string) => {
  const gameConfig = ModStorageService.get<{ gamePath?: string }>(`game:${gameId}:config`);
  const gamePath = gameConfig?.gamePath;
  if (!gamePath || !fs.existsSync(gamePath)) {
    return { ok: false, error: "Game path not found" };
  }

  const mod = getGameModule(gameId, gamePath);
  const tools = mod?.getExternalTools?.() || [];
  const toolDef = tools.find(t => t.name === toolName && t.downloadUrl);
  if (!toolDef) {
    return { ok: false, error: `Tool "${toolName}" not found or no download URL` };
  }

  const ok = await installTool(gameId, toolDef);
  if (!ok) {
    return { ok: false, error: `Failed to install ${toolName}` };
  }

  const exePath = resolveToolPath(gameId, toolDef);
  if (exePath) {
    const entry: ToolEntry = {
      name: toolDef.name,
      exePath,
      args: toolDef.args || "",
      gameId,
      useProton: toolDef.useProton || false,
    };
    const all: ToolEntry[] = ModStorageService.get(TOOLS_KEY) || [];
    const idx = all.findIndex(t => t.name === entry.name && t.gameId === gameId);
    if (idx >= 0) all[idx] = entry;
    else all.push(entry);
    ModStorageService.put(TOOLS_KEY, all);
  }

  return { ok: true, exePath };
});

registerEvent("launchExternalTool", async (_event, gameId: string, toolName: string) => {
  const all: ToolEntry[] = ModStorageService.get(TOOLS_KEY) || [];
  const tool = all.find(t => t.name === toolName && t.gameId === gameId);
  if (!tool) return { ok: false, error: `Tool "${toolName}" not found for ${gameId}` };

  const exePath = tool.exePath;
  if (!exePath || !fs.existsSync(exePath)) {
    return { ok: false, error: `Executable not found: ${exePath}` };
  }

  const gameConfig = ModStorageService.get<{ gamePath?: string }>(`game:${gameId}:config`);

  if (tool.useProton && gameConfig?.gamePath) {
    await MakaiRPC.call("container_run", {
      exe_path: exePath,
      proton_path: ModStorageService.get<string>("proton_path") || "",
      prefix_path: ModStorageService.get<string>("proton_prefix") || "",
      game_path: gameConfig.gamePath,
    });
  } else {
    await MakaiRPC.call("launch_native_tool", {
      exe_path: exePath,
      args: tool.args.split(/\s+/).filter(Boolean),
      cwd: path.dirname(exePath),
    });
  }

  return { ok: true, data: { launched: toolName } };
});

registerEvent("getGameModuleTools", async (_event, gameId: string) => {
  const gameConfig = ModStorageService.get<{ gamePath?: string }>(`game:${gameId}:config`);
  const gamePath = gameConfig?.gamePath || "";
  const mod = getGameModule(gameId, gamePath);
  const tools = mod?.getExternalTools?.() || [];
  return tools.map(t => ({
    name: t.name,
    exeName: t.exeName,
    hasDownload: !!t.downloadUrl,
    downloadUrl: t.downloadUrl || "",
    useProton: t.useProton || false,
  }));
});

registerEvent("scanExternalTools", async (_event, gameId: string) => {
  const gameConfig = ModStorageService.get<{ gamePath?: string }>(`game:${gameId}:config`);
  const gamePath = gameConfig?.gamePath;
  if (!gamePath || !fs.existsSync(gamePath)) {
    return { found: [], error: "Game path not found" };
  }

  const mod = getGameModule(gameId, gamePath);
  const toolDefs = mod?.getExternalTools?.() || [];

  const found: { name: string; exePath: string; args: string }[] = [];
  for (const toolDef of toolDefs) {
    const exePath = resolveToolPath(gameId, toolDef);
    if (exePath) {
      found.push({ name: toolDef.name, exePath, args: toolDef.args || "" });
    }
  }

  return { found, gamePath };
});
