"""
core/play.py — Play flow completo.

Orquestra todo o pipeline: detect → proton → prefix → configs → frameworks → skse → deploy → launch.
Cada etapa emite eventos de progresso via callback para o RPC.
"""

import os
import json
import sys
import time
import traceback

from core import storage
from core.detection import detect_game, find_steam_app_path
from core.engine.prefix import (
    default_prefix_dir,
    is_valid_prefix,
    create_prefix,
)
from core.engine.proton import find_proton, find_umu_run
from core.engine.launch import launch_game
from core.engine.registry import apply_dll_overrides, run_makaitricks


# ─── Event emitter ─────────────────────────────────────────────

def _emit(event_type: str, **data):
    """Envia evento de progresso para o RPC cliente via stdout."""
    payload = {"event": event_type, **data}
    line = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


# ─── Config helpers ────────────────────────────────────────────

def _load_game_config(game_id: str) -> dict:
    config = storage.get(f"game:{game_id}:config") or {}
    if isinstance(config, dict):
        return config
    return {}


def _get_modlist(game_id: str, profile: str = "Default") -> list:
    key = f"game:{game_id}:profile:{profile}:modlist"
    data = storage.get(key)
    if isinstance(data, list):
        return data
    return []


def _default_staging_dir(game_id: str) -> str:
    slug = game_id.lower().replace(" ", "-").replace("/", "-").replace("\\", "-")
    home = os.path.expanduser("~")
    return os.path.join(home, "Games", "Mods", slug, "staging")


# ─── Play Game ─────────────────────────────────────────────────

