import json
import os
from pathlib import Path

from engine.consts import MAKAI_COMPAT_DIR, STEAM_COMPAT_DIR
from engine.log import log


def resolve_proton_path(name: str | None = None) -> Path | None:
    if name:
        # Tenta como nome relativo em STEAM_COMPAT_DIR ou MAKAI_COMPAT_DIR
        for _dir in (STEAM_COMPAT_DIR, MAKAI_COMPAT_DIR):
            path = _dir / name
            if path.is_dir():
                log.debug("Proton found: %s", path)
                return path.resolve()

        # Tenta como caminho absoluto
        abs_path = Path(name).expanduser().resolve()
        if abs_path.is_dir():
            log.debug("Proton found (absolute dir): %s", abs_path)
            return abs_path

        # Se aponta para o script 'proton', extrai o diretório
        if abs_path.is_file() and abs_path.name == "proton":
            proton_dir = abs_path.parent
            if proton_dir.is_dir():
                log.debug("Proton found (from script path): %s", proton_dir)
                return proton_dir

        # Fuzzy match: nome do prefixo (ex: "dwproton-11.0-5") pode não
        # bater exatamente com o nome do diretório (ex: "DW-Proton-11.0-5").
        # Compara case-insensitive e normaliza separadores.
        fuzzy = _find_proton_by_fuzzy_name(name)
        if fuzzy:
            return fuzzy

    return _find_latest_proton()


def _find_latest_proton() -> Path | None:
    if not STEAM_COMPAT_DIR.is_dir():
        return None

    candidates = sorted(
        (d for d in STEAM_COMPAT_DIR.iterdir() if d.is_dir()),
        key=lambda d: os.path.getmtime(d),
        reverse=True,
    )

    for candidate in candidates:
        proton_script = candidate / "proton"
        if proton_script.is_file():
            log.debug("Latest Proton: %s", candidate.name)
            return candidate.resolve()

    return None


def _normalize_proton_name(name: str) -> str:
    """Normaliza um nome de Proton para comparação fuzzy.

    Remove hífens, underscores, espaços, pontos e converte para lowercase.
    Ex: "dwproton-11.0-5" → "dwproton1105"
        "DW-Proton-11.0-5" → "dwproton1105"
        "proton-cachyos"   → "protoncachyos"
    """
    return name.lower().replace("-", "").replace("_", "").replace(" ", "").replace(".", "")


def _find_proton_by_fuzzy_name(name: str) -> Path | None:
    """Busca fuzzy por diretório de Proton em compat dirs.

    O nome retornado por detect_proton_from_prefix() vem do arquivo 'version'
    ou 'config_info' do prefixo (ex: "dwproton-11.0-5"), mas o diretório
    pode ter um nome diferente (ex: "DW-Proton-11.0-5"). Esta função faz
    match case-insensitive e normaliza separadores.

    Também tenta substrings: "dwproton" bate com "DW-Proton-11.0-5".
    """
    norm_name = _normalize_proton_name(name)

    for _dir in (STEAM_COMPAT_DIR, MAKAI_COMPAT_DIR):
        if not _dir.is_dir():
            continue
        for candidate in _dir.iterdir():
            if not candidate.is_dir():
                continue
            if not (candidate / "proton").is_file():
                continue
            norm_candidate = _normalize_proton_name(candidate.name)
            # Match exato (case-insensitive, normalizado)
            if norm_candidate == norm_name:
                log.debug("Proton fuzzy match (exact): %s → %s", name, candidate)
                return candidate.resolve()
            # Match por substrings: nome normalizado contém o outro
            if len(norm_name) >= 6 and (norm_name in norm_candidate or norm_candidate in norm_name):
                log.debug("Proton fuzzy match (substring): %s → %s", name, candidate)
                return candidate.resolve()

    return None


def validate_proton(path: Path) -> bool:
    if not path.is_dir():
        log.error("Proton directory not found: %s", path)
        return False
    if not (path / "proton").is_file():
        log.error("Proton script not found in: %s", path)
        return False
    return True


# ═══════════════════════════════════════════════════════════════════════════════
# AUTO-DETECÇÃO DE PROTON VIA PREFIXO
# ═══════════════════════════════════════════════════════════════════════════════
#
# Problema resolvido:
#   Cada prefixo Wine/Proton foi CRIADO com um Proton específico, e essa
#   informação fica gravada em arquivos de metadados dentro do próprio prefixo
#   (version, config_info). Antes desta implementação, o makrun ignorava esses
#   arquivos e dependia de --proton explícito ou PROTONPATH no ambiente.
#   Se nada fosse passado, ele usava o Proton mais recente da Steam (errado).
#
# Solução:
#   detect_proton_from_prefix() lê os metadados do prefixo para descobrir
#   qual Proton deve ser usado. O runner chama esta função ANTES de resolver
#   o caminho do Proton, permitindo que o usuário rode apenas:
#     makrun waitforexitandrun <exe>
#   sem precisar especificar --proton toda vez.
#
# Ordem de tentativa (da mais para a menos confiável):
#   1. config_info  → linha 1: nome + linhas 2-3: caminho absoluto do Proton
#   2. version      → nome curto tipo "dwproton-11.0-5"
#   3. pfx/version  → idem, dentro de pfx/
#   4. container.json → nosso manifesto, campo proton.path (caminho completo)
#
# ═══════════════════════════════════════════════════════════════════════════════

