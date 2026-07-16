"""
core/play.py — Play flow: verifica, prepara e abre.

Para cada jogo, carrega os requisitos de games_registry.py e:
1. Cria/configura prefixo se necessário
2. Aplica DLL overrides se ausentes
3. Registra caminho Bethesda se ausente
4. Instala componentes Makaitricks se necessário
5. Instala Script Extender se necessário
6. Deploy mods → Launch
"""

import os
import sys
import json
import time
import traceback

from core import storage
from core.detection import detect_game

# ─── Event emitter ─────────────────────────────────────────────

def _emit(event_type: str, **data):
    sys.stdout.write(json.dumps({"event": event_type, **data}, ensure_ascii=True, separators=(",", ":")) + "\n")
    sys.stdout.flush()


# ─── Config helpers ────────────────────────────────────────────

def _load_game_config(game_id: str) -> dict:
    c = storage.get(f"game:{game_id}:config") or {}
    return c if isinstance(c, dict) else {}


def _get_modlist(game_id: str, profile: str = "Default") -> list:
    d = storage.get(f"game:{game_id}:profile:{profile}:modlist")
    return d if isinstance(d, list) else []


def _default_staging_dir(game_id: str) -> str:
    slug = game_id.lower().replace(" ", "-").replace("/", "-").replace("\\", "-")
    return os.path.join(os.path.expanduser("~"), "Games", "Mods", slug, "staging")


def _default_prefix_dir(game_id: str) -> str:
    return os.path.join(os.path.expanduser("~"), "Games", "Prefix", game_id)


_NATIVE_LINUX = {
    "minecraft", "rimworld", "factorio", "valheim", "subnautica",
    "stardewvalley", "terraria", "projectzomboid", "thelongdark",
    "kerbalspaceprogram",
}

_BETHESDA = {
    "skyrim", "skyrim_se", "skyrim_vr", "enderal", "enderal_se",
    "fallout3", "falloutnv", "fallout4", "fallout4_vr",
    "oblivion", "morrowind", "starfield",
}


# ─── Steps ─────────────────────────────────────────────────────

def _step_proton(proton_version: str, game_path: str, steam_app_id: str) -> str:
    """Encontra Proton. Retorna caminho ou levanta exceção."""
    from core.engine.proton import find_proton, find_compatibility_tool_path, find_any_proton

    p = None
    if proton_version:
        proton_exe = os.path.join(os.path.expanduser(proton_version), "proton")
        if os.path.isfile(proton_exe):
            p = proton_exe
        else:
            p = find_proton(proton_version)
    if not p and steam_app_id:
        p = find_compatibility_tool_path(game_path, steam_app_id)
    if not p:
        p = find_any_proton()
    if not p:
        raise RuntimeError("Proton não encontrado")
    return p


def _step_prefix(prefix_path: str, proton_path: str, game_id: str, steam_app_id: str):
    """Garante que o prefixo existe e é válido. Cria se necessário."""
    from prefix.core import prefix_exists, create_prefix

    if prefix_exists(prefix_path):
        _emit("log", level="info", message=f"Prefixo existe: {prefix_path}")
        return

    _emit("progress", step="prefix", message="Criando prefixo...", percent=30)
    result = create_prefix(
        game_id=game_id,
        proton_path=proton_path,
        prefix_path=prefix_path,
        auto_dlls=False,
    )
    if not result.get("success"):
        raise RuntimeError(result.get("errors", ["Falha ao criar prefixo"])[0])


def _step_dll_overrides(prefix_path: str, game_id: str):
    """Aplica DLL overrides se ausentes no user.reg."""
    from core.games_registry import get_game_dll_overrides
    from core.engine.registry import apply_dll_overrides

    needed = get_game_dll_overrides(game_id)
    if not needed:
        return

    expanded = os.path.expanduser(prefix_path)
    user_reg = os.path.join(expanded, "user.reg")
    if not os.path.isfile(user_reg):
        user_reg = os.path.join(expanded, "pfx", "user.reg")

    if os.path.isfile(user_reg):
        try:
            with open(user_reg, "r", encoding="utf-8", errors="replace") as f:
                text = f.read()
        except OSError:
            text = ""
        missing = [d for d in needed if f'"{d["name"]}"="' not in text]
        if not missing:
            return

    _emit("progress", step="configs", message="Aplicando DLL overrides...", percent=40)
    apply_dll_overrides(prefix_path, needed)


