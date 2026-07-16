"""Geração de /etc/passwd e /etc/group sintéticos para o container.

O pressure-vessel gera passwd/group com apenas o usuário atual
em vez de expor o /etc/passwd completo do host (que pode ter
informações sensíveis ou irrelevantes).

Referência: pressure-vessel/passwd.c (263 linhas)
"""

import os
import tempfile
from pwd import getpwuid


def generate_passwd() -> str:
    uid = os.getuid()
    try:
        pw = getpwuid(uid)
        user = pw.pw_name
        home = pw.pw_dir
    except KeyError:
        user = "user"
        home = "/home/user"

    return (
        "root:x:0:0:root:/root:/bin/bash\n"
        f"{user}:x:{uid}:{uid}:{user}:{home}:/bin/bash\n"
    )


def generate_group() -> str:
    uid = os.getuid()
    try:
        pw = getpwuid(uid)
        user = pw.pw_name
    except KeyError:
        user = "user"

    return (
        "root:x:0:\n"
        f"{user}:x:{uid}:\n"
    )


def write_passwd_files(temp_dir: str) -> tuple[str, str]:
    passwd_path = os.path.join(temp_dir, "passwd")
    group_path = os.path.join(temp_dir, "group")
    with open(passwd_path, "w") as f:
        f.write(generate_passwd())
    with open(group_path, "w") as f:
        f.write(generate_group())
    return passwd_path, group_path
