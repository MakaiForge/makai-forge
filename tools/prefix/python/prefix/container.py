"""
Custom Bubblewrap container runtime para Proton/Wine.

Usa steamrt4 como root filesystem + GPU/audio/display do host.
Alternativa ao pressure-vessel/_v2-entry-point.
"""

import os
import shutil
import pwd
import subprocess
from pathlib import Path

STEAM_RUNTIME_DIR = os.path.expanduser("~/.local/share/makaiforge/steamrt4")


# ── Helpers ──────────────────────────────────────────────────────────────────

def _find_bwrap() -> str:
    path = shutil.which("bwrap")
    if not path:
        raise RuntimeError("bubblewrap (bwrap) não encontrado no sistema")
    return path


def _find_runtime_root() -> Path | None:
    rt = Path(STEAM_RUNTIME_DIR)
    if not rt.is_dir():
        return None
    for p in sorted(rt.iterdir()):
        if p.is_dir() and p.name.startswith("steamrt"):
            return p / "files"
    return None


def _host_lib_paths() -> list[str]:
    """Caminhos comuns de libs do host (GPU drivers)."""
    return [
        "/usr/lib/x86_64-linux-gnu",
        "/usr/lib/i386-linux-gnu",
        "/usr/lib64",
        "/usr/lib",
    ]


# ── GPU detection ────────────────────────────────────────────────────────────

def detect_gpu_vendor() -> str:
    """Retorna 'nvidia', 'amd', 'intel' ou 'unknown'."""
    if os.path.isfile("/proc/driver/nvidia/version"):
        return "nvidia"
    for p in _host_lib_paths():
        if os.path.isfile(os.path.join(p, "libvulkan_radeon.so")):
            return "amd"
        if os.path.isfile(os.path.join(p, "libvulkan_intel.so")):
            return "intel"
    return "unknown"


def _nvidia_driver_files() -> list[str]:
    """Lista de libs NVIDIA essenciais para montar do host."""
    libs = [
        "libnvidia-glcore.so.*",
        "libnvidia-glvkspirv.so.*",
        "libnvidia-rtcore.so.*",
        "libnvidia-tls.so.*",
        "libnvidia-eglcore.so.*",
        "libGLX_nvidia.so.*",
        "libEGL_nvidia.so.*",
        "libcuda.so.*",
        "libnvidia-ml.so.*",
        "libnvidia-allocator.so.*",
        "libnvidia-gpucomp.so.*",
    ]
    icd = "/usr/share/vulkan/icd.d/nvidia_icd.json"
    json_files = [icd] if os.path.isfile(icd) else []
    # Encontrar caminho real de cada lib
    found = []
    for name in libs:
        for hlp in _host_lib_paths():
            matches = sorted(Path(hlp).glob(name))
            if matches:
                found.extend(str(m) for m in matches)
    return found + json_files


def _mesa_driver_files() -> list[str]:
    """Lista de libs Mesa (AMD/Intel) essenciais."""
    libs = [
        "libvulkan_radeon.so",
        "libvulkan_intel.so",
        "libGLX_mesa.so.*",
        "libEGL_mesa.so.*",
        "libgbm.so.*",
        "libglapi.so.*",
    ]
    dri = "/usr/lib/x86_64-linux-gnu/dri"
    dri_files = []
    if os.path.isdir(dri):
        for f in os.listdir(dri):
            if f.endswith("_dri.so"):
                dri_files.append(os.path.join(dri, f))

    found = []
    for name in libs:
        for hlp in _host_lib_paths():
            matches = sorted(Path(hlp).glob(name))
            if matches:
                found.extend(str(m) for m in matches)

    for icd_dir in ["/usr/share/vulkan/icd.d", "/etc/vulkan/icd.d"]:
        if os.path.isdir(icd_dir):
            for f in os.listdir(icd_dir):
                found.append(os.path.join(icd_dir, f))
    return found + dri_files


def gpu_bind_mounts() -> list[str]:
    """Monta paths do host que EXISTEM (bwrap cria target, root r/o)."""
    args = []
    # Só monta lib paths que existem no host E no container
    for path in _host_lib_paths():
        if os.path.isdir(path) and os.path.isdir(path):  # target = source
            args.extend(["--ro-bind", path, path])
    # ICD (Vulkan) — só se o parent dir existir no container
    for icd in ["/usr/share/vulkan/icd.d", "/etc/vulkan/icd.d"]:
        parent = os.path.dirname(icd)
        if os.path.isfile(icd) and os.path.isdir(parent):
            args.extend(["--ro-bind", icd, icd])
    # Mesa DRI drivers
    for dri in ["/usr/lib/x86_64-linux-gnu/dri", "/usr/lib/dri", "/usr/lib64/dri"]:
        if os.path.isdir(dri):
            args.extend(["--ro-bind", dri, dri])
    return args


# ── Display / Audio / D-Bus ─────────────────────────────────────────────────

