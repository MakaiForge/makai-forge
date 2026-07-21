"""
Módulo central de launch args — geração de argumentos de linha de comando
para Proton (e Wine), incluindo variáveis de ambiente, WINEPREFIX,
e sobrescritas de DLL.

Toda lógica que monta string de execução (steam.exe + args, protonrun,
wine, etc.) fica aqui. A base de conhecimento combina SQLite (quando
disponível) com JSON de fallback (app/_main/installer-api/proton_recommended/data/).
"""

import json
import os
import sqlite3

from ...db.connection import _get_db, _PROTON_API_DIR

# Cache global (mantido durante vida do processo)
_cache: dict = {}


def _load_cfg() -> dict:
    """Carrega configuração de launch args: SQLite → JSON fallback.

    SQLite: tabela launch_catalog (id, fork_id, fork_name, command_line,
            environment, dll_overrides, display_fix, audio_fix,
            fsr_config, notes, compatibility)
    JSON:   data/launch_args_cfg.json

    Retorna dict normalizado com as mesmas chaves do JSON original.
    """
    if "launch_args" in _cache:
        return _cache["launch_args"]

    db = _get_db()
    if db is not None:
        try:
            cursor = db.execute("SELECT * FROM [launch_catalog]")
            rows = cursor.fetchall()
            if rows:
                entries = {}
                for row in rows:
                    r = dict(row)
                    fid = str(r.pop("fork_id", ""))
                    entries[fid] = {
                        "fork_id": fid,
                        "fork": r.get("fork_name", ""),
                        "command_line": r.get("command_line", ""),
                        "environment": (
                            json.loads(r["environment"])
                            if isinstance(r.get("environment"), str)
                            else (r.get("environment") or {})
                        ),
                        "dll_overrides": (
                            json.loads(r["dll_overrides"])
                            if isinstance(r.get("dll_overrides"), str)
                            else (r.get("dll_overrides") or {})
                        ),
                        "display_fix": r.get("display_fix"),
                        "audio_fix": r.get("audio_fix"),
                        "fsr_config": (
                            json.loads(r["fsr_config"])
                            if isinstance(r.get("fsr_config"), str)
                            else (r.get("fsr_config") or {})
                        ),
                        "notes": r.get("notes"),
                        "compatibility": (
                            json.loads(r["compatibility"])
                            if isinstance(r.get("compatibility"), str)
                            else (r.get("compatibility") or {})
                        ),
                    }
                data = {"launch_catalog": entries}
                _cache["launch_args"] = data
                return data
        except sqlite3.OperationalError:
            pass

    # Fallback JSON
    filepath = os.path.join(_PROTON_API_DIR, "launch_args_cfg.json")
    if not os.path.exists(filepath):
        empty = {"launch_catalog": {}}
        _cache["launch_args"] = empty
        return empty

    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    _cache["launch_args"] = data
    return data


def get_launch_args(fork_id: str, include_proton_env: bool = False) -> dict | None:
    """Retorna configuração de launch args para um fork específico.

    Args:
        fork_id: ID do fork Proton (ex: 'GE-Proton', 'caffe', 'soda')
        include_proton_env: Se True, inclui PROTON_* variáveis de ambiente

    Retorna:
        Dict com as configurações do fork, ou None se não encontrado.
    """
    cfg = _load_cfg()
    catalog = cfg.get("launch_catalog", {})

    entry = catalog.get(fork_id, catalog.get(fork_id.lower()))
    if not entry:
        return None

    result = {
        "fork_id": entry.get("fork_id", fork_id),
        "fork": entry.get("fork", fork_id),
        "command_line": entry.get("command_line", ""),
        "environment": entry.get("environment", {}),
        "dll_overrides": entry.get("dll_overrides", {}),
        "display_fix": entry.get("display_fix"),
        "audio_fix": entry.get("audio_fix"),
        "fsr_config": entry.get("fsr_config", {}),
        "notes": entry.get("notes", ""),
    }

    if include_proton_env:
        env = result.get("environment", {})
        proton_vars = {k: v for k, v in env.items() if k.startswith("PROTON_")}
        if proton_vars:
            result["proton_environment"] = proton_vars

    return result


def build_fork_env(fork_id: str, base_env: dict | None = None) -> dict:
    """Constrói environment completo para um fork Proton.

    Combina o environment base (fornecido pelo usuário/sistema) com
    as variáveis específicas do fork e os DLL overrides necessários.

    Args:
        fork_id: ID do fork Proton
        base_env: Environment base (opcional). Se None, usa os.environ.

    Retorna:
        Dict com variáveis de ambiente mescladas.
    """
    env = dict(base_env or os.environ)
    cfg = get_launch_args(fork_id, include_proton_env=True)
    if not cfg:
        return env

    fork_env = cfg.get("environment", {})
    env.update(fork_env)

    dll_overrides: dict = cfg.get("dll_overrides", {})
    if dll_overrides:
        existing = env.get("WINEDLLOVERRIDES", "")
        overrides = []
        if existing:
            overrides.append(existing)
        for dll, mode in dll_overrides.items():
            overrides.append(f"{dll}={mode}")
        env["WINEDLLOVERRIDES"] = ";".join(overrides)

    return env