def _step_bethesda_registry(prefix_path: str, proton_path: str, game_id: str, game_path: str, steam_app_id: str):
    """Registra o caminho do jogo Bethesda se ausente."""
    if game_id not in _BETHESDA:
        return

    # Verifica se já existe
    expanded = os.path.expanduser(prefix_path)
    system_reg = os.path.join(expanded, "system.reg")
    if not os.path.isfile(system_reg):
        system_reg = os.path.join(expanded, "pfx", "system.reg")

    if os.path.isfile(system_reg):
        try:
            with open(system_reg, "r", encoding="utf-8", errors="replace") as f:
                text = f.read()
            from core.engine.registry import _BETHESDA_REG_NAMES
            reg_name = _BETHESDA_REG_NAMES.get(game_id)
            if reg_name and "Installed Path" in text and reg_name in text:
                return
        except OSError:
            pass

    _emit("progress", step="configs", message="Registrando Bethesda...", percent=45)
    from core.engine.registry import register_bethesda_game_path
    register_bethesda_game_path(prefix_path, proton_path, game_id, game_path, steam_app_id or None)


def _step_makaitricks(prefix_path: str, proton_path: str, game_id: str):
    """Instala componentes Makaitricks se necessário."""
    from core.games_registry import get_game_winetricks
    from core.engine.makaitricks import run_multiple

    components = get_game_winetricks(game_id)
    if not components:
        return

    # Verifica se algum componente já foi instalado
    # (Makaitricks é idempotente, mas podemos pular se todos existirem)
    _emit("progress", step="configs", message="Makaitricks...", percent=50)
    result = run_multiple(components, prefix_path, proton_path)
    if not result.get("success"):
        _emit("log", level="warn", message="Makaitricks teve falhas", results=result.get("results"))


def _step_script_extender(game_path: str, game_id: str) -> str | None:
    """Instala Script Extender se ausente. Retorna caminho do loader."""
    from core.games_registry import (
        get_script_extender_info, check_script_extender,
        install_script_extender,
    )

    info = get_script_extender_info(game_id)
    if not info:
        return None

    _emit("progress", step="skse", message="Verificando Script Extender...", percent=60)
    se_path = check_script_extender(game_path, info)
    if not se_path:
        _emit("progress", step="skse", message="Instalando Script Extender...", percent=65)
        se_path = install_script_extender(game_path, info)
        if not se_path:
            _emit("log", level="warn", message="Script Extender não pôde ser instalado")
            return None

    if se_path:
        _emit("log", level="info", message=f"Script Extender ativo: {os.path.basename(se_path)}")
    return se_path


def _step_deploy(game_path: str, staging_dir: str, modlist: list, game_id: str):
    """Implantar mods."""
    if not modlist:
        _emit("progress", step="deploy", message="Nenhum mod para implantar", percent=80)
        return

    _emit("progress", step="deploy", message="Implantando mods...", percent=75)
    try:
        from core.deploy import deploy_mods
        r = deploy_mods(game_id, game_path, staging_dir, modlist)
        _emit("progress", step="deploy",
              message=f"Mods implantados ({r.get('count', 0)} operações)", percent=80)
    except Exception as e:
        _emit("log", level="warn", message=f"Deploy: {e}")


def _step_launch(game_path: str, prefix_path: str, proton_path: str, steam_app_id: str, game_id: str, se_path: str | None = None, prefer_custom_prefix: bool = False) -> dict:
    """Lança o jogo."""
    _emit("progress", step="launch", message="Iniciando jogo...", percent=90)

    if se_path:
        exe_path = os.path.relpath(se_path, game_path)
    else:
        from core.games_registry import get_launch_exe
        exe_path = get_launch_exe(game_id, None)
        if not exe_path:
            for root, dirs, files in os.walk(game_path):
                for f in files:
                    if f.endswith(".exe") and "launcher" not in f.lower() and "setup" not in f.lower():
                        exe_path = os.path.relpath(os.path.join(root, f), game_path)
                        break
                if exe_path:
                    break
    if not exe_path:
        raise RuntimeError("Nenhum executável encontrado")

    from core.engine.launch import launch_game
    return launch_game(
        game_path=game_path, exe_path=exe_path,
        prefix_path=prefix_path, proton_path=proton_path,
        steam_app_id=steam_app_id.strip() if steam_app_id else None,
        prefer_custom_prefix=prefer_custom_prefix,
    )


# ─── Main ──────────────────────────────────────────────────────

