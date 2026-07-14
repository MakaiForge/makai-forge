import fs from "node:fs";
import path from "node:path";
import { getSteamLocation } from "./steam";
import { logger } from "./logger";

function configVdfPath(steamPath: string): string {
  return path.join(steamPath, "config", "config.vdf");
}

function detectLineEnding(text: string): "\n" | "\r\n" {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/**
 * Find the matching closing brace for a VDF block.
 * `openIdx` is the index of the opening `{`.
 * Returns the index of the matching `}`, or -1.
 */
function findMatchingBrace(text: string, openIdx: number): number {
  let depth = 1;
  for (let i = openIdx + 1; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function getSteamGameProton(appId: string): Promise<{
  name: string;
  priority: string;
} | null> {
  const steamPath = await getSteamLocation().catch(() => null);
  if (!steamPath) return null;

  const vdfPath = configVdfPath(steamPath);
  if (!fs.existsSync(vdfPath)) return null;

  try {
    const raw = fs.readFileSync(vdfPath, "utf-8");
    const normalized = raw.replace(/\r\n/g, "\n");

    const compatIdx = normalized.indexOf('"CompatToolMapping"');
    if (compatIdx === -1) return null;

    const blockOpen = normalized.indexOf("{", compatIdx);
    if (blockOpen === -1) return null;

    const blockClose = findMatchingBrace(normalized, blockOpen);
    if (blockClose === -1) return null;

    const block = normalized.slice(compatIdx, blockClose + 1);

    const entryRe = new RegExp(
      `"${escapeRegex(appId)}"\\s*\\{([^}]*?)\\}`,
    );
    const m = block.match(entryRe);
    if (!m) return null;

    const nameM = m[1].match(/"name"\s*"([^"]+)"/);
    if (!nameM) return null;

    const prioM = m[1].match(/"priority"\s*"([^"]+)"/);
    return { name: nameM[1], priority: prioM ? prioM[1] : "0" };
  } catch (err) {
    logger.error("Failed to read Steam config.vdf", err);
    return null;
  }
}

function trimTrailingEmptyLines(s: string): string {
  return s.replace(/\n\s*\n*$/, "\n");
}

export async function setSteamGameProton(
  appId: string,
  protonName: string | null,
): Promise<boolean> {
  const steamPath = await getSteamLocation().catch(() => null);
  if (!steamPath) return false;

  const vdfPath = configVdfPath(steamPath);
  logger.info(`setSteamGameProton: vdfPath=${vdfPath}, appId=${appId}, protonName=${protonName}`);
  if (!fs.existsSync(vdfPath)) {
    logger.error(`config.vdf not found at ${vdfPath}`);
    return false;
  }

  try {
    let raw = fs.readFileSync(vdfPath, "utf-8");
    const nl = detectLineEnding(raw);
    const normalized = raw.replace(/\r\n/g, "\n");
    const isUndefined = protonName === null || protonName === "Undefined";

    // Find or create CompatToolMapping block inside Steam
    let compatIdx = normalized.indexOf('"CompatToolMapping"');
    let compatStartBrace: number;
    let compatEndBrace: number;

    if (compatIdx === -1) {
      // Need to create CompatToolMapping block
      const steamIdx = normalized.indexOf('"Steam"');
      if (steamIdx === -1) {
        logger.error("Cannot find Steam block in config.vdf");
        return false;
      }
      const steamBrace = normalized.indexOf("{", steamIdx);
      if (steamBrace === -1) return false;
      const steamEndBrace = findMatchingBrace(normalized, steamBrace);
      if (steamEndBrace === -1) return false;

      if (isUndefined) return true;

      const indent = "\t\t\t\t";
      const entry = makeEntry(appId, protonName, "\t\t\t\t\t", "\t\t\t\t\t\t", "\n");
      const newBlock = `${indent}"CompatToolMapping"\n${indent}{\n${entry}\n${indent}}`;
      const before = normalized.slice(0, steamEndBrace);
      const after = normalized.slice(steamEndBrace);
      raw = before + "\n" + newBlock + after;
      raw = raw.replace(/\r?\n/g, nl);
      logger.info(`Created new CompatToolMapping block for ${appId}`);
      fs.writeFileSync(vdfPath, raw, "utf-8");
      return true;
    }

    // Find the CompatToolMapping { } block by counting braces
    compatStartBrace = normalized.indexOf("{", compatIdx);
    if (compatStartBrace === -1) return false;
    compatEndBrace = findMatchingBrace(normalized, compatStartBrace);
    if (compatEndBrace === -1) return false;

    // Extract inner content between { and }
    const compatBefore = normalized.slice(0, compatStartBrace + 1);
    let compatInner = normalized.slice(compatStartBrace + 1, compatEndBrace);
    const compatAfter = normalized.slice(compatEndBrace);

    // Detect indentation used for entries inside the block
    const lines = compatInner.split("\n");
    let entryIndent = "\t\t\t\t\t";
    for (const line of lines) {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('"') && line !== trimmed) {
        entryIndent = line.slice(0, line.length - trimmed.length);
        break;
      }
    }
    const fieldIndent = entryIndent + "\t";

    // Build the new entry string
    const emptyEntry = isUndefined;
    const newEntry = emptyEntry ? "" : makeEntry(appId, protonName, entryIndent, fieldIndent, "\n");

    // Check for existing entry via brace counting
    const existingEntry = findEntry(normalized, compatStartBrace, compatEndBrace, appId);

    if (existingEntry) {
      // Replace existing entry
      const before = compatInner.slice(0, existingEntry.start);
      const after = compatInner.slice(existingEntry.end);
      if (emptyEntry) {
        compatInner = trimTrailingEmptyLines(before + after);
      } else {
        compatInner = before + newEntry + "\n" + after;
      }
    } else {
      if (emptyEntry) return true;
      // Append new entry to inner content
      compatInner = compatInner.trimEnd() + "\n" + newEntry + "\n";
    }

    // Remove duplicate empty lines
    compatInner = compatInner.replace(/\n{3,}/g, "\n\n");

    raw = compatBefore + compatInner + compatAfter;
    raw = raw.replace(/\r?\n/g, nl);

    logger.info(`Writing ${vdfPath}: ${raw.length}b`);
    fs.writeFileSync(vdfPath, raw, "utf-8");
    const verified = fs.readFileSync(vdfPath, "utf-8");
    logger.info(`Verified: has ${appId}=${verified.includes(appId)}`);
    return true;
  } catch (err) {
    logger.error("Failed to write Steam config.vdf", err);
    return false;
  }
}