def get_preferred_fork(game_id: str, fork_id: str | None = None) -> str:
    """Retorna o fork Proton preferido para um jogo específico.

    Prioridade:
    1. fork_id explícito (se fornecido)
    2. Compatibilidade do fork_catalog com o jogo
    3. GE-Proton (default)

    Args:
        game_id: ID Steam do jogo
        fork_id: Fork sugerido (opcional)

    Retorna:
        ID do fork recomendado.
    """
    if fork_id:
        return fork_id

    db = _get_db()
    if db is not None:
        try:
            compat = db.execute(
                "SELECT fork_id FROM fork_compat WHERE game_id = ? ORDER BY score DESC LIMIT 1",
                (game_id,),
            ).fetchone()
            if compat:
                return str(compat["fork_id"])
        except sqlite3.OperationalError:
            pass

    cfg = _load_cfg()
    catalog = cfg.get("launch_catalog", {})
    if catalog:
        default_candidates = ["GE-Proton", "proton_ge", "caffe", "soda"]
        for candidate in default_candidates:
            if candidate in catalog or candidate.lower() in {
                k.lower() for k in catalog
            }:
                return candidate

    return "GE-Proton"


def build_launch_command(
    game_id: str,
    prefix_path: str,
    proton_path: str,
    executable: str,
    launch_options: str | None = None,
    env_overrides: dict | None = None,
) -> dict:
    """Monta comando de lançamento completo com env vars.

    Args:
        game_id: ID Steam do jogo
        prefix_path: Caminho do WINEPREFIX
        proton_path: Caminho do Proton a ser usado
        executable: Executável a ser lançado
        launch_options: Opções extras de linha de comando
        env_overrides: Sobrescritas de variáveis de ambiente

    Retorna:
        Dict com command, args, env_vars
    """
    base_env = build_fork_env(game_id)
    if env_overrides:
        base_env.update(env_overrides)

    base_env["WINEPREFIX"] = prefix_path

    command = proton_path
    args = ["run", executable]
    if launch_options:
        args.extend(launch_options.split())

    return {
        "command": command,
        "args": args,
        "env_vars": base_env,
        "fork_id": get_preferred_fork(game_id),
    }


def list_available_args() -> list[dict]:
    """Lista todos os launch args disponíveis no catálogo.

    Retorna:
        Lista de entradas do catálogo de launch args.
    """
    cfg = _load_cfg()
    catalog = cfg.get("launch_catalog", {})
    result = []
    for fork_id, entry in catalog.items():
        result.append({
            "fork_id": fork_id,
            "fork": entry.get("fork", fork_id),
            "command_line": entry.get("command_line", ""),
            "notes": entry.get("notes", ""),
        })
    return result


def get_game_specific_tips(game_id: str) -> list[str]:
    """Retorna dicas de configuração específicas para um jogo.

    Args:
        game_id: ID Steam do jogo

    Retorna:
        Lista de strings com dicas.
    """
    db = _get_db()
    tips = []
    if db is not None:
        try:
            row = db.execute(
                "SELECT notes FROM launch_catalog lc "
                "JOIN fork_compat fc ON lc.fork_id = fc.fork_id "
                "WHERE fc.game_id = ? LIMIT 1",
                (game_id,),
            ).fetchone()
            if row and row["notes"]:
                tips.append(str(row["notes"]))
        except sqlite3.OperationalError:
            pass
    return tips


def get_game_launch_config(
    game_id: str,
    game_name: str | None = None,
    fork_id: str | None = None,
) -> dict:
    """Gera configuração de lançamento completa para um jogo.

    Combina dados do fork, DLLs recomendadas e configurações
    específicas do jogo em um único dict pronto pra UI.

    Args:
        game_id: ID Steam do jogo
        game_name: Nome do jogo (opcional, pra display)
        fork_id: Fork Proton específico (opcional)

    Retorna:
        Dict completo com launch_args, env, dll_overrides e recomendação.
    """
    preferred_fork = get_preferred_fork(game_id, fork_id)
    fork_args = get_launch_args(preferred_fork, include_proton_env=True)

    result = {
        "game_id": game_id,
        "game_name": game_name or "",
        "preferred_fork": preferred_fork,
        "fork": fork_args,
        "environment": build_fork_env(preferred_fork),
        "dll_overrides": fork_args.get("dll_overrides", {}) if fork_args else {},
        "warnings": [],
    }

    if not fork_args:
        result["warnings"].append(
            f"Fork '{preferred_fork}' não encontrado no catálogo. "
            f"Usando configurações padrão."
        )

    return result
