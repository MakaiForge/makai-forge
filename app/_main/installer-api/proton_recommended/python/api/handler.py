"""
Handler de métodos RPC — dispatcher central.

Cada método RPC disponível é registrado neste módulo e delegado
para o módulo apropriado (recommendation, prefix, dlls, etc).

Formato da comunicação (JSON-RPC simples):
    Request:  {"id": 1, "method": "method_name", "params": {...}}
    Response: {"id": 1, "result": {...}}
    Error:    {"id": 1, "error": {"code": "...", "message": "..."}}
"""

from .debug_log import log as debug_log
from .services import recommendation
from .services import prefix
from .services import dlls
from .services import launch_args
from .services import proton_versions
# Import lazy para evitar falha se o pacote compatflow não existir
try:
    from .services import compatflow_bridge
except ImportError:
    compatflow_bridge = None
from .services import anticheat
from .services import mod_manager
from .services import mod_compat


class RpcError(Exception):
    """Erro padrão para respostas de erro RPC."""

    def __init__(self, code: str, message: str | None = None):
        self.code = code
        self.message = message or code
        super().__init__(self.message)


METHODS: dict[str, callable] = {}


def register(method: str):
    """Decorador para registrar um método RPC."""
    def wrapper(func):
        METHODS[method] = func
        return func
    return wrapper


@register("recommend_proton")
def handle_recommend_proton(params: dict) -> dict:
    """Recomenda a melhor versão de Proton para um jogo.

    Args:
        params: Deve conter "game_id" (str)

    Retorna:
        Dict com recomendação primária + alternativas + launch options
    """
    game_id = params.get("game_id")
    if not game_id:
        raise RpcError("missing_param", "game_id is required")

    return recommendation.recommend(str(game_id))


@register("get_game_info")
def handle_get_game_info(params: dict) -> dict | None:
    """Retorna informações de um jogo do catálogo SQLite.

    Args:
        params: Deve conter "game_id" (str)

    Retorna:
        Dict com dados do jogo ou None se não encontrado
    """
    game_id = params.get("game_id")
    if not game_id:
        raise RpcError("missing_param", "game_id is required")
    return recommendation.get_game_info(str(game_id))


@register("search_games")
def handle_search_games(params: dict) -> list:
    """Busca jogos no catálogo por nome.

    Args:
        params: Deve conter "query" (str)

    Retorna:
        Lista de jogos encontrados
    """
    query = params.get("query")
    if not query:
        raise RpcError("missing_param", "query is required")
    return recommendation.search_games(str(query))


@register("create_prefix")
def handle_create_prefix(params: dict) -> dict:
    """Cria ou configura um Wine prefix para um jogo.

    Args:
        params: Deve conter "game_id" (str), "proton_path" (str)
                Opcional: "prefix_path" (str), "auto_dlls" (bool)

    Retorna:
        Dict com status e caminho do prefixo criado
    """
    game_id = params.get("game_id")
    proton_path = params.get("proton_path")
    if not game_id or not proton_path:
        raise RpcError("missing_param", "game_id and proton_path are required")

    prefix_path = params.get("prefix_path")
    auto_dlls = params.get("auto_dlls", True)

    return prefix.create_prefix(
        game_id=str(game_id),
        proton_path=str(proton_path),
        prefix_path=str(prefix_path) if prefix_path else None,
        auto_dlls=bool(auto_dlls),
    )


@register("get_recommended_dlls")
def handle_get_recommended_dlls(params: dict) -> dict:
    """Retorna DLLs recomendadas para um jogo.

    Args:
        params: Deve conter "game_id" (str)

    Retorna:
        Dict com lista de DLLs e comandos winetricks
    """
    game_id = params.get("game_id")
    if not game_id:
        raise RpcError("missing_param", "game_id is required")
    return dlls.get_recommended_dlls(str(game_id))


@register("get_launch_command")
def handle_get_launch_command(params: dict) -> dict:
    """Monta o comando de lançamento completo.

    Args:
        params: Deve conter "game_id", "prefix_path", "proton_path", "executable"
                Opcional: "launch_options" (str), "env_overrides" (dict)

    Retorna:
        Dict com command, args, env_vars formatados
    """
    game_id = params.get("game_id")
    prefix_path = params.get("prefix_path")
    proton_path = params.get("proton_path")
    executable = params.get("executable")

    if not all([game_id, prefix_path, proton_path, executable]):
        raise RpcError("missing_param", "game_id, prefix_path, proton_path, executable are required")

    return launch_args.build_launch_command(
        game_id=str(game_id),
        prefix_path=str(prefix_path),
        proton_path=str(proton_path),
        executable=str(executable),
        launch_options=str(params.get("launch_options")) if params.get("launch_options") else None,
        env_overrides=params.get("env_overrides"),
    )


