"""Motor de recomendações de áudio — desacoplado do analyzer.

Recebe um AudioResult e retorna recomendações sem saber
de onde o resultado veio (análise estática, runtime, etc).
"""

from __future__ import annotations

import logging
from typing import Any

from engine.intel.audio.models import AudioResult
from engine.intel.audio.knowledge.middleware import get_middleware_info

log = logging.getLogger("engine.intel.audio.recommendations")


PROTON_DRIVER_MAP: dict[str, str] = {
    "winepipewire": "Proton-CachyOS 20260702+, Wine 10.x+",
    "winepulse": "GE-Proton, UMU-Proton, Proton-CachyOS (<20260702)",
    "winealsa": "Qualquer Proton (fallback)",
}


def recommend(result: AudioResult) -> dict[str, Any]:
    """Gera recomendações baseadas no AudioResult.

    Retorna dict com:
    - preferred_driver: driver Wine recomendado
    - env_vars: variáveis de ambiente sugeridas
    - proton_hint: sugestão de fork de Proton
    - notes: observações relevantes
    """
    recommendations: dict[str, Any] = {
        "preferred_driver": None,
        "proton_hint": None,
        "env_vars": {},
        "dsoal": False,
        "notes": [],
        "avoid": [],
    }

    if not result.middleware:
        return _recommend_fallback(recommendations)

    info = get_middleware_info(result.middleware)

    if info:
        recommendations["preferred_driver"] = info["preferred_wine_driver"]
        recommendations["dsoal"] = info["needs_dsoal"]

        driver_proton = PROTON_DRIVER_MAP.get(info["preferred_wine_driver"])
        if driver_proton:
            recommendations["proton_hint"] = driver_proton

        if info.get("known_issues"):
            for issue in info["known_issues"]:
                recommendations["notes"].append(issue)

        if info["preferred_wine_driver"] == "winepulse":
            recommendations["env_vars"]["WINEDLLOVERRIDES"] = "dsound=native,builtin"
        elif info["preferred_wine_driver"] == "winepipewire":
            recommendations["env_vars"]["WINEDLLOVERRIDES"] = "mmdevapi=native,builtin"

        if info["needs_dsoal"]:
            recommendations["env_vars"].update({
                "DSOAL_LOGLEVEL": "0",
            })

    # Cross-reference: se o jogo usa WASAPI mas o middleware
    # precisa de DS3D, pode ser problema
    if result.backend == "mmdevapi" and result.needs_dsoal:
        recommendations["avoid"].append(
            "Wine 10+ com mmdevapi pode quebrar áudio 3D para este middleware"
        )
        recommendations["notes"].append(
            "Tente Proton com winepulse.drv (GE-Proton, UMU-Proton) para comparar"
        )

    if result.middleware == "OpenAL Soft" and result.backend == "mmdevapi":
        recommendations["notes"].append(
            "OpenAL Soft via WASAPI não suporta posicionamento 3D nativo. "
            "Se o jogo depende de OpenAL 3D, verifique se o mixing é interno."
        )

    return recommendations


def _recommend_fallback(recommendations: dict[str, Any]) -> dict[str, Any]:
    """Recomendação genérica quando não identificamos o middleware."""
    recommendations["preferred_driver"] = "winepipewire"
    recommendations["proton_hint"] = "Proton-CachyOS (recente)"
    recommendations["notes"].append(
        "Middleware de áudio não identificado. Usando configuração genérica."
    )
    return recommendations


def format_recommendations(recommendations: dict[str, Any], result: AudioResult) -> list[str]:
    """Formata recomendações para exibição amigável."""
    lines: list[str] = []
    lines.append(f"Middleware: {result.middleware or 'Não identificado'}")
    lines.append(f"API detectada: {result.api or 'N/A'}")
    lines.append(f"Backend: {result.backend or 'N/A'}")
    lines.append(f"Confiança: {result.confidence:.0%}")

    driver = recommendations.get("preferred_driver")
    proton = recommendations.get("proton_hint")
    dsoal = recommendations.get("dsoal")
    env = recommendations.get("env_vars", {})

    if driver:
        lines.append(f"Driver recomendado: {driver}")
    if proton:
        lines.append(f"Proton sugerido: {proton}")
    if dsoal:
        lines.append("DSOAL: RECOMENDADO (para restaurar áudio 3D)")
    else:
        lines.append("DSOAL: Não necessário")

    if env:
        lines.append(f"ENV: {env}")

    for note in recommendations.get("notes", []):
        lines.append(f"⚠ {note}")

    for avoid in recommendations.get("avoid", []):
        lines.append(f"✗ {avoid}")

    return lines
