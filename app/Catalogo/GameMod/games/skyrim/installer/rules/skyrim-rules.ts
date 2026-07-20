import fs from "node:fs";
import path from "node:path";
import type { ModFileEntry, ModStructure } from "../types";

export const SKYRIM_REQUIRED_FOLDERS = [
  "CalienteTools",
  "FaceGenData",
  "Meshes",
  "Textures",
  "Sounds",
  "Music",
  "Scripts",
  "Seq",
  "Strings",
  "Video",
  "SKSE",
  "Interface",
  "Shaders",
  "Tools",
];

export function applySkyrimRules(
  files: ModFileEntry[],
  structure: ModStructure,
  stagingDir: string
): ModFileEntry[] {
  const result: ModFileEntry[] = [];

  for (const file of files) {
    let dest = file.destination;

    // Loose .esp/.esm/.bsa at root → go inside Data/
    if (isLoosePluginOrArchive(file.source, file.destination)) {
      dest = path.join("Data", file.destination);
    }

    // SKSE/ at root → go inside Data/SKSE/
    if (file.destination.startsWith("SKSE/") || file.destination.startsWith("SKSE\\")) {
      dest = path.join("Data", file.destination);
    }

    // Bodyslide files always go to CalienteTools/BodySlide/
    if (file.destination.includes("CalienteTools")) {
      dest = file.destination;
    }

    result.push({ source: file.source, destination: dest });
  }

  return result;
}

function isLoosePluginOrArchive(sourcePath: string, destPath: string): boolean {
  const ext = path.extname(destPath).toLowerCase();
  return [".esp", ".esm", ".esl", ".bsa", ".ba2"].includes(ext) && !destPath.includes("/") && !destPath.includes("\\");
}

export function validateInstallation(stagingDir: string): string[] {
  const warnings: string[] = [];
  if (!stagingDir) return warnings;

  const entries = fs.readdirSync(stagingDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const isRequired = SKYRIM_REQUIRED_FOLDERS.some(
      f => entry.name.toLowerCase() === f.toLowerCase()
    );
    if (!isRequired && entry.name !== "fomod" && entry.name !== "Fomod") {
      // Optional: warn about unknown top-level directories
    }
  }

  return warnings;
}