@register("get_installed_protons")
def handle_get_installed_protons(params: dict) -> list:
    """Lista versões de Proton instaladas no sistema.

    Args:
        params: Não utilizado

    Retorna:
        Lista de dicts com name, path, source
    """
    return proton_versions.get_installed_protons()


@register("analyze_exe")
def handle_analyze_exe(params: dict) -> dict:
    """Analisa um arquivo .exe/.msi e retorna informações de compatibilidade.

    Usa o banco de dados do CompatFlow para identificar o aplicativo/jogo
    e determinar se:
      - É um app nativo Linux disponível
      - É um jogo conhecido (para recomendação de Proton)
      - Tem port via Lutris
      - É desconhecido

    Args:
        params: Deve conter "exe_path" (str) — caminho completo do arquivo

    Retorna:
        Dict com resultado da análise + dados para o fluxo ProtonForge
    """
    exe_path = params.get("exe_path")
    if not exe_path:
        return {"success": False, "error": "exe_path é obrigatório"}
    return compatflow_bridge.analyze_exe(exe_path)


@register("list_available_forks")
def handle_list_available_forks(params: dict) -> list:
    """Lista todos os forks de Proton disponíveis com tiers.

    Args:
        params: Não utilizado

    Retorna:
        Lista de forks com nome, tier, score, features
    """
    return recommendation.get_available_forks()


