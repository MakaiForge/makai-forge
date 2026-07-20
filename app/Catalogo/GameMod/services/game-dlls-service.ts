import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import type { GameDllCatalog, GameDllEntry } from "../data/game-dlls";

let _catalog: GameDllCatalog | null = null;

function catalogPath(): string {
  const devPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..", "data", "game-dlls.json"
  );
  if (fs.existsSync(devPath)) return devPath;
  return path.join(app.getAppPath(), "tools", "Mods_manager", "data", "game-dlls.json");
}

function loadCatalog(): GameDllCatalog {
  if (_catalog) return _catalog;
  const filePath = catalogPath();
  if (!fs.existsSync(filePath)) {
    _catalog = { _version: 1, _comment: "", games: [] };
    return _catalog;
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  _catalog = JSON.parse(raw) as GameDllCatalog;
  return _catalog;
}

export function getGameDllCatalog(): GameDllCatalog {
  return loadCatalog();
}

export function getGameDllInfo(gameId: string): GameDllEntry | undefined {
  const catalog = loadCatalog();
  return catalog.games.find((g) => g.gameId === gameId);
}

export function findGameBySteamId(steamId: string): GameDllEntry | undefined {
  const catalog = loadCatalog();
  return catalog.games.find((g) => g.steamIds.includes(steamId));
}

export function findGameByExe(exeName: string): GameDllEntry | undefined {
  const catalog = loadCatalog();
  const lower = exeName.toLowerCase();
  return catalog.games.find(
    (g) =>
      g.detectExe.toLowerCase() === lower ||
      g.detectExeAlts?.some((a) => a.toLowerCase() === lower)
  );
}

export function findGameByName(name: string): GameDllEntry | undefined {
  const catalog = loadCatalog();
  const lower = name.toLowerCase();
  return catalog.games.find(
    (g) =>
      g.gameId.toLowerCase() === lower ||
      g.name.toLowerCase() === lower ||
      g.name.toLowerCase().includes(lower) ||
      g.gameId.toLowerCase().includes(lower)
  );
}

export function findGameByGameIdOrName(gameId: string, gameName?: string): GameDllEntry | undefined {
  const catalog = loadCatalog();
  let info = catalog.games.find((g) => g.gameId === gameId);
  if (info) return info;
  const lower = gameId.toLowerCase();
  info = catalog.games.find(
    (g) =>
      g.gameId.toLowerCase() === lower ||
      g.name.toLowerCase() === lower
  );
  if (info) return info;
  if (gameName) return findGameByName(gameName);
  return findGameByName(gameId);
}

export const gameDllCatalog = {
  getAll: getGameDllCatalog,
  getGame: getGameDllInfo,
  findBySteamId: findGameBySteamId,
  findByExe: findGameByExe,
  findByName: findGameByName,
  findByIdOrName: findGameByGameIdOrName,
};
