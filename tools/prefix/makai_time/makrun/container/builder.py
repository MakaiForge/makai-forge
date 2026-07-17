import os
import shutil
from pathlib import Path

from makrun.log import log


def build_bwrap_cmd(
    runtime_path: Path,
    proton_path: Path,
    prefix_path: str,
    exe_path: str,
    env: dict[str, str],
    features: dict | None = None,
    display_backend: str = "auto",
    interactive: bool = False,
    dry_run: bool = False,
) -> list[str]:
    """Monta o comando bwrap para rodar o Proton + exe dentro do container.

    Args:
        runtime_path: Path do runtime (ex: ~/.local/share/umu/steamrt4/)
        proton_path: Path do Proton (ex: ~/.config/.../Proton-CachyOS-11.0/)
        prefix_path: Path do Wine prefix
        exe_path: Path do executável do jogo
        env: Dict de env vars para injetar no container
        features: Dict retornado por inject_features() (opcional)
        display_backend: "auto", "x11", ou "wayland"
        interactive: Se True, não isola tanto (debug)
        dry_run: Se True, loga o comando mas não executa

    Returns:
        Lista de argumentos para subprocess.Popen
    """
    bwrap = _find_bwrap()
    cmd: list[str] = [bwrap]

    # Segurança (sempre)
    if not interactive:
        cmd.extend(["--unshare-all"])
    cmd.extend([
        "--disable-userns",
        "--clearenv",
        "--cap-drop", "ALL",
    ])

    # Proc
    cmd.extend(["--proc", "/proc"])

    # Sys (GPU probe via sysfs)
    cmd.extend(["--ro-bind", "/sys", "/sys"])

    # Runtime como /usr + /lib + /bin etc.
    runtime_files = runtime_path / "files"
    cmd.extend([
        "--ro-bind", str(runtime_files / "usr"), "/usr",
    ])

    # Provider mount: host acessível em /run/host
    cmd.extend(["--ro-bind", "/", "/run/host"])

    # Host etc (minimal)
    for etc_file in ["hosts", "host.conf", "resolv.conf", "nsswitch.conf"]:
        host_etc = Path("/etc") / etc_file
        if host_etc.is_file():
            cmd.extend(["--ro-bind", str(host_etc), f"/etc/{etc_file}"])

    # Machine-id (D-Bus, PulseAudio)
    machine_id = Path("/etc/machine-id")
    if machine_id.is_file():
        cmd.extend(["--ro-bind", str(machine_id), "/etc/machine-id"])

    # Local time
    localtime = Path("/etc/localtime")
    if localtime.is_file() or localtime.is_symlink():
        cmd.extend(["--ro-bind", str(localtime), "/etc/localtime"])

    # Mount Proton (bind dentro do container)
    proton_container = "/proton"
    cmd.extend(["--bind", str(proton_path.resolve()), proton_container])

    # Mount prefix
    prefix_resolved = Path(prefix_path).expanduser().resolve()
    prefix_container = "/prefix"
    cmd.extend(["--bind", str(prefix_resolved), prefix_container])

    # Mount game executable dir
    exe_resolved = Path(exe_path).expanduser().resolve()
    game_container = "/game"
    cmd.extend(["--ro-bind", str(exe_resolved.parent), game_container])

    # X11 display
    x11_socket = Path("/tmp/.X11-unix")
    if x11_socket.is_dir():
        cmd.extend(["--ro-bind", "/tmp/.X11-unix", "/tmp/.X11-unix"])

    # Wayland display
    wayland_display = os.environ.get("WAYLAND_DISPLAY", "wayland-0")
    wayland_socket = Path(f"/run/user/{os.getuid()}/{wayland_display}")
    if wayland_socket.is_socket():
        cmd.extend([
            "--ro-bind", str(wayland_socket), str(wayland_socket),
        ])

    # D-Bus socket
    dbus_socket = Path(f"/run/user/{os.getuid()}/bus")
    if dbus_socket.is_socket():
        cmd.extend(["--ro-bind", str(dbus_socket), str(dbus_socket)])

    # Audio (PipeWire/PulseAudio)
    pulse_socket = Path(f"/run/user/{os.getuid()}/pulse")
    if pulse_socket.is_dir():
        cmd.extend(["--ro-bind", str(pulse_socket), str(pulse_socket)])
    pipewire_socket = Path(f"/run/user/{os.getuid()}/pipewire-0")
    if pipewire_socket.is_socket():
        cmd.extend(["--ro-bind", str(pipewire_socket), str(pipewire_socket)])

    # Xauthority
    xauth = Path.home() / ".Xauthority"
    if xauth.is_file():
        cmd.extend(["--ro-bind", str(xauth), str(xauth)])

    # /dev/dri (GPU)
    dri = Path("/dev/dri")
    if dri.is_dir():
        cmd.extend(["--dev-bind", "/dev/dri", "/dev/dri"])

    # NVIDIA devices
    for dev in ["nvidia0", "nvidiactl", "nvidia-modeset", "nvidia-uvm"]:
        d = Path(f"/dev/{dev}")
        if d.exists():
            cmd.extend(["--dev-bind", str(d), str(d)])

    # /dev/shm
    cmd.extend(["--bind", "/dev/shm", "/dev/shm"])

    # /run/udev (joystick, input)
    cmd.extend(["--ro-bind", "/run/udev", "/run/udev"])

    # Home directory isolado + bind real
    home = str(Path.home())
    cmd.extend(["--tmpfs", "/home"])
    cmd.extend(["--bind", home, home])

    # ENV vars do container
    _add_env(cmd, "container", "makai")
    _add_env(cmd, "WINEPREFIX", prefix_container)
    _add_env(cmd, "PROTONPATH", f"{proton_container}")
    _add_env(cmd, "GAMEID", env.get("GAMEID", ""))
    _add_env(cmd, "STEAM_COMPAT_APP_ID", env.get("STEAM_COMPAT_APP_ID", "0"))
    _add_env(cmd, "SteamAppId", env.get("SteamAppId", "0"))
    _add_env(cmd, "SteamGameId", env.get("SteamGameId", "0"))
    _add_env(cmd, "STEAM_COMPAT_DATA_PATH", prefix_container)
    _add_env(cmd, "STEAM_COMPAT_INSTALL_PATH", game_container)
    _add_env(cmd, "STEAM_COMPAT_TOOL_PATHS", f"{proton_container}:{str(runtime_path)}")
    _add_env(cmd, "STEAM_COMPAT_MOUNTS", f"{proton_container}:{str(runtime_path)}")
    _add_env(cmd, "STEAM_COMPAT_LIBRARY_PATHS", game_container)
    _add_env(cmd, "STEAM_RUNTIME_LIBRARY_PATH", f"{prefix_container}/overrides/lib:{prefix_container}/overrides/lib32:{str(runtime_files / 'usr' / 'lib')}:{str(runtime_files / 'usr' / 'lib32')}")
    _add_env(cmd, "LD_LIBRARY_PATH", f"{prefix_container}/overrides/lib:{str(runtime_files / 'usr' / 'lib')}")
    _add_env(cmd, "DISPLAY", os.environ.get("DISPLAY", ":0"))
    _add_env(cmd, "WAYLAND_DISPLAY", os.environ.get("WAYLAND_DISPLAY", "wayland-0"))
    _add_env(cmd, "XDG_SESSION_TYPE", os.environ.get("XDG_SESSION_TYPE", ""))
    if xauth.is_file():
        _add_env(cmd, "XAUTHORITY", str(xauth))
    _add_env(cmd, "XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")
    _add_env(cmd, "DBUS_SESSION_BUS_ADDRESS", f"unix:path=/run/user/{os.getuid()}/bus")
    _add_env(cmd, "PULSE_SERVER", f"unix:/run/user/{os.getuid()}/pulse/native")
    _add_env(cmd, "HOME", home)

    # Features do injector como env vars
    if features and features.get("env"):
        for k, v in features["env"].items():
            if v is not None:
                _add_env(cmd, k, str(v))

    # Anti-cheat relaxations
    if features and features.get("container_flags"):
        for flag in features["container_flags"]:
            cmd.extend(flag.split() if isinstance(flag, str) else flag)

    # Container relaxations from anti-cheat API
    if features and features.get("container_relaxations"):
        from makrun.intel.anticheat.container import CONTAINER_RELAX_FLAGS
        for relax in features["container_relaxations"]:
            flags = CONTAINER_RELAX_FLAGS.get(relax, {}).get("bwrap_flags", [])
            cmd.extend(flags)

    # Exec
    proton_exe = f"{proton_container}/proton"
    verb = env.get("PROTON_VERB", "waitforexitandrun")
    game_exe = f"{game_container}/{exe_resolved.name}"
    cmd.extend([proton_exe, verb, game_exe])

    return cmd


def _find_bwrap() -> str:
    bwrap = shutil.which("bwrap")
    if not bwrap:
        raise FileNotFoundError("bwrap not found in PATH. Install bubblewrap.")
    return bwrap


def _add_env(cmd: list[str], key: str, val: str) -> None:
    cmd.extend(["--setenv", key, val])
