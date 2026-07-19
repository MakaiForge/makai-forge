import os
import threading
from _ctypes import CFuncPtr
from ctypes import CDLL, c_int, c_ulong
from pathlib import Path
from subprocess import Popen

from makrun.consts import PR_SET_CHILD_SUBREAPER, GamescopeAtom
from makrun.log import log
from makrun.util.display import xdisplay
from makrun.util.system import get_libc


def run_command(command: tuple[Path | str, ...]) -> int:
    libc = get_libc()
    prctl = CDLL(libc).prctl
    prctl.restype = c_int
    prctl.argtypes = [c_int, c_ulong, c_ulong, c_ulong, c_ulong]
    prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0, 0)

    # Preserva o FD do seccomp (se existir) — Popen fecha todos FDs >= 3
    pass_fds: list[int] = []
    try:
        from makrun.core.seccomp import get_seccomp_read_fd
        fd = get_seccomp_read_fd()
        if fd is not None:
            pass_fds.append(fd)
    except Exception:
        pass

    with Popen(command, start_new_session=True, pass_fds=pass_fds) as proc:
        log.debug("Child PID: %s", proc.pid)
        return proc.wait()


def _get_pids():
    from pathlib import Path as P
    yield from (int(p.name) for p in P("/proc").glob("*") if p.name.isdigit())


def get_pstree_from_pid(root_pid: int) -> set[int]:
    descendants: set[int] = set()
    pid_to_ppid: dict[int, int] = {}
    for pid in _get_pids():
        try:
            st = Path(f"/proc/{pid}/status")
            with st.open() as f:
                ppid_line = next(line for line in f if line.startswith("PPid:"))
            pid_to_ppid[pid] = int(ppid_line.removeprefix("PPid:").strip())
        except (FileNotFoundError, ProcessLookupError, ValueError):
            continue
    stack = [root_pid]
    while stack:
        cur = stack.pop()
        for pid, ppid in pid_to_ppid.items():
            if ppid == cur and pid not in descendants:
                descendants.add(pid)
                stack.append(pid)
    return descendants