def detect_proton_from_prefix(prefix_path: str | Path) -> str | None:
    """Auto-detecta qual Proton o prefixo usa lendo os metadados do prefixo.

    Cada prefixo Wine/Proton armazena o nome/fork do Proton que o criou
    em arquivos como 'version' e 'config_info'. Esta função retorna
    SEMPRE um nome RELATIVO (identificador tipo "dwproton-11.0-5"),
    NUNCA caminho absoluto. O resolve_proton_path() se encarrega de
    encontrar o diretório real nos compatibilitytools.d.

    Estratégia de detecção (em ordem de confiabilidade):
      1. pfx/version    → DENTRO do prefixo Wine, escrito pelo PRÓPRIO Wine
                          (./pfx/version). Fonte MAIS CONFIÁVEL: cada Proton
                          respeita este arquivo e não o sobrescreve.
      2. config_info    → Arquivo Steam/Proton. Linha 1 = nome (exato),
                          linhas 2+ = caminhos absolutos (usamos só o
                          BASENAME para extrair versão atualizada, nunca
                          o path absoluto).
      3. version        → Na raiz do prefixo.
      4. container.json → Nosso manifesto Makai (campo proton.path).

    Returns:
      Nome relativo do Proton (ex: "dwproton-11.0-5",
      "proton-cachyos-11.0-20260702-slr-x86_64") ou None.
    """
    pfx = Path(prefix_path).expanduser().resolve()
    if not pfx.is_dir():
        return None

    detected_name: str | None = None

    # ── 1. pfx/version (MAIS CONFIÁVEL) ─────────────────────────────────
    # Escrito pelo Wine internamente dentro de ./pfx/version.
    # Não é sobrescrito por outros Protons. Ex: "dwproton-11.0-5"
    pfx_version = pfx / "pfx" / "version"
    if pfx_version.is_file():
        try:
            name = pfx_version.read_text("utf-8", errors="replace").strip()
            if name:
                log.debug("Proton from pfx/version: %s", name)
                detected_name = name
        except OSError:
            pass

    # ── 2. config_info (só nome relativo) ───────────────────────────────
    # Usamos para duas coisas:
    #   a. Extrair o BASENAME do path absoluto (linhas 2-3), que pode ter
    #      a VERSÃO ATUALIZADA do Proton mesmo que line 1 seja antiga.
    #      Ex: line 1 = "Proton-CachyOS-11.0-20260602-slr" (antigo)
    #          line 2 = ".../proton-cachyos-11.0-20260702-slr-x86_64/files/"
    #          → extraímos "proton-cachyos-11.0-20260702-slr-x86_64" (relativo)
    #   b. Linha 1 como fallback (quando pfx/version não existe e path
    #      extraction não dá resultado).
    # NUNCA retornamos caminho absoluto.
    config_info = pfx / "config_info"
    config_info_name: str | None = None

    if config_info.is_file():
        try:
            lines = config_info.read_text("utf-8", errors="replace").strip().splitlines()
            if not lines:
                pass
            else:
                # a) Path extraction → BASENAME relativo
                for line in lines[1:]:
                    line = line.strip()
                    if not line:
                        continue
                    if "/files/" in line:
                        proton_dir = line[:line.index("/files/")]
                        if Path(proton_dir).is_dir() and (Path(proton_dir) / "proton").is_file():
                            dirname = Path(proton_dir).name
                            log.debug("Proton from config_info path (basename): %s", dirname)
                            detected_name = dirname
                            break

                # b) Guarda line 1 como fallback
                if not detected_name:
                    name = lines[0].strip()
                    if name:
                        config_info_name = name
        except OSError:
            pass

    # Se pfx/version deu resultado, prevalece sobre config_info
    if detected_name:
        return detected_name

    # Fallback: config_info line 1
    if config_info_name:
        log.debug("Proton from config_info name: %s", config_info_name)
        return config_info_name

    # ── 3. version (raiz do prefixo) ────────────────────────────────────
    vf = pfx / "version"
    if vf.is_file():
        try:
            name = vf.read_text("utf-8", errors="replace").strip()
            if name:
                log.debug("Proton from version: %s", name)
                return name
        except OSError:
            pass

    # ── 4. pfx/container.json ──────────────────────────────────────────
    container_json = pfx / "pfx" / "container.json"
    if container_json.is_file():
        try:
            data = json.loads(container_json.read_text("utf-8", errors="replace"))
            path = data.get("proton", {}).get("path")
            if path:
                dirname = Path(path).name
                log.debug("Proton from container.json (basename): %s", dirname)
                return dirname
        except (OSError, json.JSONDecodeError):
            pass

    return None
