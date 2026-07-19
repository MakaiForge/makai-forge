"""Orquestrador das 4 camadas de análise.

Pipeline:
  1. imports  → analisa imports PE do .exe
  2. dlls     → escaneia diretório do jogo por DLLs de áudio
  3. signatures → identifica middleware por assinatura de bytes
  4. runtime  → parseia log WINEDEBUG se disponível

Cada camada é independente e contribui evidências para o resultado final.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from makrun.intel.audio.models import AudioResult, AudioEvidence
from makrun.intel.audio.detectors.imports import analyze_pe_imports
from makrun.intel.audio.detectors.dlls import scan_game_directory
from makrun.intel.audio.detectors.signatures import identify_middleware, is_pe_dll
from makrun.intel.audio.detectors.runtime import parse_runtime_log
from makrun.intel.audio.cache import load_cached_analysis, save_cached_analysis
from makrun.intel.audio.knowledge.middleware import get_middleware_info
from makrun.intel.audio.knowledge.engines import guess_engine_from_dlls
from makrun.intel.audio.knowledge.recommendations import recommend

log = logging.getLogger("makrun.intel.audio.analyzer")


def analyze(
    game_dir: str | Path,
    exe_path: str | Path | None = None,
    runtime_log: str | None = None,
    use_cache: bool = True,
    force: bool = False,
) -> AudioResult:
    """Analisa sistema de áudio de um jogo.

    Args:
        game_dir: diretório raiz do jogo (prefixo ou instalacao)
        exe_path: caminho do executável principal (opcional)
        runtime_log: caminho de log WINEDEBUG existente (opcional)
        use_cache: usar cache de análise (default: True)
        force: ignorar cache e forçar re-análise

    Returns:
        AudioResult com API, middleware, backend detectados.
    """
    game_dir_str = str(Path(game_dir).expanduser().resolve())

    # Cache
    if use_cache and not force:
        cached = load_cached_analysis(game_dir_str, str(exe_path) if exe_path else None)
        if cached:
            return cached

    result = AudioResult()
    evidence: list[AudioEvidence] = []

    # ── Camada 1: Imports ────────────────────────────────────────────
    if exe_path:
        imports = analyze_pe_imports(exe_path)
        if imports:
            apis = list({imp["api"] for imp in imports})
            dlls = list({imp["dll"] for imp in imports})
            result.apis_detected.extend(apis)
            result.dlls_detected.extend(dlls)
            evidence.append(AudioEvidence(
                source="imports",
                detail=f"Imports detectados: {', '.join(dlls)} → {', '.join(apis)}",
                confidence=0.6,
            ))
            log.debug("Camada 1 (imports): %s", apis)

    # ── Camada 2: DLLs ───────────────────────────────────────────────
    dll_found = scan_game_directory(game_dir_str)
    if dll_found:
        middlewares = list({d["middleware"] for d in dll_found})
        filenames = list({d["filename"] for d in dll_found})
        result.dlls_detected.extend(filenames)
        evidence.append(AudioEvidence(
            source="dlls",
            detail=f"DLLs de áudio encontradas: {', '.join(filenames)}",
            confidence=0.7,
        ))

        # Se um middleware foi detectado por DLL, usar como fallback
        if middlewares and not result.middleware:
            result.middleware = _pick_best_middleware(dll_found)
            log.debug("Camada 2 (DLLs): middleware=%s", result.middleware)

    # ── Camada 3: Signatures ─────────────────────────────────────────
    for dll_entry in dll_found:
        dll_path = Path(game_dir_str) / dll_entry["path"]
        if is_pe_dll(dll_path):
            sigs = identify_middleware(dll_path)
            for sig in sigs:
                if sig["confidence"] > 0.3:
                    result.middleware = sig["middleware"]
                    result.confidence = max(result.confidence, sig["confidence"])
                    evidence.append(AudioEvidence(
                        source="signature",
                        detail=f"Assinatura {sig['middleware']} em {dll_entry['filename']} "
                               f"(confiança: {sig['confidence']:.0%})",
                        confidence=sig["confidence"],
                    ))
                    log.debug("Camada 3 (signature): %s (%.0f%%)",
                              sig["middleware"], sig["confidence"] * 100)

    # ── Camada 4: Runtime (opcional) ─────────────────────────────────
    if runtime_log:
        rt = parse_runtime_log(runtime_log)
        if rt.get("apis_detected"):
            result.apis_detected.extend(rt["apis_detected"])
            result.backend = rt.get("most_active_api")
            evidence.append(AudioEvidence(
                source="runtime",
                detail=rt.get("summary", ""),
                confidence=0.9,
            ))
            log.debug("Camada 4 (runtime): %s", rt["apis_detected"])

    # ── Consolidação ─────────────────────────────────────────────────
    _consolidate(result, evidence, dll_found)

    # ── Recomendações ────────────────────────────────────────────────
    recs = recommend(result)
    result.recommendations = recs.get("notes", [])
    result.preferred_driver = recs.get("preferred_driver")
    result.needs_dsoal = recs.get("dsoal", False)

    # Cache
    if use_cache:
        save_cached_analysis(game_dir_str, result, str(exe_path) if exe_path else None)

    return result


def _pick_best_middleware(dll_found: list[dict]) -> str:
    """Escolhe o middleware mais provável baseado nas DLLs encontradas.

    Ordem de prioridade: OpenAL Soft > FMOD > Wwise > CRIWARE > BASS > XAudio2.
    """
    priority = [
        "OpenAL Soft", "FMOD", "Wwise", "CRIWARE",
        "BASS", "XAudio2", "irrKlang", "SDL_mixer",
    ]
    found_names = {d["middleware"] for d in dll_found}
    for name in priority:
        if name in found_names:
            return name
    if found_names:
        return found_names.pop()
    return "Desconhecido"


def _consolidate(
    result: AudioResult,
    evidence: list[AudioEvidence],
    dll_found: list[dict],
) -> None:
    """Consolida evidências de todas as camadas.

    1. Define API baseada nos imports + runtime
    2. Define backend baseado no runtime ou middleware
    3. Ajusta confiança baseada na consistência das evidências
    """
    result.evidence = evidence
    result.confidence = _calculate_confidence(result, evidence)

    # API: se tem dsound imports/runtime, marca como DirectSound
    # Caso contrário, infere do middleware
    for api_detected in result.apis_detected:
        if "MMDevAPI" in api_detected or "WASAPI" in api_detected:
            result.api = "MMDevAPI/WASAPI"
        elif api_detected in ("DirectSound",):
            result.api = api_detected
        elif api_detected in ("XAudio2",):
            result.api = api_detected

    if not result.api:
        info = get_middleware_info(result.middleware) if result.middleware else None
        if info:
            result.api = result.middleware

    # Backend: runtime > middleware info
    if not result.backend:
        info = get_middleware_info(result.middleware) if result.middleware else None
        if info:
            backends = info.get("backends", [])
            if backends:
                result.backend = backends[0]

    # Se detectamos ALAudio.dll especificamente, é OpenAL Soft
    if any("ALAudio.dll" in d["filename"] for d in dll_found):
        if not result.middleware:
            result.middleware = "OpenAL Soft"
            result.api = "MMDevAPI/WASAPI"

    # Se há mmdevapi.dll nos imports, WASAPI está ativo
    if any("mmdevapi.dll" in d.get("dll", "").lower() for d in evidence
           if d.source == "imports") or \
       any("mmdevapi" in api.lower() for api in result.apis_detected):
        result.api = "MMDevAPI/WASAPI"

    log.debug(
        "Consolidado: middleware=%s api=%s backend=%s confiança=%.0f%%",
        result.middleware, result.api, result.backend, result.confidence * 100,
    )


def _calculate_confidence(result: AudioResult, evidence: list[AudioEvidence]) -> float:
    """Calcula confiança baseada no número e qualidade das evidências.

    - Sem evidências: 0.0
    - 1 camada: 0.3-0.5
    - 2 camadas consistentes: 0.5-0.7
    - 3+ camadas consistentes: 0.7-0.95
    """
    if not evidence:
        return 0.0

    sources = set(e.source for e in evidence)
    max_confidence = max(e.confidence for e in evidence)
    source_count = len(sources)

    if source_count >= 3:
        return min(0.95, max_confidence + 0.1)
    elif source_count >= 2:
        return min(0.85, max_confidence)
    else:
        return min(0.5, max_confidence)


def format_result(result: AudioResult) -> str:
    """Formata AudioResult para exibição amigável."""
    lines = []
    lines.append("=" * 50)
    lines.append("  Audio Analysis")
    lines.append("=" * 50)
    lines.append(f"  API............. {result.api or 'N/A'}")
    lines.append(f"  Middleware...... {result.middleware or 'N/A'}")
    lines.append(f"  Backend......... {result.backend or 'N/A'}")
    lines.append(f"  Confiança....... {result.confidence:.0%}")
    lines.append(f"  Driver.......... {result.preferred_driver or 'N/A'}")
    lines.append(f"  DSOAL........... {'Recomendado' if result.needs_dsoal else 'Não necessário'}")
    lines.append("")

    if result.evidence:
        lines.append("  Evidências:")
        for e in result.evidence:
            lines.append(f"    {'✔' if e.confidence > 0.5 else '?'} {e.source}: {e.detail}")
        lines.append("")

    if result.recommendations:
        lines.append("  Recomendações:")
        for r in result.recommendations:
            lines.append(f"    • {r}")
        lines.append("")

    lines.append("=" * 50)

    return "\n".join(lines)