export async function setSteamGameLaunchOptions(
  appId: string,
  launchOptions: string | null,
): Promise<boolean> {
  const steamPath = await getSteamLocation().catch(() => null);
  if (!steamPath) return false;

  const vdfPath = configVdfPath(steamPath);
  logger.info(`setSteamGameLaunchOptions: vdfPath=${vdfPath}, appId=${appId}, launchOptions=${launchOptions}`);
  if (!fs.existsSync(vdfPath)) {
    logger.error(`config.vdf not found at ${vdfPath}`);
    return false;
  }

  try {
    let raw = fs.readFileSync(vdfPath, "utf-8");
    const nl = detectLineEnding(raw);
    const normalized = raw.replace(/\r\n/g, "\n");

    // Find the Steam block
    const steamIdx = normalized.indexOf('"Steam"');
    if (steamIdx === -1) {
      logger.error("Cannot find Steam block in config.vdf");
      return false;
    }
    const steamBrace = normalized.indexOf("{", steamIdx);
    if (steamBrace === -1) return false;
    const steamEndBrace = findMatchingBrace(normalized, steamBrace);
    if (steamEndBrace === -1) return false;

    const isUndefined = launchOptions === null || launchOptions.trim() === "";

    // Find or create the "Apps" block inside Steam
    const steamInner = normalized.slice(steamBrace + 1, steamEndBrace);
    const appsKeyIdx = steamInner.indexOf('"Apps"');

    if (appsKeyIdx === -1) {
      // Need to create the Apps block inside Steam (before closing brace)
      if (isUndefined) return true;

      const indent = "\t\t\t";
      const entryIndent = "\t\t\t\t";
      const fieldIndent = "\t\t\t\t\t";
      const appsEntry = makeLaunchOptionsEntry(appId, launchOptions, entryIndent, fieldIndent, "\n");
      const appsBlock = `${indent}"Apps"\n${indent}{\n${appsEntry}\n${indent}}`;
      // Insert before the Steam closing brace
      const beforeContent = normalized.slice(steamBrace + 1, steamEndBrace).trimEnd();
      raw =
        normalized.slice(0, steamBrace + 1) +
        "\n" +
        beforeContent +
        "\n\n" +
        appsBlock +
        "\n" +
        normalized.slice(steamEndBrace);
      raw = raw.replace(/\r?\n/g, nl);
      logger.info(`Created new Apps block with LaunchOptions for ${appId}`);
      fs.writeFileSync(vdfPath, raw, "utf-8");
      return true;
    }

    // Find the Apps { } block boundaries
    const appsBlockOpen = steamBrace + 1 + steamInner.indexOf("{", appsKeyIdx);
    const appsBlockClose = findMatchingBrace(normalized, appsBlockOpen);
    if (appsBlockClose === -1) return false;

    // Look for existing entry for this appId inside the Apps block
    const existingAppEntry = findEntry(normalized, appsBlockOpen, appsBlockClose, appId);

    if (existingAppEntry) {
      const appsBefore = normalized.slice(0, appsBlockOpen + 1);
      let appsInner = normalized.slice(appsBlockOpen + 1, appsBlockClose);
      const appsAfter = normalized.slice(appsBlockClose);

      const entryBefore = appsInner.slice(0, existingAppEntry.start);
      const entryAfter = appsInner.slice(existingAppEntry.end);

      if (isUndefined) {
        appsInner = trimTrailingEmptyLines(entryBefore + entryAfter);
      } else {
        const newEntry = makeLaunchOptionsEntry(appId, launchOptions, "\t\t\t\t", "\t\t\t\t\t", "\n");
        appsInner = entryBefore + newEntry + entryAfter;
      }

      appsInner = appsInner.replace(/\n{3,}/g, "\n\n");
      raw = appsBefore + appsInner + appsAfter;
    } else {
      if (isUndefined) return true;
      // Append new entry to the Apps block
      const appsBefore = normalized.slice(0, appsBlockOpen + 1);
      let appsInner = normalized.slice(appsBlockOpen + 1, appsBlockClose);
      const appsAfter = normalized.slice(appsBlockClose);

      const newEntry = makeLaunchOptionsEntry(appId, launchOptions, "\t\t\t\t", "\t\t\t\t\t", "\n");
      appsInner = appsInner.trimEnd() + "\n" + newEntry + "\n";
      raw = appsBefore + appsInner + appsAfter;
    }
    raw = raw.replace(/\r?\n/g, nl);

    logger.info(`Writing ${vdfPath}: ${raw.length}b`);
    fs.writeFileSync(vdfPath, raw, "utf-8");
    const verified = fs.readFileSync(vdfPath, "utf-8");
    logger.info(`Verified: has ${appId}=${verified.includes(appId)}`);
    return true;
  } catch (err) {
    logger.error("Failed to write Steam config.vdf (LaunchOptions)", err);
    return false;
  }
}

