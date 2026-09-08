"""Audio Intelligence — Análise de sistema de áudio de jogos.

Uso:
    from engine.intel.audio import analyze_audio, format_result

    result = analyze_audio("/path/to/game", exe_path="/path/to/game.exe")
    print(format_result(result))

    # Com log runtime existente
    result = analyze_audio(
        "/path/to/game",
        exe_path="/path/to/game.exe",
        runtime_log="/path/to/winedebug.log",
    )
"""

from engine.intel.audio.analyzer import analyze as analyze_audio
from engine.intel.audio.analyzer import format_result
from engine.intel.audio.models import AudioResult, AudioEvidence
from engine.intel.audio.cache import load_cached_analysis, save_cached_analysis, invalidate_cache
from engine.intel.audio.knowledge.recommendations import recommend
from engine.intel.audio.knowledge.compatibility import get_known_issue, search_by_middleware, search_by_dll

__all__ = [
    "analyze_audio",
    "format_result",
    "AudioResult",
    "AudioEvidence",
    "load_cached_analysis",
    "save_cached_analysis",
    "invalidate_cache",
    "recommend",
    "get_known_issue",
    "search_by_middleware",
    "search_by_dll",
]
