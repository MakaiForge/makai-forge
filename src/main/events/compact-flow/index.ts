import { execFile } from "node:child_process";
import { app } from "electron";
import path from "node:path";
import fs from "node:fs";

function findCompactFlowBinary(): string | null {
  // 1. binário instalado no sistema
  const systemPaths = [
    path.join(app.getPath("home"), ".local", "bin", "compactflow"),
    "/usr/local/bin/compactflow",
    "/opt/compactflow/bin/compactflow",
  ];
  for (const p of systemPaths) {
    if (fs.existsSync(p)) return p;
  }

  // 2. modo dev: procurar na pasta compact-flow ao lado
  const devPaths = [
    path.join(app.getAppPath(), "..", "compact-flow", "start-compactflow.sh"),
    path.join(app.getAppPath(), "compact-flow", "start-compactflow.sh"),
    path.join(app.getPath("home"), "MAKAI", "compact-flow", "start-compactflow.sh"),
  ];
  for (const p of devPaths) {
    if (fs.existsSync(p)) return p;
  }

  // 3. electron no node_modules do compact-flow
  const electronPaths = [
    path.join(app.getAppPath(), "..", "compact-flow", "node_modules", ".bin", "electron"),
    path.join(app.getAppPath(), "compact-flow", "node_modules", ".bin", "electron"),
  ];
  for (const p of electronPaths) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

export function launchCompactFlow(exePath?: string) {
  const bin = findCompactFlowBinary();
  if (!bin) {
    console.error("[CompactFlow] Binário não encontrado. Instale o CompactFlow.");
    return;
  }

  const args = exePath ? [exePath] : [];

  if (bin.endsWith(".sh")) {
    execFile("bash", [bin, ...args], { detached: true });
  } else {
    execFile(bin, args, { detached: true });
  }
}