def play_game(game_id: str, profile: str = "Default") -> dict:
    _start_all = time.monotonic()
    _emit("play_started", gameId=game_id, profile=profile)

    try:
        config = _load_game_config(game_id)
        game_path = config.get("gamePath")
        staging_dir = config.get("stagingDir") or _default_staging_dir(game_id)
        prefix_path = config.get("protonPrefix") or _default_prefix_dir(game_id)
        prefix_path = os.path.expanduser(prefix_path)
        proton_version = config.get("protonVersion", "")
        steam_app_id = str(config.get("steamAppId", "") or "")

        _emit("progress", step="detect", message="Carregando configuração...", percent=5)

        # ── Detect ──
        if not game_path or not os.path.isdir(os.path.expanduser(game_path)):
            _emit("progress", step="detect", message="Detectando jogo...", percent=10)
            detection = detect_game(game_id)
            if not detection.get("gamePath"):
                _emit("error", step="detect", message="Jogo não encontrado")
                return {"success": False, "error": "Jogo não encontrado", "failedStep": "detect"}
            game_path = detection["gamePath"]
            steam_app_id = str(detection.get("steamAppId", "") or steam_app_id)
            storage.put(f"game:{game_id}:config", {
                "gamePath": game_path, "stagingDir": staging_dir,
                "protonPrefix": prefix_path, "protonVersion": proton_version,
                "steamAppId": steam_app_id,
            })
            _emit("progress", step="detect",
                  message=f"Jogo encontrado: {os.path.basename(game_path)}",
                  source=detection.get("source"), percent=15)
        else:
            game_path = os.path.expanduser(game_path)
            _emit("progress", step="detect", message=f"Jogo: {os.path.basename(game_path)}", percent=15)

        native = game_id in _NATIVE_LINUX

        if not native:
            # ── Proton ──
            _emit("progress", step="proton", message="Verificando Proton...", percent=20)
            proton_path = _step_proton(proton_version, game_path, steam_app_id)
            _emit("progress", step="proton",
                  message=f"Proton: {os.path.basename(os.path.dirname(proton_path))}", percent=25)

            # ── Prefix ──
            _emit("progress", step="prefix", message="Verificando prefixo...", percent=28)
            _step_prefix(prefix_path, proton_path, game_id, steam_app_id)
            _emit("progress", step="prefix", message="Prefixo OK", percent=32)

            # ── Configs ──
            _emit("progress", step="configs", message="Verificando configurações...", percent=35)
            _step_dll_overrides(prefix_path, game_id)
            _step_bethesda_registry(prefix_path, proton_path, game_id, game_path, steam_app_id)
            _emit("progress", step="configs", message="Configurações aplicadas", percent=55)

            # ── Script Extender ──
            se_path = _step_script_extender(game_path, game_id)
            _emit("progress", step="skse", message="Script Extender OK", percent=70)
        else:
            _emit("progress", step="proton", message="Jogo nativo Linux", percent=20)

        # ── Deploy ──
        modlist = _get_modlist(game_id, profile)
        _step_deploy(game_path, staging_dir, modlist, game_id)

        # ── Launch ──
        prefer_custom = bool(prefix_path)

        if native:
            launch_result = {"success": True, "pid": None, "method": "native"}
        else:
            launch_result = _step_launch(game_path, prefix_path, proton_path, steam_app_id, game_id, se_path, prefer_custom_prefix=prefer_custom)

        total_ms = (time.monotonic() - _start_all) * 1000

        if launch_result.get("success"):
            _emit("progress", step="launch",
                  message=f"Jogo iniciado (PID: {launch_result.get('pid')})",
                  method=launch_result.get("method"), percent=100)
            _emit("play_completed", success=True, method=launch_result.get("method"),
                  total_duration_ms=total_ms)
            return {"success": True, "pid": launch_result.get("pid"),
                    "method": launch_result.get("method"), "gamePath": game_path}
        else:
            _emit("error", step="launch", message=launch_result.get("error", "Falha ao iniciar"))
            _emit("play_completed", success=False, error=launch_result.get("error"),
                  total_duration_ms=total_ms)
            return {"success": False, "error": launch_result.get("error"), "failedStep": "launch"}

    except Exception as e:
        total_ms = (time.monotonic() - _start_all) * 1000
        _emit("error", step="exception", message=str(e)[:200])
        _emit("play_completed", success=False, error=str(e)[:200], total_duration_ms=total_ms)
        traceback.print_exc()
        return {"success": False, "error": str(e)[:200], "failedStep": "unknown"}
