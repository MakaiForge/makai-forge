"""Gamescope window monitoring.

Observa janelas criadas pelo processo do jogo e seta o atom
STEAM_GAME para que o Gamescope as reconheça como janelas de jogo.

Referência: umu-run/umu_run.py:monitor_windows() (linha 360)
           umu-run/umu_run.py:set_steam_game_property() (linha 280)
           pressure-vessel/dialog-ui.c:237 (XInternAtom STEAM_GAME)
"""

import os
import time
import threading
from Xlib import X, display, Xatom


def set_steam_game_property(
    d: display.Display, window_ids: list[int], appid: int
) -> None:
    atom = d.get_atom("STEAM_GAME")
    for wid in window_ids:
        try:
            window = d.create_resource_object("window", wid)
            window.change_property(atom, Xatom.CARDINAL, 32, [appid])
        except Exception:
            pass


def get_window_ids(d: display.Display) -> set[int]:
    root = d.screen().root
    return _collect_windows(root, d)


def _collect_windows(node, d: display.Display, depth: int = 0) -> set[int]:
    if depth > 10:
        return set()
    ids = {node.id}
    try:
        children = node.query_tree().children
        for child in children:
            ids |= _collect_windows(child, d, depth + 1)
    except Exception:
        pass
    return ids


def get_pstree_window_ids(
    d: display.Display, pstree: set[int], all_window_ids: set[int]
) -> list[int]:
    game_windows = []
    for wid in all_window_ids:
        try:
            w = d.create_resource_object("window", wid)
            pid = w.get_full_property(d.get_atom("_NET_WM_PID"), Xatom.CARDINAL)
            if pid and pid.value and pid.value[0] in pstree:
                game_windows.append(wid)
        except Exception:
            pass
    return game_windows


def collect_pids(pid: int) -> set[int]:
    pids = {pid}
    try:
        proc = f"/proc/{pid}/task"
        for tid in os.listdir(proc):
            children = f"/proc/{pid}/task/{tid}/children"
            if os.path.isfile(children):
                with open(children) as f:
                    for child_pid in f.read().strip().split():
                        if child_pid:
                            pids.add(int(child_pid))
                            pids |= collect_pids(int(child_pid))
    except (OSError, ValueError):
        pass
    return pids


def monitor_windows(pid: int, appid: int = 0, interval: float = 1.0) -> None:
    def _loop():
        try:
            d = display.Display()
        except Exception:
            return
        try:
            while True:
                try:
                    pstree = collect_pids(pid)
                    all_windows = get_window_ids(d)
                    game_windows = get_pstree_window_ids(d, pstree, all_windows)
                    if game_windows:
                        set_steam_game_property(d, game_windows, appid)
                except Exception:
                    pass
                time.sleep(interval)
        finally:
            d.close()

    t = threading.Thread(target=_loop, daemon=True)
    t.start()
