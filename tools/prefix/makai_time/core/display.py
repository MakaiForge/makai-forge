"""Display and audio mounts for container.

Gerencia X11, Wayland, PipeWire, D-Bus mounts no bwrap.
Extraído da lógica de display_mounts() do container.py original.
"""

import os
import pwd


def x11_args() -> list[str]:
    """Gera args --ro-bind para X11."""
    args = []
    x11_socket = "/tmp/.X11-unix"
    if os.path.isdir(x11_socket):
        args.extend(["--ro-bind", x11_socket, x11_socket])
    return args


def wayland_args(uid: int | None = None) -> list[str]:
    """Gera args --ro-bind para Wayland."""
    args = []
    if uid is None:
        uid = os.getuid()

    # Wayland socket no run dir do usuário
    run_dir = f"/run/user/{uid}"
    wayland_socket = os.path.join(run_dir, "wayland-0")
    if os.path.exists(wayland_socket):
        args.extend(["--ro-bind", wayland_socket, wayland_socket])

    # wayland-1, etc.
    for i in range(1, 4):
        ws = os.path.join(run_dir, f"wayland-{i}")
        if os.path.exists(ws):
            args.extend(["--ro-bind", ws, ws])

    return args


def pipewire_args(uid: int | None = None) -> list[str]:
    """Gera args --ro-bind para PipeWire."""
    args = []
    if uid is None:
        uid = os.getuid()

    run_dir = f"/run/user/{uid}"
    pw_socket = os.path.join(run_dir, "pipewire-0")
    pw_dir = os.path.join(run_dir, "pipewire")
    if os.path.exists(pw_socket):
        args.extend(["--ro-bind", pw_socket, pw_socket])
    if os.path.isdir(pw_dir):
        args.extend(["--ro-bind", pw_dir, pw_dir])

    return args


def pulseaudio_args(uid: int | None = None) -> list[str]:
    """Gera args --ro-bind para PulseAudio (fallback se PipeWire não disponível)."""
    args = []
    if uid is None:
        uid = os.getuid()

    run_dir = f"/run/user/{uid}"
    pa_socket = os.path.join(run_dir, "pulse")
    if os.path.isdir(pa_socket):
        args.extend(["--ro-bind", pa_socket, pa_socket])

    return args


def dbus_args() -> list[str]:
    """Gera args --ro-bind para D-Bus."""
    args = []
    dbus_system = "/run/dbus"
    if os.path.isdir(dbus_system):
        args.extend(["--ro-bind", dbus_system, dbus_system])
    return args


def user_run_args(uid: int | None = None) -> list[str]:
    """Gera args --ro-bind para /run/user/<uid> (agrupa Wayland + PipeWire + D-Bus session)."""
    args = []
    if uid is None:
        uid = os.getuid()

    run_dir = f"/run/user/{uid}"
    if os.path.isdir(run_dir):
        # Monta o diretório inteiro como ro-bind
        args.extend(["--ro-bind", run_dir, run_dir])

    return args


def all_display_args(uid: int | None = None) -> list[str]:
    """Gera todos os args de display + áudio combinados."""
    args = []
    args.extend(x11_args())
    args.extend(wayland_args(uid))
    args.extend(pipewire_args(uid))
    args.extend(pulseaudio_args(uid))
    args.extend(dbus_args())
    return args