def play_game(game_id: str, profile: str = "Default") -> dict:
    """
    Executa o pipeline completo de Play.

    Cada etapa emite eventos de progresso via _emit().
    O Electron escuta esses eventos e atualiza a UI.

    Args:
        game_id: ID do jogo
        profile: Nome do perfil (default: "Default")

    Returns:
        dict com success, method (se launched), pid, error, failedStep
    """
    _start_all = time.monotonic()
    _emit("play_started", gameId=game_id, profile=profile)

    try:
        # ── Step 1: Load config ──
        config = _load_game_config(game_id)
        game_path = config.get("gamePath")
        staging_dir = config.get("stagingDir") or _default_staging_dir(game_id)
        prefix_path = config.get("protonPrefix") or default_prefix_dir(game_id)
        prefix_path = os.path.expanduser(prefix_path)
        proton_version = config.get("protonVersion", "")

        _emit("progress", step="detect", message="Carregando configuração...", percent=5)

        # ── Step 2: Detect game ──
        detected_steam_app_id = None
        if not game_path or not os.path.isdir(os.path.expanduser(game_path)):
            _emit("progress", step="detect", message="Detectando jogo...", percent=10)
            detection = detect_game(game_id)
            if detection.get("gamePath"):
                game_path = detection["gamePath"]
                detected_steam_app_id = detection.get("steamAppId")
                # Salva config detectada
                storage.put(f"game:{game_id}:config", {
                    "gamePath": game_path,
                    "stagingDir": staging_dir,
                    "protonPrefix": prefix_path,
                    "protonVersion": proton_version,
                    "steamAppId": detected_steam_app_id or config.get("steamAppId", ""),
                })
                _emit("progress", step="detect",
                      message=f"Jogo encontrado: {os.path.basename(game_path)}",
                      source=detection.get("source"), percent=15)
            else:
                _emit("error", step="detect", message="Jogo não encontrado")
                return {"success": False, "error": "Jogo não encontrado", "failedStep": "detect"}
        else:
            game_path = os.path.expanduser(game_path)
            _emit("progress", step="detect", message=f"Jogo: {os.path.basename(game_path)}", percent=15)

        # steam_app_id: prioridade para detectado, depois config, depois vazio
        steam_app_id = detected_steam_app_id or str(config.get("steamAppId", "") or "")

        # ── Step 3: Ensure Proton ──
        _emit("progress", step="proton", message="Verificando Proton...", percent=20)
        proton_path = find_proton(proton_version) if proton_version else None
        if not proton_path:
            # Tenta via Steam (config_info.vdf)
            if steam_app_id:
                from core.engine.proton import find_compatibility_tool_path
                proton_path = find_compatibility_tool_path(game_path, steam_app_id)
            # Se ainda não achou, procura qualquer Proton disponível
            if not proton_path:
                from core.engine.proton import find_any_proton
                proton_path = find_any_proton()
            if not proton_path:
                _emit("error", step="proton", message="Proton não encontrado")
                return {"success": False, "error": "Proton não encontrado", "failedStep": "proton"}

        _emit("progress", step="proton", message=f"Proton: {os.path.basename(os.path.dirname(proton_path))}", percent=25)

        # ── Step 4: Ensure prefix (opcional) ──
        # Se tiver umu-run, ele gerencia o prefixo automaticamente.
        # Só criamos manualmente se for usar Proton direto.
        has_umu = find_umu_run() is not None
        if not has_umu or not steam_app_id:
            _emit("progress", step="prefix", message="Verificando prefixo...", percent=30)
            if not is_valid_prefix(prefix_path):
                _emit("progress", step="prefix", message="Criando prefixo...", percent=35)
                result = create_prefix(prefix_path, proton_path, game_id, steam_app_id or None)
                if not result.get("created"):
                    _emit("error", step="prefix", message=result.get("error", "Falha ao criar prefixo"))
                    return {"success": False, "error": result.get("error"), "failedStep": "prefix"}
                _emit("progress", step="prefix", message="Prefixo criado", percent=40)
            else:
                _emit("progress", step="prefix", message="Prefixo válido", percent=40)
        else:
            _emit("progress", step="prefix", message="Prefixo gerenciado pelo umu-run", percent=40)

        # ── Step 5: Bridge to Steam (só se criamos prefixo manual) ──
        if not has_umu and steam_app_id:
            _emit("progress", step="bridge", message="Conectando ao Steam...", percent=45)
            try:
                from core.engine.bridge import bridge_prefix_to_steam
                bridge_prefix_to_steam(
                    game_id, prefix_path, steam_app_id,
                    os.path.basename(os.path.dirname(proton_path))
                )
            except Exception as e:
                _emit("log", level="warn", message=f"Bridge ignorado: {e}")

        # ── Step 6: Apply configs ──
        _emit("progress", step="configs", message="Aplicando configurações...", percent=50)
        dll_overrides = _get_dll_overrides(game_id)
        if dll_overrides:
            apply_dll_overrides(prefix_path, dll_overrides)

        # Makaitricks
        winetricks_components = _get_winetricks_components(game_id)
        if winetricks_components:
            _emit("progress", step="configs", message="Makaitricks...", percent=55)
            mt_result = run_makaitricks(prefix_path, winetricks_components, proton_path)
            if not mt_result.get("success"):
                _emit("log", level="warn", message="Makaitricks teve falhas", results=mt_result.get("results"))

        _emit("progress", step="configs", message="Configurações aplicadas", percent=60)

        # ── Step 7: Frameworks ──
        _emit("progress", step="frameworks", message="Verificando frameworks...", percent=65)
        frameworks = _get_frameworks(game_id)
        if frameworks:
            installed = []
            skipped = []
            for fw in frameworks:
                if _is_framework_installed(game_path, fw):
                    skipped.append(fw)
                else:
                    try:
                        _install_framework(game_path, fw)
                        installed.append(fw)
                    except Exception as e:
                        _emit("log", level="warn", message=f"Framework {fw} falhou: {e}")
            _emit("progress", step="frameworks",
                  message=f"Frameworks: {len(installed)} instalados, {len(skipped)} existentes",
                  percent=70)
        else:
            _emit("progress", step="frameworks", message="Sem frameworks necessários", percent=70)

        # ── Step 8: Script Extender ──
        _emit("progress", step="skse", message="Verificando Script Extender...", percent=75)
        se_info = _get_script_extender_info(game_id)
        if se_info:
            se_path = _check_script_extender(game_path, se_info)
            if not se_path:
                _emit("progress", step="skse", message="Instalando Script Extender...", percent=78)
                se_path = _install_script_extender(game_path, se_info)
            if se_path:
                _emit("progress", step="skse", message=f"Script Extender: {os.path.basename(se_path)}", percent=80)
                # Launcher swap (Amethyst-style): substitui o .exe original pelo SE
                try:
                    from core.games_registry import swap_launcher
                    loader = se_info.get("loader_exe", "")
                    if loader:
                        swap_launcher(game_path, game_id, loader)
                except Exception as e:
                    _emit("log", level="warn", message=f"Launcher swap: {e}")
            else:
                _emit("progress", step="skse", message="Script Extender não encontrado", percent=80)
        else:
            _emit("progress", step="skse", message="Sem Script Extender necessário", percent=80)
        modlist = _get_modlist(game_id, profile)
        if modlist:
            try:
                from core.deploy import deploy_mods
                deploy_result = deploy_mods(game_id, game_path, staging_dir, modlist)
                _emit("progress", step="deploy",
                      message=f"Mods implantados ({deploy_result.get('count', 0)} operações)",
                      percent=90)
            except Exception as e:
                _emit("log", level="warn", message=f"Deploy: {e}")
        else:
            _emit("progress", step="deploy", message="Nenhum mod para implantar", percent=90)

        # ── Step 10: Launch ──
        _emit("progress", step="launch", message="Iniciando jogo...", percent=95)

        # Determina o executável
        exe_path = _get_launch_exe(game_id, se_path if se_path else None)
        if not exe_path:
            exe_path = _find_default_exe(game_path)

        # Para Proton funcionar, sempre precisa de um steam_app_id.
        # Se não tiver (GOG/manual), usa o appid genérico do jogo.
        effective_app_id = steam_app_id.strip() if steam_app_id else None
        if not effective_app_id:
            from core.storage import get as storage_get
            cfg = storage_get(f"game:{game_id}:config") or {}
            effective_app_id = str(cfg.get("steamAppId", "")).strip() or None

        launch_result = launch_game(
            game_path=game_path,
            exe_path=exe_path,
            prefix_path=prefix_path,
            proton_path=proton_path,
            steam_app_id=effective_app_id,
        )

        total_ms = (time.monotonic() - _start_all) * 1000

        if launch_result.get("success"):
            _emit("progress", step="launch",
                  message=f"Jogo iniciado (PID: {launch_result.get('pid')})",
                  method=launch_result.get("method"), percent=100)
            _emit("play_completed", success=True, method=launch_result.get("method"),
                  total_duration_ms=total_ms)
            return {
                "success": True,
                "pid": launch_result.get("pid"),
                "method": launch_result.get("method"),
                "gamePath": game_path,
            }
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


