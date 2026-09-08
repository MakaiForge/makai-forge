"""
core/engine/makaitricks.py — Makaitricks wrapper.

Makaitricks é o winetricks do projeto.
Localizado em: app/_resources/binaries/Makaitricks
"""

import os
import subprocess

MAKAITRICKS_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
    "_resources", "binaries", "Makaitricks"
)


def _find_wine_binary(proton_path: str) -> str | None:
    """Localiza o binário wine dentro do diretório Proton."""
    proto_dir = os.path.dirname(proton_path)
    candidates = [
        os.path.join(proto_dir, "files", "bin", "wine"),
        os.path.join(proto_dir, "dist", "bin", "wine"),
        os.path.join(proto_dir, "bin", "wine"),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    return None


def run(component: str, prefix_path: str, proton_path: str) -> dict:
    if not os.path.isfile(MAKAITRICKS_PATH):
        return {"success": False, "error": f"Makaitricks não encontrado em {MAKAITRICKS_PATH}"}

    env = os.environ.copy()
    pfx_dir = os.path.join(prefix_path, "pfx")
    env["WINEPREFIX"] = pfx_dir if os.path.isdir(pfx_dir) else prefix_path

    wine_binary = _find_wine_binary(proton_path)
    if wine_binary:
        wine_bin = os.path.dirname(wine_binary)
        env["PATH"] = wine_bin + os.pathsep + env.get("PATH", "")

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
