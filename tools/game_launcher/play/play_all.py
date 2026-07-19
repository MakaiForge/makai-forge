#!/usr/bin/env python3
"""
play_all.py — Entry point único do Play button.

Arquitetura:
  Electron (UI) → spawns este script → lê eventos JSON do stdout → mostra progresso
  Python faz TUDO: proton, prefixo, configs, makaitricks, frameworks,
  external tools, deploy, container, launch.

Uso:
  python3 play_all.py <game_id> [--profile <name>]

Eventos JSON (stdout):
  {"event": "progress", "step": "...", "message": "...", "percent": N}
  {"event": "log", "level": "info|warn|error", "message": "..."}
  {"event": "play_completed", "success": true|false, ...}
"""

import json
import os
import sys
import time
import traceback
from pathlib import Path

STORAGE_DIR = os.path.expanduser("~/.config/makai-forger")
STORAGE_FILE = os.path.join(STORAGE_DIR, "mods-store.json")
MAKRUN_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "prefix", "makai_time")
VENV_PYTHON = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "venv", "bin", "python3")


def _emit(event_type: str, **data):
    sys.stdout.write(json.dumps({"event": event_type, **data}, ensure_ascii=True, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def _storage_get(key: str):
    try:
        with open(STORAGE_FILE) as f:
            d = json.load(f)
        return d.get(key)
    except Exception:
        return None


def _storage_put(key: str, value):
    try:
        d = {}
        if os.path.exists(STORAGE_FILE):
            with open(STORAGE_FILE) as f:
                d = json.load(f)
        d[key] = value
        with open(STORAGE_FILE, "w") as f:
            json.dump(d, f, indent=2)
    except Exception:
        pass


def _step_detect(game_id: str) -> dict:
    _emit("progress", step="detect", message="Carregando config do jogo...", percent=5)
    config = _storage_get(f"game:{game_id}:config") or {}
    game_path = config.get("gamePath")
    if game_path:
        game_path = os.path.expanduser(game_path)
    prefix_path = config.get("protonPrefix") or os.path.expanduser(f"~/Games/Makai-forger/{game_id}")
    prefix_path = os.path.expanduser(prefix_path)
    proton_version = config.get("protonVersion", "")
    steam_app_id = str(config.get("steamAppId", "") or "")

    if not game_path or not os.path.isdir(game_path):
        _emit("progress", step="detect", message="Detectando jogo...", percent=10)
        from core.detection import detect_game
        detection = detect_game(game_id)
        if not detection.get("gamePath"):
            raise RuntimeError("Jogo não encontrado. Configure em Configurações.")
        game_path = detection["gamePath"]
        steam_app_id = str(detection.get("steamAppId", "") or steam_app_id)
        _storage_put(f"game:{game_id}:config", {
            "gamePath": game_path,
            "stagingDir": config.get("stagingDir") or os.path.expanduser(f"~/Games/Mods/{game_id}/staging"),
            "protonPrefix": prefix_path,
            "protonVersion": proton_version,
            "steamAppId": steam_app_id,
        })

    _emit("progress", step="detect", message=f"Jogo: {os.path.basename(game_path)}", percent=15)
    return {"game_path": game_path, "prefix_path": prefix_path, "proton_version": proton_version, "steam_app_id": steam_app_id}


def _step_proton(proton_version: str, game_path: str, steam_app_id: str, game_id: str) -> str:
    _emit("progress", step="proton", message="Verificando Proton...", percent=20)

    # 1. Tenta o Proton salvo em proton_binary (configurado pelo usuário na UI)
    proton_binary = _storage_get("proton_binary")
    if proton_binary and os.path.isfile(os.path.join(os.path.expanduser(proton_binary), "proton")):
        _emit("progress", step="proton", message=f"Proton: {os.path.basename(proton_binary)}", percent=25)
        return os.path.expanduser(proton_binary)

    # 2. Cache do jogo
    config = _storage_get(f"game:{game_id}:config") or {}
    cached = config.get("protonPath")
    if cached:
        cached = os.path.expanduser(cached)
        proton_exe = os.path.join(cached, "proton")
        if os.path.isfile(proton_exe):
            return proton_exe
        if os.path.isfile(cached):
            return cached

    # 3. Busca por versão
    _emit("progress", step="proton", message="Buscando Proton...", percent=22)
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
        raise RuntimeError("Nenhum Proton encontrado")

    _emit("progress", step="proton", message=f"Proton: {os.path.basename(os.path.dirname(p))}", percent=25)
    return p


def _step_prefix(prefix_path: str, proton_path: str, game_id: str, steam_app_id: str):
    _emit("progress", step="prefix", message="Verificando prefixo...", percent=28)
    from prefix.core import prefix_exists, create_prefix
    if prefix_exists(prefix_path):
        _emit("log", level="info", message=f"Prefixo existe: {prefix_path}")
        _emit("progress", step="prefix", message="Prefixo OK", percent=32)
        return
    _emit("progress", step="prefix", message="Criando prefixo...", percent=30)
    result = create_prefix(game_id=game_id, proton_path=proton_path, prefix_path=prefix_path, auto_dlls=False)
    if not result.get("success"):
        raise RuntimeError(result.get("errors", ["Falha ao criar prefixo"])[0])
    _emit("progress", step="prefix", message="Prefixo OK", percent=32)


def _step_configs(game_id: str, game_path: str, prefix_path: str, proton_path: str, steam_app_id: str):
    _emit("progress", step="configs", message="Aplicando configurações...", percent=35)

    # DLL overrides
    from core.games_registry import get_game_dll_overrides
    from core.engine.registry import apply_dll_overrides
    dlls = get_game_dll_overrides(game_id)
    if dlls:
        user_reg = os.path.join(prefix_path, "user.reg")
        if os.path.isfile(user_reg):
            with open(user_reg, "r", encoding="utf-8", errors="replace") as f:
                text = f.read()
            missing = [d for d in dlls if f'"{d["name"]}"="' not in text]
            if missing:
                apply_dll_overrides(prefix_path, missing)
        else:
            apply_dll_overrides(prefix_path, dlls)
        _emit("log", level="info", message="DLL overrides aplicados")

    # Bethesda registry
    BETHESDA = {"skyrim", "skyrim_se", "skyrim_vr", "enderal", "enderal_se",
                "fallout3", "falloutnv", "fallout4", "fallout4_vr",
                "oblivion", "morrowind", "starfield"}
    if game_id in BETHESDA:
        from core.engine.registry import register_bethesda_game_path
        register_bethesda_game_path(prefix_path, proton_path, game_id, game_path, steam_app_id or None)
        _emit("log", level="info", message="Registro Bethesda aplicado")

    # Makaitricks (winetricks custom)
    from core.games_registry import get_game_winetricks
    from core.engine.makaitricks import run_multiple
    components = get_game_winetricks(game_id)
    if components:
        cache_key = f"game:{game_id}:makaitricks_done"
        if not _storage_get(cache_key):
            _emit("progress", step="configs", message="Makaitricks...", percent=50)
            result = run_multiple(components, prefix_path, proton_path)
            if result.get("success"):
                _storage_put(cache_key, True)
            else:
                _emit("log", level="warn", message="Makaitricks teve falhas", results=result.get("results"))

    # dxvk.conf
    dxvk_path = os.path.join(game_path, "dxvk.conf")
    if not os.path.exists(dxvk_path):
        with open(dxvk_path, "w") as f:
            f.write("# Gerado pelo Makai-Forge\nd3d9.maxAvailableMemory = 4096\nd3d9.presentInterval = 1\ndxvk.enableGraphicsPipelineLibrary = False\ndxvk.numCompilerThreads = 2\n")
        _emit("log", level="info", message="dxvk.conf criado")

    _emit("progress", step="configs", message="Configurações OK", percent=55)


def _step_skse(game_id: str, game_path: str) -> str | None:
    from core.games_registry import get_script_extender_info, check_script_extender, install_script_extender
    info = get_script_extender_info(game_id)
    if not info:
        _emit("progress", step="skse", message="Sem SKSE", percent=72)
        return None
    se_path = check_script_extender(game_path, info)
    if not se_path:
        _emit("progress", step="skse", message="Instalando Script Extender...", percent=70)
        se_path = install_script_extender(game_path, info)
    if se_path:
        _emit("log", level="info", message=f"SKSE: {os.path.basename(se_path)}")
    _emit("progress", step="skse", message="SKSE OK", percent=72)
    return se_path


def _step_deploy(game_id: str, game_path: str, modlist: list):
    if not modlist:
        _emit("progress", step="deploy", message="Nenhum mod", percent=80)
        return
    _emit("progress", step="deploy", message="Implantando mods...", percent=75)
    try:
        from core.deploy import deploy_mods
        r = deploy_mods(game_id, game_path, modlist)
        _emit("progress", step="deploy", message=f"Mods: {r.get('count', 0)} ops", percent=80)
    except Exception as e:
        _emit("log", level="warn", message=f"Deploy: {e}")


def _step_launch(game_path: str, prefix_path: str, proton_path: str, steam_app_id: str, game_id: str, se_path: str | None = None, fork_id: str | None = None, features_count: int = 0) -> dict:
    _emit("progress", step="launch", message="Iniciando jogo...", percent=90)

    # Exe path
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
        game_id=game_id,
        fork_id=fork_id,
        features_count=features_count,
    )


def play_game(game_id: str, profile: str = "Default") -> dict:
    _start = time.monotonic()
    _emit("play_started", gameId=game_id, profile=profile)

    try:
        # Step 1: Detect
        detected = _step_detect(game_id)
        game_path = detected["game_path"]
        prefix_path = detected["prefix_path"]
        proton_version = detected["proton_version"]
        steam_app_id = detected["steam_app_id"]

        # Step 2: Proton
        proton_path = _step_proton(proton_version, game_path, steam_app_id, game_id)

        # Proton Intelligence
        fork_id = None
        features_count = 0
        try:
            sys.path.insert(0, MAKRUN_DIR)
            from makrun.intel import identify_proton
            from makrun.intel.injector import inject_features
            fork_id = identify_proton(os.path.dirname(proton_path))
            injected = inject_features(proton_path=os.path.dirname(proton_path), game_id=game_id, game_exe=game_path)
            features_count = len(injected.get("env", {}))
        except Exception as e:
            _emit("log", level="warn", message=f"Proton Intelligence: {e}")

        # Step 3: Prefix
        _step_prefix(prefix_path, proton_path, game_id, steam_app_id)

        # Step 4: Configs
        _step_configs(game_id, game_path, prefix_path, proton_path, steam_app_id)

        # Step 5: SKSE
        se_path = _step_skse(game_id, game_path)

        # Step 6: Deploy
        modlist_key = f"game:{game_id}:profile:{profile}:modlist"
        modlist = _storage_get(modlist_key) or []
        _step_deploy(game_id, game_path, modlist)

        # Step 7: Launch
        result = _step_launch(game_path, prefix_path, proton_path, steam_app_id, game_id, se_path, fork_id=fork_id, features_count=features_count)

        elapsed = (time.monotonic() - _start) * 1000
        if result.get("success"):
            _emit("progress", step="launch", message=f"Jogo iniciado (PID: {result.get('pid')})", method=result.get("method"), percent=100)
            _emit("play_completed", success=True, method=result.get("method"), total_duration_ms=elapsed)
            return {"success": True, "pid": result.get("pid"), "method": result.get("method")}
        else:
            _emit("error", step="launch", message=result.get("error", "Falha ao iniciar"))
            _emit("play_completed", success=False, error=result.get("error"), total_duration_ms=elapsed)
            return {"success": False, "error": result.get("error"), "failedStep": "launch"}

    except Exception as e:
        elapsed = (time.monotonic() - _start) * 1000
        _emit("error", step="exception", message=str(e)[:200])
        _emit("play_completed", success=False, error=str(e)[:200], total_duration_ms=elapsed)
        traceback.print_exc()
        return {"success": False, "error": str(e)[:200], "failedStep": "unknown"}


def main():
    if len(sys.argv) < 2:
        print("Uso: python3 play_all.py <game_id> [--profile <name>]", file=sys.stderr)
        sys.exit(1)
    game_id = sys.argv[1]
    profile = "Default"
    if "--profile" in sys.argv:
        idx = sys.argv.index("--profile")
        if idx + 1 < len(sys.argv):
            profile = sys.argv[idx + 1]

    # Adiciona Mods_manager ao path para imports
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "Mods_manager"))

    result = play_game(game_id, profile)
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
