"""
Tradutor MAKAI_* → STEAM_COMPAT_*.

Camada fina que traduz nossas env vars internas (MAKAI_*) para as
variáveis que o Proton espera (STEAM_COMPAT_*). Isso permite:

1. Nosso código usar nomes próprios (MAKAI_*) — sem dependência Steam
2. Proton continuar funcionando — ele só entende STEAM_COMPAT_*
3. Desvinculação completa no futuro — se Proton mudar, ajustamos só aqui

Uso:
    from engine.core.translator import inject_steam_vars

    env = {"MAKAI_GAME_INSTALL_DIR": "/home/...", ...}
    steam_env = inject_steam_vars(env)
    # steam_env agora tem também STEAM_COMPAT_INSTALL_PATH
"""

# Mapa: MAKAI_* → STEAM_COMPAT_*
# Cada entrada é (nossa_var, steam_var, default_value)
# default_value é usado se nossa_var não existir no env
MAKAI_TO_STEAM: list[tuple[str, str, str | None]] = [
    ("MAKAI_GAME_INSTALL_DIR",      "STEAM_COMPAT_INSTALL_PATH",          None),
    ("MAKAI_COMPAT_DATA_PATH",      "STEAM_COMPAT_DATA_PATH",            None),
    ("MAKAI_CLIENT_INSTALL_PATH",   "STEAM_COMPAT_CLIENT_INSTALL_PATH",  "/tmp"),
    ("MAKAI_TOOL_PATHS",            "STEAM_COMPAT_TOOL_PATHS",           None),
    ("MAKAI_LIBRARY_PATHS",         "STEAM_COMPAT_LIBRARY_PATHS",         None),
    ("MAKAI_MOUNTS",                "STEAM_COMPAT_MOUNTS",               None),
    ("MAKAI_SHADER_PATH",           "STEAM_COMPAT_SHADER_PATH",          None),
    ("MAKAI_APP_ID",                "STEAM_COMPAT_APP_ID",               "0"),
]

# Steam IDs que o Proton também lê (mantemos como estão)
STEAM_IDS = (
    "SteamAppId",
    "SteamGameId",
)


def translate_to_steam(env: dict[str, str]) -> dict[str, str]:
    """Traduz MAKAI_* para STEAM_COMPAT_* em uma cópia do dict.

    Retorna um NOVO dict com as vars STEAM_COMPAT_* adicionadas.
    As vars MAKAI_* originais permanecem — o tradutor NÃO as remove.
    """
    result = dict(env)

    for makai_key, steam_key, default in MAKAI_TO_STEAM:
        val = env.get(makai_key)
        if val is None and default is not None:
            val = default
        if val is not None:
            # Só seta se não existir (evita sobrescrever)
            if steam_key not in result:
                result[steam_key] = val

    return result


def inject_steam_vars(env: dict[str, str]) -> dict[str, str]:
    """Força presença de TODAS as STEAM_COMPAT_* que o Proton exige.

    Diferente de translate_to_steam(), esta função GARANTE que todas
    as vars Steam estejam presentes, preenchendo defaults se necessário.

    Deve ser chamada ANTES de executar o Proton.
    """
    result = translate_to_steam(env)

    # Garante defaults para vars críticas que Proton exige
    required = {
        "STEAM_COMPAT_CLIENT_INSTALL_PATH": "/tmp",
        "STEAM_COMPAT_APP_ID": "0",
    }

    for key, default in required.items():
        if key not in result or not result[key]:
            result[key] = default

    return result


def extract_makai_vars(env: dict[str, str]) -> dict[str, str]:
    """Extrai apenas as vars MAKAI_* de um dict.

    Útil para logging ou debug.
    """
    return {k: v for k, v in env.items() if k.startswith("MAKAI_")}


def strip_steam_vars(env: dict[str, str]) -> dict[str, str]:
    """Remove todas as STEAM_COMPAT_* de um dict.

    Útil para sanitização (ex: antes de --clearenv).
    """
    return {
        k: v for k, v in env.items()
        if not k.startswith("STEAM_COMPAT_")
    }