@register("rate_releases")
def handle_rate_releases(params: dict) -> list:
    """Atribui rating individual (1-100) para cada release de Proton.

    O rating é calculado com base no tierScore do fork + posição
    relativa do release (mais recente = maior nota).

    Args:
        params: {
            "releases": [
                {"toolId": "proton-ge", "tag": "GE-Proton9-25", "published": "2024-..."},
                ...
            ]
        }

    Retorna:
        Mesma lista com campo "rating" (int 25-100) adicionado em cada item
    """
    from .services.data import _load_json

    releases = params.get("releases") or []
    if not releases:
        return []

    protons = _load_json("protons.json")

    # toolId → display name
    tool_names = {
        "proton-ge": "GE-Proton",
        "valve-proton": "Valve Proton",
        "dw-proton": "DW-Proton",
        "proton-cachyos": "CachyOS Proton",
        "proton-tkg": "Proton-TKG",
        "proton-em": "Proton-EM",
        "proton-ge-rtsp": "GE-Proton RTSP",
        "wine-vanilla": "Wine Vanilla",
        "wine-staging": "Wine Staging",
        "wine-tkg": "Wine-TKG",
    }

    # Índice: nome normalizado → tierScore
    name_scores: dict[str, int] = {}
    for fdata in protons.values():
        nm = (fdata.get("name") or "").lower()
        if nm:
            name_scores[nm] = int(fdata.get("tierScore", 70))

    # Agrupa por toolId mantendo ordem
    from collections import OrderedDict

    groups: dict[str, list] = OrderedDict()
    for r in releases:
        groups.setdefault(r.get("toolId", ""), []).append(r)

    out: list[dict] = []
    for tid, group in groups.items():
        display = tool_names.get(tid, tid)
        base = name_scores.get(display.lower(), 70)

        sorted_rel = sorted(group, key=lambda x: x.get("published", "") or "", reverse=True)
        n = len(sorted_rel)
        for pos, r in enumerate(sorted_rel):
            # Queda linear: 0, 2, 4, 6… — nunca abaixo de 25
            score = max(25, int(base) - pos * max(1, base // (n + 2 if n > 1 else 1)))
            r2 = dict(r)
            r2["rating"] = score
            out.append(r2)

    return out


@register("install_game_dlls")
def handle_install_game_dlls(params: dict) -> dict:
    """Instala DLLs recomendadas para um jogo via winetricks.

    Args:
        params: Deve conter "game_id" (str), "prefix_path" (str), "proton_path" (str)
                Opcional: "extra_verbs" (list[str]) — verbos winetricks adicionais

    Retorna:
        Dict com listas "installed" e "errors"
    """
    game_id = params.get("game_id")
    prefix_path = params.get("prefix_path")
    proton_path = params.get("proton_path")
    if not game_id or not prefix_path or not proton_path:
        raise RpcError("missing_param", "game_id, prefix_path, proton_path are required")

    return prefix.install_recommended_dlls(
        game_id=str(game_id),
        prefix_path=str(prefix_path),
        proton_path=str(proton_path),
        extra_verbs=params.get("extra_verbs"),
        makaitricks_bin=params.get("makaitricks_path"),
    )


@register("install-makaitricks")
def handle_install_makaitricks(params: dict) -> dict:
    """Executa verbos Makaitricks em um prefixo.

    Args:
        params: Deve conter "prefix_path" (str), "proton_path" (str), "verbs" (list[str])
                Opcional: "makaitricks_path" (str) — caminho do script Makaitricks

    Retorna:
        Dict com listas "installed" e "errors"
    """
    prefix_path = params.get("prefix_path")
    proton_path = params.get("proton_path")
    verbs = params.get("verbs")
    if not prefix_path or not proton_path or not verbs:
        raise RpcError("missing_param", "prefix_path, proton_path, verbs are required")
    if not isinstance(verbs, list):
        raise RpcError("invalid_param", "verbs must be a list")

    return prefix.run_makaitricks_verbs(
        prefix_path=str(prefix_path),
        proton_path=str(proton_path),
        verbs=[str(v) for v in verbs],
        makaitricks_bin=params.get("makaitricks_path"),
    )


@register("check_anticheat")
def handle_check_anticheat(params: dict) -> dict:
    """Verifica se um jogo precisa de anti-cheat.

    Args:
        params: Deve conter "game_id" (str)

    Retorna:
        Dict com {eac: bool, battleye: bool}
    """
    game_id = params.get("game_id")
    if not game_id:
        raise RpcError("missing_param", "game_id is required")
    return anticheat.check_anticheat(str(game_id))


@register("mod_fomod_parse")
def handle_mod_fomod_parse(params: dict) -> dict:
    mod_path = params.get("mod_path")
    if not mod_path:
        raise RpcError("missing_param", "mod_path is required")
    return mod_manager.fomod.parse(str(mod_path))


@register("mod_fomod_install")
def handle_mod_fomod_install(params: dict) -> dict:
    mod_path = params.get("mod_path")
    selections = params.get("selections")
    if not mod_path or selections is None:
        raise RpcError("missing_param", "mod_path and selections are required")
    return mod_manager.fomod.install(str(mod_path), selections)


@register("mod_nexus_search")
def handle_mod_nexus_search(params: dict) -> list:
    query = params.get("query")
    game_id = params.get("game_id")
    if not query:
        raise RpcError("missing_param", "query is required")
    return mod_manager.nexus.search(str(query), str(game_id) if game_id else None)


@register("mod_nexus_trending")
def handle_mod_nexus_trending(params: dict) -> list:
    game_id = params.get("game_id")
    if not game_id:
        raise RpcError("missing_param", "game_id is required")
    return mod_manager.nexus.trending(str(game_id))


@register("mod_read_plugins")
def handle_mod_read_plugins(params: dict) -> list:
    path = params.get("path")
    if not path:
        raise RpcError("missing_param", "path is required")
    return mod_manager.plugins.read(str(path), params.get("star_prefix", True))


@register("mod_write_plugins")
def handle_mod_write_plugins(params: dict) -> bool:
    path = params.get("path")
    entries = params.get("entries")
    if not path or entries is None:
        raise RpcError("missing_param", "path and entries are required")
    return mod_manager.plugins.write(str(path), entries, params.get("star_prefix", True))


@register("recommend_proton_for_modding")
def handle_recommend_proton_for_modding(params: dict) -> dict:
    """Recomenda Proton + DLLs para jogar com mods.

    Args:
        params: Deve conter "game_id" (str)

    Retorna:
        Dict com recomendação para modding (GE-Proton, script extender, DLLs)
    """
    game_id = params.get("game_id")
    if not game_id:
        raise RpcError("missing_param", "game_id is required")
    return mod_compat.recommend_proton_for_modding(str(game_id))


@register("list_mod_compatible_games")
def handle_list_mod_compatible_games(params: dict) -> list:
    """Lista jogos com dados de compatibilidade de mods.

    Args:
        params: Opcional: "query" (str) para filtrar

    Retorna:
        Lista de jogos com score, tier, script extender
    """
    query = params.get("query", "")
    return mod_compat.list_mod_compatible_games(str(query) if query else "")


# ── Prefix management (para troca de Proton) ────────────────────────────────


@register("delete_prefix")
def handle_delete_prefix(params: dict) -> dict:
    """Deleta um prefixo Wine/Proton (shutil.rmtree).

    Args:
        params: Deve conter "prefix_path" (str)

    Retorna:
        Dict com "success" (bool)
    """
    prefix_path = params.get("prefix_path")
    if not prefix_path:
        raise RpcError("missing_param", "prefix_path is required")
    from prefix.core import delete_prefix
    return {"success": delete_prefix(str(prefix_path))}


@register("clean_prefix")
def handle_clean_prefix(params: dict) -> dict:
    """Limpa um prefixo: remove user.reg, system.reg, userdef.reg,
    mantendo a estrutura de diretórios.

    Args:
        params: Deve conter "prefix_path" (str)

    Retorna:
        Dict com "success" (bool)
    """
    prefix_path = params.get("prefix_path")
    if not prefix_path:
        raise RpcError("missing_param", "prefix_path is required")
    from prefix.core import clean_prefix
    return {"success": clean_prefix(str(prefix_path))}


@register("get_prefix_saves")
def handle_get_prefix_saves(params: dict) -> dict:
    """Lista diretórios de saves dentro do prefixo Wine/Proton.

    Procura em locations comuns: Documents/My Games, AppData/Local,
    AppData/Roaming.

    Args:
        params: Deve conter "prefix_path" (str)
                Opcional: "game_id" (str) para filtrar por nome do jogo

    Retorna:
        Dict com "saves" (list[str]) — caminhos relativos ao prefixo
    """
    import os
    from pathlib import Path

    prefix_path = params.get("prefix_path")
    if not prefix_path:
        raise RpcError("missing_param", "prefix_path is required")

    pfx = Path(prefix_path)
    if not pfx.is_dir():
        return {"saves": [], "error": "prefix directory not found"}

    saves = []
    game_id = params.get("game_id", "")

    search_bases = [
        "drive_c/users/*/Documents/My Games",
        "drive_c/users/*/AppData/Local",
        "drive_c/users/*/AppData/Roaming",
    ]

    for pattern in search_bases:
        for base in pfx.glob(pattern):
            if not base.is_dir():
                continue
            for child in base.iterdir():
                if not child.is_dir():
                    continue
                child_lower = child.name.lower()
                if game_id:
                    gid = game_id.lower().replace("_", "").replace("-", "")
                    cname = child_lower.replace("_", "").replace("-", "").replace(" ", "")
                    if gid not in cname and cname not in gid:
                        continue
                saves.append(str(child.relative_to(pfx)))

    return {"saves": saves}


@register("restore_saves")
def handle_restore_saves(params: dict) -> dict:
    """Restaura saves de um backup para o novo prefixo.

    Copia os diretórios de saves do prefixo antigo (backup_source)
    para o novo prefixo (prefix_path).

    Args:
        params: Deve conter:
            "prefix_path" (str) — caminho do novo prefixo
            "saves_backup" (list[str]) — caminhos relativos dos saves
            "backup_source" (str) — caminho do prefixo antigo (backup)

    Retorna:
        Dict com "restored" (list[str]), "errors" (list[str])
    """
    import shutil
    from pathlib import Path

    prefix_path = params.get("prefix_path")
    saves_backup = params.get("saves_backup", [])
    backup_source = params.get("backup_source")

    if not all([prefix_path, backup_source]):
        raise RpcError("missing_param", "prefix_path and backup_source are required")

    pfx = Path(prefix_path)
    src = Path(backup_source)
    restored = []
    errors = []

    for save_rel in saves_backup:
        src_path = src / save_rel
        dst_path = pfx / save_rel
        if not src_path.exists():
            errors.append(f"{save_rel}: fonte não encontrada em {backup_source}")
            continue
        try:
            if dst_path.exists():
                shutil.rmtree(dst_path)
            shutil.copytree(src_path, dst_path)
            restored.append(save_rel)
        except Exception as e:
            errors.append(f"{save_rel}: {str(e)[:150]}")

    return {"restored": restored, "errors": errors}


def dispatch(method: str, params: dict | None) -> object:
    """Despacha uma chamada RPC para o método registrado.

    Args:
        method: Nome do método
        params: Parâmetros da chamada

    Retorna:
        Resultado do método

    Raises:
        RpcError: Se o método não existir ou houver erro na execução
    """
    debug_log("rpc_call", {
        "method": method,
        "params_keys": list(params.keys()) if params else [],
    })

    if method not in METHODS:
        debug_log("rpc_method_not_found", {"method": method})
        raise RpcError("method_not_found", f"Unknown method: {method}")

    try:
        result = METHODS[method](params or {})
        debug_log("rpc_success", {"method": method})
        return result
    except RpcError:
        debug_log("rpc_error", {"method": method, "error": "RpcError"})
        raise
    except Exception as e:
        debug_log("rpc_exception", {"method": method, "error": str(e)[:200]})
        raise
