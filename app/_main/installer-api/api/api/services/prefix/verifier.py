"""Verificador pós-instalação — confirma que um verb foi instalado corretamente."""

import json
import os
import subprocess
from pathlib import Path
from typing import Optional

from . import scanner

_KNOWLEDGE_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), *([".."] * 4), "knowledge", "index.json")
)


def _load_knowledge() -> dict:
    with open(_KNOWLEDGE_PATH) as f:
        return json.load(f)


def verify_verb(prefix_path: str, verb_id: str) -> dict:
    """Verifica se um verb específico foi instalado corretamente no prefixo.

    Usa as regras de verificação do knowledge base:
    - Chaves de registro
    - DLLs
    - Arquivos
    - Simetrias (wineboot --check)

    Returns:
        {
            "verb": "dotnet48",
            "status": "installed" | "incomplete" | "missing",
            "checks": [
                {"type": "registry", "target": "...", "found": true},
                {"type": "dll", "target": "dotnet48.installed.workaround", "found": true}
            ]
        }
    """
    knowledge = _load_knowledge()
    verbs = knowledge.get("verbs", {})
    info = verbs.get(verb_id)

    if not info:
        return {"verb": verb_id, "status": "unknown", "reason": "verb não encontrado no knowledge base"}

    verify = info.get("verify", {})
    checks = []

    # Verificar chaves de registro
    for reg_key in verify.get("registry", []):
        found = scanner.check_registry_key(prefix_path, reg_key)
        checks.append({"type": "registry", "target": reg_key, "found": found})

    # Verificar DLLs
    for dll in verify.get("dll", []):
        found = scanner.check_dll_exists(prefix_path, dll)
        checks.append({"type": "dll", "target": dll, "found": found})

    # Verificar workaround file (alguns verbs criam arquivos .installed.workaround)
    workaround = Path(prefix_path) / "drive_c" / "windows" / f"{verb_id}.installed.workaround"
    if workaround.exists():
        checks.append({"type": "workaround_file", "target": str(workaround), "found": True})

    # Verificar lock/cache do winetricks
    cache_dir = Path(os.path.expanduser("~/.cache/winetricks")) / verb_id
    if cache_dir.exists() and any(cache_dir.iterdir()):
        checks.append({"type": "cache", "target": str(cache_dir), "found": True})

    # Determinar status
    all_found = all(c["found"] for c in checks)
    any_found = any(c["found"] for c in checks)

    if all_found and checks:
        status = "installed"
    elif any_found:
        status = "incomplete"
    else:
        status = "missing"

    return {
        "verb": verb_id,
        "status": status,
        "checks": checks,
    }


def run_shell_check(prefix_path: str, verb_id: str) -> dict:
    """Executa verificações via shell (Makaitricks) para verbs que têm lógica extra."""
    makai = os.path.abspath(
        os.path.join(os.path.dirname(__file__), *([".."] * 5), "Makaitricks")
    )
    if not os.path.exists(makai):
        return {"verb": verb_id, "shell_check": "Makaitricks not found"}

    try:
        result = subprocess.run(
            ["bash", "-c", f"source {makai} && w_verify_{verb_id} 2>&1 || true"],
            capture_output=True, text=True, timeout=30,
            env={**os.environ, "WINEPREFIX": prefix_path, "WINE": "/usr/bin/wine"}
        )
        return {
            "verb": verb_id,
            "shell_check": result.stdout.strip() or result.stderr.strip() or "no output",
        }
    except Exception as e:
        return {"verb": verb_id, "shell_check": f"error: {e}"}


def verify_all(prefix_path: str, verbs: Optional[list[str]] = None) -> dict:
    """Verifica múltiplos verbs. Se verbs=None, verifica todos do knowledge base."""
    knowledge = _load_knowledge()
    all_verbs = verbs or list(knowledge.get("verbs", {}).keys())
    results = []
    for v in all_verbs:
        results.append(verify_verb(prefix_path, v))
    return {"results": results}