# ─── Helpers (placeholder — serão preenchidos conforme migração) ─

def _get_dll_overrides(game_id: str) -> list[dict]:
    """Retorna DLL overrides para o jogo."""
    from core.games_registry import get_game_dll_overrides
    return get_game_dll_overrides(game_id)


def _get_winetricks_components(game_id: str) -> list[str]:
    """Retorna componentes Makaitricks para o jogo."""
    from core.games_registry import get_game_winetricks
    return get_game_winetricks(game_id)


def _get_frameworks(game_id: str) -> list[str]:
    """Retorna frameworks para o jogo."""
    from core.games_registry import get_game_frameworks
    return get_game_frameworks(game_id)


def _is_framework_installed(game_path: str, framework: str) -> bool:
    """Verifica se framework está instalado."""
    from core.games_registry import is_framework_installed
    return is_framework_installed(game_path, framework)


def _install_framework(game_path: str, framework: str):
    """Instala framework."""
    from core.games_registry import install_framework
    install_framework(game_path, framework)


def _get_script_extender_info(game_id: str) -> dict | None:
    """Retorna info do Script Extender para o jogo."""
    from core.games_registry import get_script_extender_info
    return get_script_extender_info(game_id)


def _check_script_extender(game_path: str, se_info: dict) -> str | None:
    """Verifica se Script Extender já está instalado."""
    from core.games_registry import check_script_extender
    return check_script_extender(game_path, se_info)


def _install_script_extender(game_path: str, se_info: dict) -> str | None:
    """Instala Script Extender."""
    from core.games_registry import install_script_extender
    return install_script_extender(game_path, se_info)


def _get_launch_exe(game_id: str, se_path: str | None) -> str | None:
    from core.games_registry import get_launch_exe
    return get_launch_exe(game_id, se_path)


def _find_default_exe(game_path: str) -> str:
    """Tenta encontrar um executável .exe no diretório do jogo."""
    for root, dirs, files in os.walk(game_path):
        for f in files:
            if f.endswith(".exe") and "launcher" not in f.lower() and "setup" not in f.lower():
                rel = os.path.relpath(os.path.join(root, f), game_path)
                # Converte pra caminho no drive_c
                return os.path.join("drive_c", "Program Files", rel).replace("/", "\\")
    return ""
