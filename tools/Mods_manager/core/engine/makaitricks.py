"""
core/engine/makaitricks.py — Makaitricks wrapper.

Makaitricks é o winetricks do projeto.
Localizado em: ~/Documentos/Makai-forge/data/install-api/Makaitricks
"""

import os
import subprocess

MAKAITRICKS_PATH = os.path.expanduser(
    "~/Documentos/Makai-forge/data/install-api/Makaitricks"
)


def run(component: str, prefix_path: str, proton_path: str) -> dict:
    if not os.path.isfile(MAKAITRICKS_PATH):
        return {"success": False, "error": f"Makaitricks não encontrado em {MAKAITRICKS_PATH}"}

    env = os.environ.copy()
    env["STEAM_COMPAT_DATA_PATH"] = prefix_path
    env["WINEPREFIX"] = os.path.join(prefix_path, "pfx")

    try:
        result = subprocess.run(
            [MAKAITRICKS_PATH, component],
            env=env,
            timeout=180,
            capture_output=True,
            text=True,
        )
        return {
            "success": result.returncode == 0,
            "output": result.stdout[-500:] if result.stdout else "",
            "error": result.stderr[-500:] if result.stderr and result.returncode != 0 else None,
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": f"Makaitricks timeout para {component}"}
    except FileNotFoundError as e:
        return {"success": False, "error": str(e)}


def run_multiple(components: list[str], prefix_path: str, proton_path: str) -> dict:
    results = []
    all_ok = True

    for component in components:
        res = run(component, prefix_path, proton_path)
        results.append({"component": component, **res})
        if not res["success"]:
            all_ok = False

    return {"success": all_ok, "results": results}


def is_available() -> bool:
    return os.path.isfile(MAKAITRICKS_PATH)
