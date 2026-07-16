"""Discord IPC socket binding.

Monta sockets Discord-IPC dentro do container para que o jogo
possa se comunicar com o client Discord do host (rich presence,
"Jogando XYZ").

Referência: pressure-vessel/wrap-discord.c (linhas 53-96)
"""

import os


def discord_ipc_args(uid: int | None = None) -> list[str]:
    args = []
    if uid is None:
        uid = os.getuid()

    run_dir = os.environ.get("XDG_RUNTIME_DIR", f"/run/user/{uid}")
    if not os.path.isdir(run_dir):
        return args

    for entry in sorted(os.listdir(run_dir)):
        if entry.startswith("discord-ipc-"):
            socket_path = os.path.join(run_dir, entry)
            if os.path.exists(socket_path):
                args.extend(["--ro-bind", socket_path, socket_path])

    return args
