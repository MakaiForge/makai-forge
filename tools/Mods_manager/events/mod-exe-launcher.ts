import { registerEvent } from "@main/events/register-event";
import { spawn } from "node:child_process";
import { app } from "electron";
import { ModStorageService } from "@main/services";
import path from "node:path";
import fs from "node:fs";

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
    const protonBin = ModStorageService.get<string>("proton_binary")
      || path.join(app.getAppPath(), "tools", "prefix", "umu-run");
    const args = tool.args
      ? [tool.exePath, ...tool.args.split(/\s+/)]
      : [tool.exePath];
    spawn(protonBin, [
      "-protonpath", ModStorageService.get<string>("proton_path") || "",
      "-waitforprocess", "-wine",
      exePath,
      ...tool.args.split(/\s+/).filter(Boolean),
    ], {
      cwd: path.dirname(exePath),
      stdio: "ignore",
      detached: true,
    }).unref();
  } else {
    spawn(exePath, tool.args.split(/\s+/).filter(Boolean), {
      cwd: path.dirname(exePath),
      stdio: "ignore",
      detached: true,
    }).unref();
  }

  return { ok: true, data: { launched: toolName } };
});

const KNOWN_TOOLS: { name: string; exe: string; dir?: string; args?: string }[] = [
  { name: "SSEEdit", exe: "SSEEdit.exe", dir: ".." },
  { name: "SSEEdit (Quick Auto Clean)", exe: "SSEEdit.exe", dir: "..", args: "-autoclean" },
  { name: "FNIS", exe: "FNIS.exe", dir: "tools/GenerateFNIS_for_Users" },
  { name: "BodySlide", exe: "BodySlide.exe", dir: "tools/BodySlide" },
  { name: "Outfit Studio", exe: "OutfitStudio.exe", dir: "tools/BodySlide" },
  { name: "LOOT", exe: "LOOT.exe", dir: ".." },
  { name: "Wrye Bash", exe: "Wrye Bash.exe", dir: ".." },
  { name: "Creation Kit", exe: "CreationKit.exe", dir: ".." },
  { name: "zEdit", exe: "zedit.exe", dir: ".." },
  { name: "Cathedral Assets Optimizer", exe: "Cathedral Assets Optimizer.exe", dir: ".." },
  { name: "Nemesis", exe: "Nemesis Unlimited Behavior Engine.exe", dir: "tools/Nemesis_Engine" },
  { name: "BethINI", exe: "BethINI.exe", dir: ".." },
];

registerEvent("scanExternalTools", async (_event, gameId: string) => {
  const gameConfig = ModStorageService.get<{ gamePath?: string }>(`game:${gameId}:config`);
  const gamePath = gameConfig?.gamePath;
  if (!gamePath || !fs.existsSync(gamePath)) {
    return { found: [], error: "Game path not found" };
  }

  const found: { name: string; exePath: string; args: string }[] = [];
  for (const tool of KNOWN_TOOLS) {
    const searchDir = tool.dir ? path.resolve(gamePath, tool.dir) : gamePath;
    const exePath = path.join(searchDir, tool.exe);
    if (fs.existsSync(exePath)) {
      found.push({ name: tool.name, exePath, args: tool.args || "" });
    }
  }

  return { found, gamePath };
});
