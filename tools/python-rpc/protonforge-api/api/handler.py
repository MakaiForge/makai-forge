"""
Handler de métodos RPC — dispatcher central.

Cada método RPC disponível é registrado neste módulo e delegado
para o módulo apropriado (recommendation, prefix, dlls, etc).

Formato da comunicação (JSON-RPC simples):
    Request:  {"id": 1, "method": "method_name", "params": {...}}
    Response: {"id": 1, "result": {...}}
    Error:    {"id": 1, "error": {"code": "...", "message": "..."}}
"""

from .services import recommendation
from .services import prefix
from .services import dlls
from .services import launch_args
from .services import proton_versions
from .services import compatflow_bridge
from .services import anticheat


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
                Opcional: "prefix_path" (str), "auto_dlls" (bool),
                "extra_verbs" (list[str])

    Retorna:
        Dict com status e caminho do prefixo criado
    """
    game_id = params.get("game_id")
    proton_path = params.get("proton_path")
    if not game_id or not proton_path:
        raise RpcError("missing_param", "game_id and proton_path are required")

    prefix_path = params.get("prefix_path")
    auto_dlls = params.get("auto_dlls", True)
    extra_verbs = params.get("extra_verbs")

    return prefix.create_prefix(
        game_id=str(game_id),
        proton_path=str(proton_path),
        prefix_path=str(prefix_path) if prefix_path else None,
        auto_dlls=bool(auto_dlls),
        extra_verbs=extra_verbs,
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


@register("install_game_dlls")
def handle_install_game_dlls(params: dict) -> dict:
    """Instala DLLs/verbas no prefixo via Makaitricks.

    Args:
        params: Deve conter "game_id", "prefix_path", "proton_path"
                Opcional: "extra_verbs" (list[str])

    Retorna:
        Dict com "installed" (list) e "errors" (list)
    """
    game_id = params.get("game_id")
    prefix_path = params.get("prefix_path")
    proton_path = params.get("proton_path")
    if not all([game_id, prefix_path, proton_path]):
        raise RpcError("missing_param", "game_id, prefix_path, proton_path are required")
    extra_verbs = params.get("extra_verbs")
    return prefix.install_recommended_dlls(
        game_id=str(game_id),
        prefix_path=str(prefix_path),
        proton_path=str(proton_path),
        extra_verbs=extra_verbs,
    )


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

    # Procura subdiretórios dentro de locations comuns de save
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
                # Se game_id foi informado, filtra por ele
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
    if method not in METHODS:
        raise RpcError("method_not_found", f"Unknown method: {method}")

    return METHODS[method](params or {})