function makeLaunchOptionsEntry(
  appId: string,
  launchOptions: string,
  entryIndent: string,
  fieldIndent: string,
  nl: string,
): string {
  return (
    `${entryIndent}"${appId}"${nl}` +
    `${entryIndent}{${nl}` +
    `${fieldIndent}"LaunchOptions"${"\t\t"}"${launchOptions}"${nl}` +
    `${entryIndent}}`
  );
}

function makeEntry(
  appId: string,
  protonName: string,
  entryIndent: string,
  fieldIndent: string,
  nl: string,
): string {
  return (
    `${entryIndent}"${appId}"${nl}` +
    `${entryIndent}{${nl}` +
    `${fieldIndent}"name"${"\t\t"}"${protonName}"${nl}` +
    `${fieldIndent}"config"${"\t\t"}""${nl}` +
    `${fieldIndent}"priority"${"\t\t"}"250"${nl}` +
    `${entryIndent}}`
  );
}

interface EntryRange {
  start: number;
  end: number;
}

/**
 * Find a game entry `"appId" { ... }` inside a VDF block using brace counting.
 * Returns the start and end (exclusive) offsets within the inner content.
 */
function findEntry(
  text: string,
  blockStart: number,
  blockEnd: number,
  appId: string,
): EntryRange | null {
  const inner = text.slice(blockStart + 1, blockEnd);
  const searchStr = `"${appId}"`;
  let startIdx = 0;

  while (startIdx < inner.length) {
    const found = inner.indexOf(searchStr, startIdx);
    if (found === -1) return null;

    // Check that this is at the start of a line (preceded by newline or is start of string)
    const charBefore = found > 0 ? inner[found - 1] : "\n";
    if (charBefore !== "\n" && charBefore !== "\t" && charBefore !== " " && charBefore !== "{") {
      startIdx = found + 1;
      continue;
    }

    // Find the opening brace of this entry
    const entryBrace = inner.indexOf("{", found + searchStr.length);
    if (entryBrace === -1) return null;

    // Check that the entry key matches exactly (followed by optional whitespace then {)
    const between = inner.slice(found + searchStr.length, entryBrace);
    if (!/^\s*$/.test(between)) {
      startIdx = entryBrace;
      continue;
    }

    // Find matching closing brace
    const closeIdx = findMatchingBrace(inner, entryBrace);
    if (closeIdx === -1) return null;

    return { start: found, end: closeIdx + 1 };
  }

  return null;
}
