import os
from functools import cache
from pathlib import Path
from shutil import which
from subprocess import PIPE, Popen


@cache
def get_libc() -> str:
    from ctypes.util import find_library
    return find_library("c") or ""


@cache
def get_library_paths() -> set[str]:
    library_paths: set[str] = set()
    ldconfig = which("ldconfig", path=os.environ.get("PATH", "/sbin:/usr/sbin"))
    if not ldconfig:
        return library_paths
    try:
        with Popen(
            (ldconfig, "-p"),
            text=True,
            encoding="utf-8",
            stdout=PIPE,
            env={"LC_ALL": "C", "LANG": "C"},
        ) as proc:
            if not proc.stdout:
                return library_paths
            for line in proc.stdout:
                parts = line.split()
                if not parts:
                    continue
                path = parts[-1]
                prefix = path[: path.rfind("/")]
                if not path.startswith("/") or prefix in set(library_paths):
                    continue
                library_paths.add(os.path.realpath(prefix))
    except OSError:
        pass
    return library_paths
