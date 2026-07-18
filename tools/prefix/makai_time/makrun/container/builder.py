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
    """Monta o comando para rodar o Proton + exe dentro do container.

    Usa pressure-vessel (_v2-entry-point) quando disponível (recomendado),
    ou constrói comando bwrap manual como fallback.

    Args:
        runtime_path: Path do runtime
        proton_path: Path do Proton
        prefix_path: Path do Wine prefix
        exe_path: Path do executável do jogo
        env: Dict de env vars
        features: Dict do injector (opcional)
        display_backend: "auto", "x11", ou "wayland"
        interactive: Se True, modo debug
        dry_run: Se True, só loga

    Returns:
        Lista de argumentos para subprocess.Popen
    """
    v2_entry = _find_v2_entry(runtime_path)
    if v2_entry is not None:
        return _build_pv_cmd(v2_entry, runtime_path, proton_path, prefix_path, exe_path, env)

    log.warning("pressure-vessel não encontrado, usando bwrap manual")
    return _build_bwrap_manual(
        runtime_path, proton_path, prefix_path, exe_path,
        env, features, display_backend, interactive, dry_run,
    )


def _find_v2_entry(runtime_path: Path) -> Path | None:
    """Procura _v2-entry-point no runtime."""
    candidates = [
        runtime_path / "_v2-entry-point",
        runtime_path.parent / "_v2-entry-point",
    ]
    for c in candidates:
        if c.is_file():
            return c
    return None


def _build_pv_cmd(
    v2_entry: Path,
    runtime_path: Path,
    proton_path: Path,
    prefix_path: str,
    exe_path: str,
    env: dict[str, str],
) -> list[str]:
    """Constrói comando usando pressure-vessel (_v2-entry-point + umu-shim).

    Igual ao UMU: _v2-entry-point --verb waitforexitandrun -- umu-shim proton waitforexitandrun exe
    """
    runtime_dir = v2_entry.parent
    umu_shim = runtime_dir / "umu-shim"

    if not umu_shim.is_file():
        log.warning("umu-shim não encontrado, pulando")
        # fallback: chama proton direto
        return [str(v2_entry), "--verb", env.get("PROTON_VERB", "waitforexitandrun"), "--",
                str(proton_path / "proton"), env.get("PROTON_VERB", "waitforexitandrun"), exe_path]

    log.info("Usando pressure-vessel: %s", v2_entry)
    return [
        str(v2_entry),
        "--verb", env.get("PROTON_VERB", "waitforexitandrun"),
        "--",
        str(umu_shim),
        str(proton_path / "proton"),
        env.get("PROTON_VERB", "waitforexitandrun"),
        exe_path,
    ]


