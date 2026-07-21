"""Health Check do prefixo — compara scanner com knowledge base e gera relatório."""

import json
import os
from typing import Optional

from . import scanner

_KNOWLEDGE_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), *([".."] * 4), "knowledge", "index.json")
)


def _load_knowledge() -> dict:
    with open(_KNOWLEDGE_PATH) as f:
        return json.load(f)


def _get_wine_version_numeric(version_str: Optional[str]) -> float:
    """Converte '10.11' → 10.11 para comparação."""
    if not version_str:
        return 0.0
    try:
        return float(version_str)
    except ValueError:
        m = __import__("re").search(r"(\d+\.\d+)", version_str)
        return float(m.group(1)) if m else 0.0


def check_component(knowledge: dict, verb_id: str, scan_result: dict) -> dict:
    """Verifica um componente específico no prefixo."""
    verbs = knowledge.get("verbs", {})
    info = verbs.get(verb_id)
    if not info:
        return {"verb": verb_id, "status": "unknown", "reason": "verb não encontrado no knowledge base"}

    verify = info.get("verify", {})
    issues = []

    # Verificar registry
    for reg_key in verify.get("registry", []):
        if not scanner.check_registry_key(scan_result["prefix_path"], reg_key):
            issues.append(f"registry key not found: {reg_key}")

    # Verificar DLLs
    for dll in verify.get("dll", []):
        if not scanner.check_dll_exists(scan_result["prefix_path"], dll):
            issues.append(f"dll not found: {dll}")

    # Verificar versão do Wine
    wine_info = info.get("wine", {})
    wine_ver = _get_wine_version_numeric(scan_result.get("wine_version"))
    wine_min = _get_wine_version_numeric(wine_info.get("minimum", "0"))
    if wine_ver < wine_min:
        issues.append(f"wine {scan_result['wine_version']} < minimum required {wine_info['minimum']}")

    # Verificar arquitetura
    supports = info.get("supports", {})
    arch = scan_result.get("arch", "win64")
    if arch == "win64" and not supports.get("wow64", True):
        issues.append(f"component requires win32 prefix (current: {arch})")

    # Verificar Mono (conflitos)
    if verb_id in ("dotnet40", "dotnet48"):
        if scan_result.get("mono_installed"):
            issues.append("Wine Mono detectado — conflito conhecido, necessário remover")

    if issues:
        return {"verb": verb_id, "status": "incomplete", "issues": issues}
    return {"verb": verb_id, "status": "installed"}


def check_all(knowledge: dict, scan_result: dict, verbs: Optional[list[str]] = None) -> dict:
    """Verifica múltiplos componentes. Se verbs=None, verifica todos do knowledge base."""
    all_verbs = verbs or list(knowledge.get("verbs", {}).keys())
    results = []
    for v in all_verbs:
        results.append(check_component(knowledge, v, scan_result))
    return {"results": results}


def check_compatibility(scan_result: dict) -> list[dict]:
    """Verifica compatibilidade geral do prefixo."""
    issues = []

    # Wine version
    wine_ver = scan_result.get("wine_version")
    if not wine_ver:
        issues.append({"severity": "error", "message": "Não foi possível detectar versão do Wine"})
    elif _get_wine_version_numeric(wine_ver) < 7.0:
        issues.append({"severity": "warning", "message": f"Wine {wine_ver} é antigo. Recomendado >= 7.0"})

    # Mono vs .NET
    if scan_result.get("mono_installed"):
        issues.append({
            "severity": "info",
            "message": "Wine Mono instalado — conflita com .NET Framework nativo",
            "suggestion": "Remover Mono antes de instalar dotnet40+"
        })

    return issues


def generate_report(prefix_path: str, target_verbs: Optional[list[str]] = None) -> dict:
    """Gera relatório completo de saúde do prefixo."""
    scan_result = scanner.scan(prefix_path)
    knowledge = _load_knowledge()

    return {
        "prefix": scan_result,
        "compatibility": check_compatibility(scan_result),
        "components": check_all(knowledge, scan_result, target_verbs),
    }