def display_mounts() -> list[str]:
    args = []
    uid = os.getuid()
    user = pwd.getpwuid(uid).pw_name
    run_user = f"/run/user/{uid}"

    # X11
    if os.path.isdir("/tmp/.X11-unix"):
        args.extend(["--ro-bind", "/tmp/.X11-unix", "/tmp/.X11-unix"])
    args.extend(["--setenv", "DISPLAY", os.environ.get("DISPLAY", ":0")])

    # Wayland
    wayland_display = os.environ.get("WAYLAND_DISPLAY", "")
    if wayland_display:
        wl_path = os.path.join(run_user, wayland_display)
        if os.path.exists(wl_path):
            args.extend(["--ro-bind", wl_path, wl_path])
            args.extend(["--setenv", "WAYLAND_DISPLAY", wayland_display])
            args.extend(["--setenv", "XDG_SESSION_TYPE", "wayland"])

    # XDG_RUNTIME_DIR (necessário para Wayland/PipeWire/Pulse)
    if os.path.isdir(run_user):
        args.extend([
            "--ro-bind", run_user, run_user,
            "--setenv", "XDG_RUNTIME_DIR", run_user,
        ])

    # D-Bus system socket
    if os.path.isdir("/run/dbus"):
        args.extend(["--ro-bind", "/run/dbus", "/run/dbus"])

    return args


# ── Construção do comando ───────────────────────────────────────────────────

def build_bwrap_cmd(
    command: list[str],
    *,
    game_path: str | None = None,
    prefix_path: str | None = None,
    proton_path: str | None = None,
    env_extra: dict | None = None,
    runtime_root: Path | None = None,
) -> list[str]:
    """Monta o comando bwrap completo.

    Usa steamrt4 como root filesystem, monta GPU/audio/display/D-Bus do host,
    bind-mounta o prefixo, Proton e jogo, e executa <command> dentro.
    """
    bwrap = _find_bwrap()
    uid = os.getuid()
    home = os.environ.get("HOME", "/root")

    cmd = [
        bwrap,
        "--unshare-all",
        "--share-net",
        "--die-with-parent",
        "--new-session",
        "--hostname", "makaiforge",

        # Host root como base (read-only)
        "--ro-bind", "/", "/",

        # /dev próprio sobrepõe o do host (cria devtmpfs acessível)
        "--dev", "/dev",

        # Writable paths necessários
        "--tmpfs", "/tmp",
        "--bind", "/dev/shm", "/dev/shm",

    # GPU device access (precisa vir DEPOIS de --dev)
    "--dev-bind", "/dev/dri", "/dev/dri",
    "--dev-bind", "/dev/nvidia0", "/dev/nvidia0",
    "--dev-bind", "/dev/nvidiactl", "/dev/nvidiactl",
    "--dev-bind", "/dev/nvidia-modeset", "/dev/nvidia-modeset",
    "--dev-bind", "/dev/nvidia-uvm", "/dev/nvidia-uvm",
    "--dev-bind", "/dev/nvidia-uvm-tools", "/dev/nvidia-uvm-tools",
    ]

    # Se temos steamrt4, monta /lib sobre o do host (runtime prevalece)
    # Só monta se o alvo existir no host (bwrap falha se não existir)
    rt = runtime_root or _find_runtime_root()
    if rt and rt.is_dir():
        for sub in ("lib",):
            src = os.path.join(rt, sub)
            if os.path.isdir(src) and os.path.isdir(os.path.join("/", sub)):
                cmd.extend(["--ro-bind", src, os.path.join("/", sub)])

    # GPU drivers do host (montados DEPOIS do runtime, para sobrepor)
    cmd.extend(gpu_bind_mounts())

    # Display + Audio + D-Bus + /run/user
    cmd.extend(display_mounts())

    # HOME (writable — Proton/precisa escrever .cache, .wine etc)
    cmd.extend(["--setenv", "HOME", home])
    cmd.extend(["--bind", home, home])

    # Game
    if game_path:
        resolved_game = os.path.realpath(os.path.expanduser(game_path))
        cmd.extend(["--ro-bind", resolved_game, resolved_game])

    # Prefix (read-write)
    if prefix_path:
        resolved_pfx = os.path.realpath(os.path.expanduser(prefix_path))
        cmd.extend(["--bind", resolved_pfx, resolved_pfx])

    # Proton
    if proton_path:
        resolved_proton = os.path.realpath(os.path.expanduser(proton_path))
        # Proton precisa de ser read-write para criar compatdata etc.
        cmd.extend(["--bind", resolved_proton, resolved_proton])

    # PATH mínimo dentro do container
    cmd.extend([
        "--setenv", "PATH", "/usr/bin:/bin:/usr/sbin:/sbin",
        "--setenv", "USER", pwd.getpwuid(uid).pw_name,
        "--setenv", "LANG", os.environ.get("LANG", "C.UTF-8"),
        "--setenv", "LC_ALL", os.environ.get("LC_ALL", "C.UTF-8"),
        "--setenv", "TERM", os.environ.get("TERM", "xterm-256color"),
    ])

    # Env vars extras
    if env_extra:
        for k, v in env_extra.items():
            cmd.extend(["--setenv", k, v])

    # Comando
    cmd.append("--")
    cmd.extend(command)

    return cmd


def run_in_container(
    command: list[str],
    *,
    game_path: str | None = None,
    prefix_path: str | None = None,
    proton_path: str | None = None,
    env_extra: dict | None = None,
    capture_output: bool = False,
) -> subprocess.Popen | subprocess.CompletedProcess:
    """Roda <command> dentro do container Bubblewrap + steamrt4.

    Se capture_output=True, retorna CompletedProcess.
    Caso contrário, retorna Popen (stdout/stderr vão para o terminal).
    """
    cmd = build_bwrap_cmd(
        command,
        game_path=game_path,
        prefix_path=prefix_path,
        proton_path=proton_path,
        env_extra=env_extra,
    )

    if capture_output:
        return subprocess.run(
            cmd,
            capture_output=True,
            text=False,
            timeout=3600,
        )
    return subprocess.Popen(
        cmd,
        stdout=None,
        stderr=None,
        start_new_session=True,
    )
