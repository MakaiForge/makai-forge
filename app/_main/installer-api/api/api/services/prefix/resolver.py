"""Resolvedor de dependências — calcula ordem de instalação, detecta conflitos."""

import json
import os
from typing import Optional

_KNOWLEDGE_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), *([".."] * 4), "knowledge", "index.json")
)


def _load_knowledge() -> dict:
    with open(_KNOWLEDGE_PATH) as f:
        return json.load(f)


def resolve(verb_id: str, installed: Optional[set[str]] = None) -> dict:
    """Resolve dependências de um verb e retorna plano de instalação ordenado.

    Args:
        verb_id: Nome do verb (ex: 'dotnet48')
        installed: Conjunto de verbs já instalados (opcional)

    Returns:
        {
            "plan": ["remove_mono", "corefonts", "gdiplus", "dotnet40", "dotnet48"],
            "conflicts": ["wine-mono"],
            "dependencies": ["corefonts", "gdiplus", "dotnet40"],
            "estimated_time": 900,
            "needs_restart": true
        }
    """
    knowledge = _load_knowledge()
    verbs = knowledge.get("verbs", {})
    installed = installed or set()

    info = verbs.get(verb_id)
    if not info:
        return {"error": f"verb '{verb_id}' não encontrado no knowledge base"}

    deps = info.get("dependencies", [])
    conflicts = info.get("conflicts", [])

    # Resolver dependências recursivamente (sem ciclos)
    all_deps: list[str] = []
    seen: set[str] = set()

    def _resolve(v: str):
        if v in seen or v in installed:
            return
        seen.add(v)
        v_info = verbs.get(v)
        if v_info:
            for dep in v_info.get("dependencies", []):
                _resolve(dep)
        all_deps.append(v)

    for dep in deps:
        _resolve(dep)

    # Plano final: primeiro resolve conflitos, depois dependências, depois o verb
    plan = []
    for c in conflicts:
        if c not in installed:
            plan.append(c)
    plan.extend(all_deps)
    if verb_id not in installed:
        plan.append(verb_id)

    # Estimar tempo total
    total_time = 0
    for step in plan:
        step_info = verbs.get(step, {})
        total_time += step_info.get("estimated_time", 30)
    total_time += info.get("estimated_time", 60)

    return {
        "plan": plan,
        "conflicts": conflicts,
        "dependencies": all_deps,
        "estimated_time": total_time,
        "needs_restart": info.get("needs_restart", False),
    }


def simulate(verb_id: str, installed: Optional[set[str]] = None) -> dict:
    """Simula a instalação sem executar — retorna o plano e estimativas."""
    result = resolve(verb_id, installed)
    if "error" in result:
        return result

    knowledge = _load_knowledge()
    verbs = knowledge.get("verbs", {})

    steps = []
    for step_id in result["plan"]:
        info = verbs.get(step_id, {})
        steps.append({
            "verb": step_id,
            "category": info.get("category", "unknown"),
            "estimated_time": info.get("estimated_time", 30),
            "windows_version": info.get("windows_version", "winxp"),
        })

    # Calcular espaço estimado (aproximado)
    estimated_space = len(result["plan"]) * 150  # ~150MB por componente

    return {
        "verb": verb_id,
        "steps": steps,
        "total_estimated_time": result["estimated_time"],
        "estimated_space_mb": estimated_space,
        "needs_restart": result["needs_restart"],
        "warnings": result.get("conflicts", []),
    }
