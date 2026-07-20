import { spawnSync } from "node:child_process";
import { registerEvent } from "@main/events/register-event";

const checkX11Support = async (): Promise<{
  installed: boolean;
  packages: string[];
  distro: string;
}> => {
  const distro = detectDistro();
  const packages = getX11Packages(distro);
  const installed = packages.every((pkg) => isPackageInstalled(distro, pkg));

  return { installed, packages, distro };
};

const detectDistro = (): string => {
  if (process.platform !== "linux") return "unknown";

  try {
    const osRelease = spawnSync("cat", ["/etc/os-release"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (osRelease.status === 0) {
      const idMatch = osRelease.stdout.match(/^ID=(\w+)/m);
      if (idMatch) return idMatch[1].toLowerCase();
      const idLikeMatch = osRelease.stdout.match(/^ID_LIKE=(\w+)/m);
      if (idLikeMatch) return idLikeMatch[1].toLowerCase();
    }
  } catch {}

  return "unknown";
};

const getX11Packages = (distro: string): string[] => {
  switch (distro) {
    case "arch":
    case "artix":
    case "manjaro":
    case "endeavouros":
    case "cachyos":
      return ["xorg-xwayland"];
    case "ubuntu":
    case "pop":
    case "linuxmint":
    case "zorin":
    case "debian":
      return ["xwayland"];
    case "fedora":
    case "nobara":
      return ["xorg-x11-server-Xwayland"];
    case "opensuse":
    case "suse":
      return ["xwayland"];
    case "gentoo":
      return ["x11-base/xwayland"];
    case "void":
      return ["xwayland"];
    case "solus":
      return ["xwayland"];
    default:
      return ["xorg-xwayland"];
  }
};

const isPackageInstalled = (distro: string, pkg: string): boolean => {
  try {
    switch (distro) {
      case "arch":
      case "artix":
      case "manjaro":
      case "endeavouros":
      case "cachyos": {
        const r = spawnSync("pacman", ["-Q", pkg], {
          stdio: "ignore",
        });
        return r.status === 0;
      }
      case "ubuntu":
      case "pop":
      case "linuxmint":
      case "zorin":
      case "debian": {
        const r = spawnSync("dpkg", ["-s", pkg], {
          stdio: "ignore",
        });
        return r.status === 0;
      }
      case "fedora":
      case "nobara": {
        const r = spawnSync("rpm", ["-q", pkg], {
          stdio: "ignore",
        });
        return r.status === 0;
      }
      case "gentoo": {
        const r = spawnSync("equery", ["l", pkg], {
          stdio: "ignore",
        });
        return r.status === 0;
      }
      default: {
        const r = spawnSync("which", ["Xwayland"], {
          stdio: "ignore",
        });
        return r.status === 0;
      }
    }
  } catch {
    return false;
  }
};

const getInstallCommand = (distro: string, packages: string[]): string => {
  const pkgStr = packages.join(" ");
  switch (distro) {
    case "arch":
    case "artix":
    case "manjaro":
    case "endeavouros":
    case "cachyos":
      return `sudo pacman -S --noconfirm ${pkgStr}`;
    case "ubuntu":
    case "pop":
    case "linuxmint":
    case "zorin":
    case "debian":
      return `sudo apt-get install -y ${pkgStr}`;
    case "fedora":
    case "nobara":
      return `sudo dnf install -y ${pkgStr}`;
    case "opensuse":
    case "suse":
      return `sudo zypper install -y ${pkgStr}`;
    case "gentoo":
      return `sudo emerge --ask ${pkgStr}`;
    case "void":
      return `sudo xbps-install -y ${pkgStr}`;
    case "solus":
      return `sudo eopkg install ${pkgStr}`;
    default:
      return `sudo pacman -S xorg-xwayland`;
  }
};

const installX11Support = async (
  _event: Electron.IpcMainInvokeEvent
): Promise<{ success: boolean; terminal?: string }> => {
  const distro = detectDistro();
  const packages = getX11Packages(distro);
  const command = getInstallCommand(distro, packages);

  const terminals = [
    "konsole",
    "gnome-terminal",
    "xfce4-terminal",
    "lxterminal",
    "terminator",
    "alacritty",
    "kitty",
    "urxvt",
    "xterm",
  ];

  for (const term of terminals) {
    const r = spawnSync("which", [term], { stdio: "ignore" });
    if (r.status === 0) {
      const { spawn } = await import("node:child_process");
      switch (term) {
        case "konsole":
          spawn(term, ["--hold", "-e", "bash", "-c", command], {
            detached: true,
            stdio: "ignore",
          });
          break;
        case "gnome-terminal":
          spawn(term, ["--", "bash", "-c", command], {
            detached: true,
            stdio: "ignore",
          });
          break;
        case "kitty":
          spawn(term, ["--hold", "bash", "-c", command], {
            detached: true,
            stdio: "ignore",
          });
          break;
        default:
          spawn(term, ["-e", `bash -c '${command}'`], {
            detached: true,
            stdio: "ignore",
          });
          break;
      }
      return { success: true, terminal: term };
    }
  }

  return { success: false };
};

registerEvent("checkX11Support", checkX11Support);
registerEvent("installX11Support", installX11Support);