def _build_bwrap_manual(
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
    """Fallback: constrói comando bwrap manual (sem pressure-vessel)."""
    bwrap = _find_bwrap()
    cmd: list[str] = [bwrap]

    cmd.extend(["--unshare-user"])
    if not interactive:
        cmd.extend(["--unshare-ipc", "--unshare-pid", "--unshare-uts", "--unshare-cgroup"])
    cmd.extend(["--disable-userns", "--clearenv", "--cap-drop", "ALL"])

    # Runtime como /usr + /lib + /bin etc.
    runtime_usr = _resolve_runtime_usr(runtime_path)
    if runtime_usr is None:
        raise RuntimeError(f"Runtime has no /usr structure at {runtime_path}")
    cmd.extend(["--ro-bind", str(runtime_usr), "/usr"])
    for link in ["bin", "sbin", "lib", "lib32", "lib64"]:
        cmd.extend(["--symlink", f"usr/{link}", f"/{link}"])

    # Provider mount: host acessível em /run/host
    cmd.extend(["--ro-bind", "/", "/run/host"])

    # Proc
    cmd.extend(["--proc", "/proc"])

    # Sys (GPU probe via sysfs)
    cmd.extend(["--ro-bind", "/sys", "/sys"])

    # nsswitch.conf simplificado (sem systemd-resolved)
    _nss_path = Path("/tmp/.makrun-nsswitch.conf")
    if not _nss_path.exists():
        _nss_path.write_text(
            "passwd: files\n"
            "group: files\n"
            "shadow: files\n"
            "hosts: files dns\n"
            "networks: files\n"
            "protocols: files\n"
            "services: files\n"
            "netgroup: files\n"
        )
    cmd.extend(["--ro-bind", str(_nss_path), "/etc/nsswitch.conf"])

    # Host etc (minimal)
    for etc_file in ["hosts", "host.conf", "resolv.conf", "services"]:
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

    # Runtime /etc (fonts, fontconfig para Chromium/NW.js/Java)
    if runtime_usr:
        runtime_etc = runtime_usr.parent / "etc"
        if runtime_etc.is_dir():
            for etc_sub in ["fonts", "fonts/conf.d", "fonts/fonts.conf"]:
                _src = runtime_etc / etc_sub
                _dst = Path("/etc") / etc_sub
                if _src.is_dir():
                    cmd.extend(["--ro-bind", str(_src), str(_dst)])
                elif _src.is_file():
                    cmd.extend(["--ro-bind", str(_src), str(_dst)])

    # SSL certificates (HTTPS para jogos online)
    ssl_certs = Path("/etc/ssl")
    if ssl_certs.is_dir():
        cmd.extend(["--ro-bind", "/etc/ssl", "/etc/ssl"])
    ca_certs = Path("/etc/ca-certificates")
    if ca_certs.is_dir():
        cmd.extend(["--ro-bind", "/etc/ca-certificates", "/etc/ca-certificates"])
    # Alternativa RHEL/Fedora
    pki_tls = Path("/etc/pki/tls/certs")
    if pki_tls.is_dir():
        cmd.extend(["--ro-bind", str(pki_tls), "/etc/pki/tls/certs"])
    pki_ca = Path("/etc/pki/ca-trust/extracted")
    if pki_ca.is_dir():
        cmd.extend(["--ro-bind", str(pki_ca), "/etc/pki/ca-trust/extracted"])

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

    # Xauthority (tenta env var $XAUTHORITY, depois ~/.Xauthority)
    _xauth_env = os.environ.get("XAUTHORITY", "")
    xauth = Path(_xauth_env) if _xauth_env else Path.home() / ".Xauthority"
    if xauth.is_file():
        cmd.extend(["--ro-bind", str(xauth), str(xauth)])
        os.environ["XAUTHORITY"] = str(xauth)
    elif not _xauth_env:
        # Tenta achar qualquer xauth_* em /run/user/$UID/
        xauth_dir = Path(f"/run/user/{os.getuid()}")
        if xauth_dir.is_dir():
            candidates = sorted(xauth_dir.glob("xauth_*"), key=lambda p: p.stat().st_mtime, reverse=True)
            if candidates:
                xauth = candidates[0]
                cmd.extend(["--ro-bind", str(xauth), str(xauth)])
                os.environ["XAUTHORITY"] = str(xauth)

    # /dev (seletivo — GPU + devices essenciais)
    dri = Path("/dev/dri")
    if dri.is_dir():
        cmd.extend(["--dev-bind", "/dev/dri", "/dev/dri"])

    for dev in ["nvidia0", "nvidiactl", "nvidia-modeset", "nvidia-uvm"]:
        d = Path(f"/dev/{dev}")
        if d.exists():
            cmd.extend(["--dev-bind", str(d), str(d)])

    cmd.extend(["--bind", "/dev/shm", "/dev/shm"])

    for dev in ["urandom", "random", "null", "zero", "full"]:
        d = Path(f"/dev/{dev}")
        if d.exists():
            cmd.extend(["--dev-bind", str(d), str(d)])

    # /run/udev (joystick, input)
    cmd.extend(["--ro-bind", "/run/udev", "/run/udev"])

    # Home directory isolado + bind real
    home = str(Path.home())
    cmd.extend(["--tmpfs", "/home"])
    cmd.extend(["--bind", home, home])

    # ENV vars do container
    _add_env(cmd, "PATH", "/usr/bin:/usr/sbin:/bin:/sbin")
    _add_env(cmd, "container", "makai")
    _add_env(cmd, "WINEPREFIX", prefix_container)
    _add_env(cmd, "PROTONPATH", f"{proton_container}")
    _add_env(cmd, "GAMEID", env.get("GAMEID", ""))
    _add_env(cmd, "STEAM_COMPAT_APP_ID", env.get("STEAM_COMPAT_APP_ID", "0"))
    _add_env(cmd, "SteamAppId", env.get("SteamAppId", "0"))
    _add_env(cmd, "SteamGameId", env.get("SteamGameId", "0"))
    _steam_root = str(Path.home() / ".steam" / "steam")
    _add_env(cmd, "STEAM_COMPAT_DATA_PATH", prefix_container)
    _add_env(cmd, "STEAM_COMPAT_INSTALL_PATH", game_container)
    _add_env(cmd, "STEAM_COMPAT_CLIENT_INSTALL_PATH", _steam_root)
    _add_env(cmd, "STEAM_COMPAT_TOOL_PATHS", f"{proton_container}:{str(runtime_path)}")
    _add_env(cmd, "STEAM_COMPAT_MOUNTS", f"{proton_container}:{str(runtime_path)}")
    _add_env(cmd, "STEAM_COMPAT_LIBRARY_PATHS", _steam_root)
    _rl = str(runtime_usr / 'lib')
    _overrides_dir = f"{_rl}/pressure-vessel/overrides"
    _runtime_lib_path = (
        f"{_overrides_dir}/lib/x86_64-linux-gnu:"
        f"{_overrides_dir}/lib/i386-linux-gnu:"
        f"{prefix_container}/overrides/lib:"
        f"{prefix_container}/overrides/lib32:"
        f"{_rl}:"
        f"{_rl}/x86_64-linux-gnu:"
        f"{_rl}/i386-linux-gnu:"
        f"{str(runtime_usr / 'lib64')}:"
        f"{str(runtime_usr / 'lib32')}:"
        f"/run/host/usr/lib:"
        f"/run/host/usr/lib32"
    )
    _add_env(cmd, "STEAM_RUNTIME_LIBRARY_PATH", _runtime_lib_path)
    _add_env(cmd, "LD_LIBRARY_PATH", _runtime_lib_path)

    # GPU ICD paths (via /run/host pois /usr é read-only do runtime)
    _vk_icd = "/run/host/usr/share/vulkan/icd.d/nvidia_icd.json"
    if Path(_vk_icd.replace("/run/host", "")).is_file():
        _add_env(cmd, "VK_ICD_FILENAMES", _vk_icd)
    _egl_vendor = "/run/host/usr/share/glvnd/egl_vendor.d"
    if Path(_egl_vendor.replace("/run/host", "")).is_dir():
        _add_env(cmd, "__EGL_VENDOR_LIBRARY_DIRS", _egl_vendor)

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


def _resolve_runtime_usr(runtime_path: Path) -> Path | None:
    """Resolve o caminho para /usr dentro do runtime.

    Suporta:
    1. Layout tradicional: runtime/files/usr/
    2. Layout content-addressable (steamrt4):
       a. runtime_path/var/tmp-*/usr/
       b. runtime_path.parent/var/tmp-*/usr/
    """
    runtime_files = runtime_path / "files"
    usr_dir = runtime_files / "usr"
    if usr_dir.is_dir():
        return usr_dir

    for base in (runtime_path, runtime_path.parent):
        var_dir = base / "var"
        if var_dir.is_dir():
            candidates = sorted(
                (d for d in var_dir.glob("tmp-*") if (d / "usr").is_dir()),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            if candidates:
                return candidates[0] / "usr"

    return None


def _add_env(cmd: list[str], key: str, val: str) -> None:
    cmd.extend(["--setenv", key, val])
