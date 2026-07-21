import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const TERMINAL_CMDS: Record<string, (c: string) => string[]> = {
  konsole: (c) => ["--hold", "-e", "bash", "-c", c],
  kitty: (c) => ["-e", "bash", "-c", c],
  "gnome-terminal": (c) => ["--", "bash", "-c", c],
  "xfce4-terminal": (c) => ["--hold", "-e", "bash", "-c", c],
  lxterminal: (c) => ["-e", "bash", "-c", c],
  alacritty: (c) => ["-e", "bash", "-c", c],
  terminator: (c) => ["-e", "bash", "-c", c],
};

export function detectDistro(): { id: string; idLike: string; name: string } {
  try {
    const raw = fs.readFileSync("/etc/os-release", "utf-8");
    let id = "", idLike = "", name = "";
    for (const line of raw.split("\n")) {
      if (line.startsWith("ID=")) id = line.slice(3).replace(/"/g, "").trim();
      if (line.startsWith("ID_LIKE=")) idLike = line.slice(8).replace(/"/g, "").trim();
      if (line.startsWith("PRETTY_NAME=")) name = line.slice(12).replace(/"/g, "").trim();
    }
    return { id, idLike, name };
  } catch {
    return { id: "unknown", idLike: "", name: "Linux" };
  }
}

export function getInstallCmd(pkg: string): string {
  const { id, idLike } = detectDistro();
  const all = [id, ...idLike.split(/\s+/)].filter(Boolean);
  if (all.some(x => ["arch", "artix", "endeavouros", "cachyos"].includes(x)))
    return `sudo pacman -S --noconfirm ${pkg}`;
  if (all.some(x => ["fedora", "rhel", "centos"].includes(x)))
    return `sudo dnf install -y ${pkg}`;
  if (all.some(x => ["debian", "ubuntu", "pop", "linuxmint", "zorin", "elementary"].includes(x)))
    return `sudo apt install -y ${pkg}`;
  if (all.some(x => ["opensuse", "suse"].includes(x)))
    return `sudo zypper install -y ${pkg}`;
  return `sudo pacman -S ${pkg}`;
}

function findTerminal(): string | null {
  try {
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const kde = execSync(
      "kreadconfig6 --file kdeglobals --group General --key TerminalApplication",
      { encoding: "utf-8", timeout: 3000 }
    ).trim();
    if (kde) {
      const p = kde.startsWith("/") ? kde : `/usr/bin/${kde}`;
      if (fs.existsSync(p)) return p;
    }
  } catch {}

  const check = (p: string) => fs.existsSync(p) ? p : null;
  for (const p of [
    process.env.TERMINAL,
    "/usr/bin/x-terminal-emulator",
    "/usr/bin/konsole", "/usr/bin/kitty", "/usr/bin/gnome-terminal",
    "/usr/bin/xfce4-terminal", "/usr/bin/lxterminal",
    "/usr/bin/alacritty", "/usr/bin/terminator",
  ].filter(Boolean) as string[]) {
    const r = check(p);
    if (r) return r;
  }
  return null;
}

export function openTerminal(command: string): boolean {
  const term = findTerminal();
  if (!term) return false;
  const name = path.basename(term);
  const argsFn = TERMINAL_CMDS[name];
  const wrapper = `${command}; echo; read -p 'Pressione Enter para fechar...'`;
  const args = argsFn ? argsFn(wrapper) : ["-e", "bash", "-c", wrapper];
  try {
    spawn(term, args, { detached: true, stdio: "ignore" }).unref();
    return true;
  } catch { return false; }
}
