"""game_install_core.orchestrator — fluxo completo de instalação.

Ponto único de entrada usado por TODOS os fluxos (aba Download, aba Games,
repair, setup-game, CompactFlow):

  1. Detecta se source é instalador ou portátil (detect_installer_type)
  2. Se portátil: copia a pasta inteira pro prefixo (cópia verificada) e
     escaneia DENTRO do prefixo (scan_prefix_for_exes)
  3. Se instalador: snapshot antes → executa instalador (env limpo) →
     snapshot depois → find_new_executables → fallback de cópia
"""

import os

from ._util import resolve_actual_prefix
from .copy import copy_to_prefix
from .detect import detect_installer_type
from .runner import run_installer_in_container
from .scan import scan_prefix_for_exes
from .snapshot import find_new_executables, snapshot_prefix


def install_game(source_path: str, prefix_path: str, proton_path: str,
                 game_id: str = "", existing_exe_path: str | None = None,
                 progress_callback=None) -> dict:
    """
    Fluxo completo de instalação de jogo.

    1. Detecta se source é instalador ou portátil
    2. Se portátil: copia pasta p/ prefixo + scan
    3. Se instalador: snapshot + executa + find_new + fallback

    progress_callback(step, percent, message) — opcional, para UI
    """
    source_path = os.path.abspath(source_path)
    prefix_path = os.path.expanduser(prefix_path)
    proton_path = os.path.expanduser(proton_path)
    actual = resolve_actual_prefix(prefix_path)
    drive_c = os.path.join(actual, "drive_c")
    game_folder_name = os.path.basename(source_path.rstrip("/\\"))

    def _progress(step: str, pct: int, msg: str):
        if progress_callback:
            progress_callback(step, pct, msg)

    # Se já tem executável configurado, copiar pasta + escanear
    if existing_exe_path and os.path.isfile(existing_exe_path):
        _progress("copying", 50, "Copiando jogo para o prefixo...")
        folder = source_path if os.path.isdir(source_path) else os.path.dirname(source_path)
        if os.path.isdir(folder):
            copy_to_prefix(folder, prefix_path, lambda pct: (
                _progress("copying", 50 + int(pct * 0.3), f"Copiando... {pct}%")
            ))
        _progress("scanning", 85, "Procurando executáveis...")
        scan = scan_prefix_for_exes(prefix_path, game_folder_name)
        _progress("complete", 100, f"{len(scan['candidates'])} executável(eis) encontrado(s)")
        return {
            "success": True,
            "candidates": scan["candidates"],
            "suggested_dir": os.path.dirname(existing_exe_path),
            "method": "restore",
        }

    # 1. Detectar tipo
    _progress("analyzing", 5, "Analisando instalador...")
    detection = detect_installer_type(source_path)
    is_installer = detection["is_installer"]
    installer_path = detection["installer_path"]

    if is_installer:
        _progress("preparing", 10, f"Instalador: {os.path.basename(installer_path)}")

        # Snapshot BEFORE
        _progress("snapshot", 15, "Registrando estado do prefixo...")
        before = snapshot_prefix(prefix_path)

        # Executar instalador
        _progress("installing", 30, "Executando instalador...")
        game_path = os.path.dirname(installer_path)
        result = run_installer_in_container(
            installer_path, proton_path, prefix_path, game_path
        )

        if result.get("exitCode") != 0 and result.get("exitCode") != -1:
            _progress("error", 50, f"Instalador encerrou com código {result['exitCode']}")

        # Snapshot AFTER
        _progress("scanning", 70, "Verificando novos arquivos...")
        after = snapshot_prefix(prefix_path)

        # Comparar
        candidates = find_new_executables(before, after)

        if candidates:
            _progress("complete", 100, f"{len(candidates)} executável(eis) encontrado(s)")
            return {
                "success": True,
                "candidates": candidates,
                "suggested_dir": drive_c,
                "method": "installer",
            }

        # Fallback: copiar pasta do jogo para o prefixo
        _progress("copying", 80, "Nenhum executável encontrado. Copiando pasta...")
        folder_path = source_path if os.path.isdir(source_path) else os.path.dirname(source_path)
        copy_result = copy_to_prefix(folder_path, prefix_path, lambda pct: (
            _progress("copying", 80 + int(pct * 0.1), f"Copiando... {pct}%")
        ))

        if not copy_result.get("success"):
            return {
                "success": False,
                "candidates": [],
                "suggested_dir": drive_c,
                "method": "installer",
                "error": copy_result.get("error", "Falha ao copiar pasta"),
            }

        _progress("scanning", 92, "Procurando executáveis após cópia...")
        scan = scan_prefix_for_exes(prefix_path, game_folder_name)

        _progress("complete", 100, f"{len(scan['candidates'])} executável(eis) encontrado(s)")
        return {
            "success": True,
            "candidates": scan["candidates"],
            "suggested_dir": scan["suggested_dir"],
            "method": "installer_fallback_copy",
        }

    # Portátil: copiar pasta + scan
    _progress("copying", 5, "Copiando jogo portátil para o prefixo...")

    # Validações de segurança
    if detection.get("exe_count", 0) == 0 and detection.get("total_files", 0) > 0:
        _progress("copying", 5, "Aviso: nenhum .exe encontrado na pasta, copiando mesmo assim...")
    if detection.get("total_files", 0) > 5000:
        _progress("copying", 5, "Aviso: pasta com muitos arquivos, pode demorar...")
    if detection.get("total_files", 0) > 50000:
        return {"success": False, "candidates": [], "suggested_dir": drive_c,
                "method": "portable",
                "error": f"Pasta muito grande ({detection['total_files']} arquivos). Selecione a pasta do jogo diretamente."}

    if os.path.isfile(source_path):
        source_path = os.path.dirname(source_path)
    if not os.path.isdir(source_path):
        return {"success": False, "candidates": [], "suggested_dir": drive_c,
                "method": "portable",
                "error": f"source_path não encontrado: {source_path}"}

    copy_result = copy_to_prefix(source_path, prefix_path, lambda pct: (
        _progress("copying", 5 + int(pct * 0.92), f"Copiando... {pct}%")
    ))

    if not copy_result.get("success"):
        return {
            "success": False,
            "candidates": [],
            "suggested_dir": drive_c,
            "method": "portable",
            "error": copy_result.get("error", "Falha ao copiar pasta"),
        }

    _progress("scanning", 97, "Procurando executáveis...")
    scan = scan_prefix_for_exes(prefix_path, game_folder_name)

    _progress("complete", 100, f"{len(scan['candidates'])} executável(eis) encontrado(s)")
    return {
        "success": True,
        "candidates": scan["candidates"],
        "suggested_dir": scan["suggested_dir"],
        "method": "portable",
    }
