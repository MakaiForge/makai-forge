import type { ExternalToolDef } from "../_shared/types";

export function getTools(): ExternalToolDef[] {
  return [
    { name: "WolvenKit", exeName: "WolvenKit.exe", searchPaths: ["."], downloadUrl: "https://github.com/WolvenKit/WolvenKit/releases/latest/download/WolvenKit-8.19.0-win-x64.zip", detector: { file: "WolvenKit.exe" }, useProton: true },
    { name: "ArchiveXL", exeName: "", searchPaths: [] },
    { name: "TweakXL", exeName: "", searchPaths: [] },
    { name: "Codeware", exeName: "", searchPaths: [] },
  ];
}
