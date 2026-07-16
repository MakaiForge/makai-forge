"""
core/game_install.py — Instalação de jogos (portátil ou instalador).

Substitui a lógica que estava em TypeScript em:
  - data/install-api/ForgePipeline/events/open-game/download-installer.ts
  - data/install-api/ForgePipeline/orchestrator/prefix-copier.ts
  - data/install-api/ForgePipeline/orchestrator/prefix-scanner.ts
  - data/install-api/ForgePipeline/orchestrator/snapshot.ts
  - data/install-api/ForgePipeline/orchestrator/change-detector.ts
"""

import hashlib
import json
import os
import re
import shutil
import sys
import time

def _resolve_actual_prefix(prefix_path: str) -> str:
    drive_c = os.path.join(prefix_path, "drive_c")
    if os.path.isdir(os.path.join(drive_c, "windows", "system32")):
        return prefix_path
    pfx = os.path.join(prefix_path, "pfx")
    return pfx if os.path.isdir(os.path.join(pfx, "drive_c", "windows", "system32")) else prefix_path


# ─── detect_installer_type ───────────────────────────────────────

INSTALLER_PATTERNS = [re.compile(r"setup", re.I),
                      re.compile(r"install", re.I),
                      re.compile(r"msi", re.I)]

SCAN_MAX_DEPTH = 2


def _find_installer_in_folder(folder_path: str) -> str | None:
    """Procura .exe com nome de instalador até SCAN_MAX_DEPTH níveis."""
    folder_path = os.path.abspath(folder_path)
    for root, dirs, files in os.walk(folder_path):
        depth = root[len(folder_path):].count(os.sep)
        if depth > SCAN_MAX_DEPTH:
            dirs.clear()
            continue
        for f in files:
            if f.lower().endswith(".exe") and any(p.search(f) for p in INSTALLER_PATTERNS):
                return os.path.join(root, f)
    return None


def detect_installer_type(source_path: str) -> dict:
    """
    Detecta se source_path é instalador ou portátil.

    Returns:
        is_installer: bool
        installer_path: str | None  — caminho do .exe instalador (se aplicável)
        source_path: str             — caminho original
    """
    source_path = os.path.abspath(source_path)

    if not os.path.exists(source_path):
        return {"is_installer": False, "installer_path": None, "source_path": source_path,
                "error": "source_path does not exist"}

    # Arquivo único (.exe/.msi) → sempre instalador
    if os.path.isfile(source_path):
        ext = os.path.splitext(source_path)[1].lower()
        if ext in (".exe", ".msi"):
            return {"is_installer": True, "installer_path": source_path, "source_path": source_path}
        return {"is_installer": False, "installer_path": None, "source_path": source_path}

    # Pasta → procurar .exe com nome de instalador
    installer = _find_installer_in_folder(source_path)
    if installer:
        return {"is_installer": True, "installer_path": installer, "source_path": source_path}

    return {"is_installer": False, "installer_path": None, "source_path": source_path}


# ─── copy_to_prefix ─────────────────────────────────────────────

SKIP_DIRS = {"node_modules", ".git", "__pycache__"}


def _walk_dir(dir_path: str) -> list[str]:
    """Lista todos os arquivos recursivamente, evitando loops de symlink."""
    files: list[str] = []
    seen = set()

    def walk(d: str):
        real = os.path.realpath(d)
        if real in seen:
            return
        seen.add(real)
        try:
            for entry in os.scandir(d):
                if entry.is_dir(follow_symlinks=False):
                    if entry.name in SKIP_DIRS:
                        continue
                    walk(entry.path)
                elif entry.is_file(follow_symlinks=False):
                    files.append(entry.path)
        except PermissionError:
            pass
        except OSError:
            pass

    walk(dir_path)
    return files


def _file_sha256(file_path: str) -> str | None:
    """SHA256 de um arquivo (streaming, 64KB buffer)."""
    h = hashlib.sha256()
    try:
        with open(file_path, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None


def _compute_hashes(files: list[str], base_path: str) -> dict[str, str]:
    """Calcula SHA256 de uma lista de arquivos, em lotes."""
    hashes: dict[str, str] = {}
    batch_size = 20
    total = len(files)

    for i in range(0, total, batch_size):
        batch = files[i:i + batch_size]
        for fp in batch:
            rel = os.path.relpath(fp, base_path)
            h = _file_sha256(fp)
            if h:
                hashes[rel] = h
    return hashes


def copy_to_prefix(source_path: str, prefix_path: str,
                   progress_callback=None) -> dict:
    """
    Copia pasta source_path para drive_c/<folderName>/
    com verificação SHA256 pré e pós.

    progress_callback(percent: int) — opcional, para UI
    """
    source_path = os.path.abspath(source_path)
    prefix_path = os.path.expanduser(prefix_path)
    actual = _resolve_actual_prefix(prefix_path)
    drive_c = os.path.join(actual, "drive_c")
    folder_name = os.path.basename(source_path)
    dest_path = os.path.join(drive_c, folder_name)

    if not os.path.isdir(source_path):
        return {"success": False, "error": "source_path is not a directory",
                "dest_path": None, "files_count": 0}

    # Remove destino existente
    if os.path.exists(dest_path):
        shutil.rmtree(dest_path)

    # Lista arquivos
    all_files = _walk_dir(source_path)
    total = len(all_files)
    if total == 0:
        os.makedirs(dest_path, exist_ok=True)
        return {"success": True, "dest_path": dest_path, "files_count": 0,
                "hashes_ok": True}

    # SHA256 pré-cópia
    if progress_callback:
        progress_callback(5)
    source_hashes = _compute_hashes(all_files, source_path)

    # Cópia em lotes
    batch_size = 50
    copied = 0
    for i in range(0, total, batch_size):
        batch = all_files[i:i + batch_size]
        for src_file in batch:
            rel = os.path.relpath(src_file, source_path)
            dest_file = os.path.join(dest_path, rel)
            os.makedirs(os.path.dirname(dest_file), exist_ok=True)
            try:
                shutil.copy2(src_file, dest_file)
            except OSError:
                pass
        copied += len(batch)
        if progress_callback:
            pct = min(99, int(copied / total * 100))
            progress_callback(pct)

    # Verificação pós-cópia: contagem
    dest_files = _walk_dir(dest_path)
    if len(dest_files) != total:
        return {"success": False,
                "error": f"Count mismatch: source {total}, dest {len(dest_files)}",
                "dest_path": dest_path, "files_count": total}

    # SHA256 pós-cópia + comparação
    if progress_callback:
        progress_callback(90)
    dest_hashes = _compute_hashes(dest_files, dest_path)

    mismatches = []
    for rel, expected in source_hashes.items():
        actual = dest_hashes.get(rel)
        if not actual:
            mismatches.append(f"{rel}: missing in dest")
        elif actual != expected:
            mismatches.append(f"{rel}: hash mismatch")

    hashes_ok = len(mismatches) == 0
    if progress_callback:
        progress_callback(100)

    return {
        "success": hashes_ok,
        "dest_path": dest_path,
        "files_count": total,
        "hashes_ok": hashes_ok,
        "mismatches": mismatches[:10] if mismatches else [],
    }


# ─── scan_prefix_for_exes ───────────────────────────────────────

SYSTEM_DIRS = {
    "windows", "system32", "syswow64", "system", "winsxs",
    "temp", "tmp", "msdownld.tmp", "cache", "logs",
    "perflogs", "recovery", "boot",
}

NEGATIVE_DIRS = {
    "common files", "internet explorer", "windows media player",
    "windows nt", "msbuild", "reference assemblies",
    "microsoft sdks", "microsoft.net", "windows kits",
    "microsoft sql server",
}

EXCLUDED_EXES = {
    "uninstall.exe", "uninst.exe", "uninst000.exe", "unins000.exe",
    "vc_redist.exe", "vcredist.exe", "vcredist_x86.exe", "vcredist_x64.exe",
    "dotnet.exe", "dotnetfx.exe", "dxsetup.exe", "directx.exe", "dxwebsetup.exe",
}

EXCLUDED_PATTERNS = [
    re.compile(r"^vc_redist", re.I), re.compile(r"^vcredist", re.I),
    re.compile(r"^dotnet", re.I), re.compile(r"^dxsetup", re.I),
    re.compile(r"^unins", re.I), re.compile(r"^uninst", re.I),
    re.compile(r"redist", re.I),
]

MAX_CANDIDATES = 5


def scan_prefix_for_exes(prefix_path: str) -> dict:
    """
    Escaneia drive_c por .exe jogáveis.

    Returns:
        candidates: [{path, name, size}]
        suggested_dir: str | None
    """
    prefix_path = os.path.expanduser(prefix_path)
    actual = _resolve_actual_prefix(prefix_path)
    drive_c = os.path.join(actual, "drive_c")

    if not os.path.isdir(drive_c):
        return {"candidates": [], "suggested_dir": None}

    results: list[dict] = []

    def scan(dir_path: str, depth: int = 0):
        if depth > 6:
            return
        base = os.path.basename(dir_path).lower()
        if base in SYSTEM_DIRS or base in NEGATIVE_DIRS:
            return
        try:
            with os.scandir(dir_path) as it:
                for entry in it:
                    if entry.is_dir(follow_symlinks=False):
                        scan(entry.path, depth + 1)
                    elif entry.is_file(follow_symlinks=False) and entry.name.lower().endswith(".exe"):
                        name_lower = entry.name.lower()
                        if name_lower in EXCLUDED_EXES:
                            continue
                        if any(p.search(entry.name) for p in EXCLUDED_PATTERNS):
                            continue
                        try:
                            st = entry.stat()
                            if st.st_size > 1024:
                                results.append({
                                    "path": entry.path,
                                    "name": entry.name,
                                    "size": st.st_size,
                                })
                        except OSError:
                            pass
        except PermissionError:
            pass
        except OSError:
            pass

    scan(drive_c)

    results.sort(key=lambda r: r.get("size", 0), reverse=True)
    candidates = results[:MAX_CANDIDATES]

    suggested_dir = os.path.dirname(candidates[0]["path"]) if candidates else drive_c

    return {"candidates": candidates, "suggested_dir": suggested_dir}


# ─── snapshot_prefix + find_new_executables ──────────────────────

WINE_INTERNAL_DIR_PREFIXES = [
    "windows/", "windows/system32/", "windows/syswow64/",
    "windows/system/", "windows/winsxs/", "windows/installer/",
    "windows/temp/", "windows/msdownld.tmp/",
    "ProgramData/", "Config.Msi/", "$Recycle.Bin/",
]


def _is_wine_internal(rel_path: str) -> bool:
    lower = rel_path.lower()
    return any(lower.startswith(p) for p in WINE_INTERNAL_DIR_PREFIXES)


def snapshot_prefix(prefix_path: str) -> list[dict]:
    """
    Tira snapshot do drive_c: registra todos os arquivos e diretórios.

    Returns: [{path, size, mtimeMs, isDirectory}]
    """
    prefix_path = os.path.expanduser(prefix_path)
    actual = _resolve_actual_prefix(prefix_path)
    drive_c = os.path.join(actual, "drive_c")
    entries: list[dict] = []

    def walk(dir_path: str, rel_prefix: str = ""):
        try:
            with os.scandir(dir_path) as it:
                for entry in it:
                    rel = f"{rel_prefix}/{entry.name}" if rel_prefix else entry.name
                    if entry.is_dir(follow_symlinks=False):
                        try:
                            st = entry.stat()
                            entries.append({
                                "path": rel, "size": 0,
                                "mtimeMs": int(st.st_mtime * 1000),
                                "isDirectory": True,
                            })
                        except OSError:
                            pass
                        walk(entry.path, rel)
                    elif entry.is_file(follow_symlinks=False):
                        try:
                            st = entry.stat()
                            entries.append({
                                "path": rel, "size": st.st_size,
                                "mtimeMs": int(st.st_mtime * 1000),
                                "isDirectory": False,
                            })
                        except OSError:
                            pass
        except PermissionError:
            pass
        except OSError:
            pass

    if os.path.isdir(drive_c):
        walk(drive_c)

    return entries


def find_new_executables(before: list[dict], after: list[dict]) -> list[dict]:
    """
    Compara snapshots, retorna .exe novos (não Wine-internos).

    Returns: [{path, name, size}] — ordenado por mtimeMs (mais recente primeiro)
    """
    before_paths = {e["path"] for e in before}
    before_dirs = {e["path"] for e in before if e.get("isDirectory")}

    after_sorted = sorted(after, key=lambda e: e.get("mtimeMs", 0), reverse=True)

    new_in_new_dirs: list[dict] = []
    new_in_existing_dirs: list[dict] = []
    seen = set()

    for entry in after_sorted:
        if entry.get("isDirectory"):
            continue
        p = entry["path"]
        if not p.lower().endswith(".exe"):
            continue
        if _is_wine_internal(p):
            continue
        if p in before_paths:
            continue
        if p in seen:
            continue
        seen.add(p)

        parent_dir = p.rsplit("/", 1)[0] if "/" in p else ""
        parent_is_new = bool(parent_dir and parent_dir not in before_dirs)

        candidate = {
            "path": p,
            "name": os.path.basename(p),
            "size": entry["size"],
        }

        if parent_is_new:
            new_in_new_dirs.append(candidate)
        else:
            new_in_existing_dirs.append(candidate)

    return new_in_new_dirs + new_in_existing_dirs


# ─── install_game (orquestrador) ─────────────────────────────────

def _run_installer_in_container(installer_exe: str, proton_path: str,
                                prefix_path: str, game_path: str) -> dict:
    """Executa instalador via Makai Time e aguarda exit."""
    import subprocess as _subprocess

    _prefix_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "..", "..", "prefix",
    )
    expanded_proton = os.path.expanduser(proton_path)
    expanded_prefix = os.path.expanduser(prefix_path)

    _cmd = [
        sys.executable, "-m", "makai_time.makai_time",
        "--game-exe", installer_exe,
        "--proton-path", expanded_proton,
        "--prefix-path", expanded_prefix,
        "--game-path", game_path,
        "--quiet",
    ]
    try:
        _proc = _subprocess.Popen(
            _cmd,
            stdout=_subprocess.DEVNULL,
            stderr=_subprocess.DEVNULL,
            start_new_session=False,
            cwd=_prefix_dir,
        )
        _exit_code = _proc.wait()
        return {"exitCode": _exit_code}
    except FileNotFoundError:
        return {"exitCode": -1, "error": "python not found"}


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
    actual = _resolve_actual_prefix(prefix_path)
    drive_c = os.path.join(actual, "drive_c")

    def _progress(step: str, pct: int, msg: str):
        if progress_callback:
            progress_callback(step, pct, msg)

    # Se já tem executável configurado, copiar pasta + escanear
    if existing_exe_path and os.path.isfile(existing_exe_path):
        _progress("copying", 50, "Copiando jogo para o prefixo...")
        folder = source_path if os.path.isdir(source_path) else os.path.dirname(source_path)
        if os.path.isdir(folder):
            copy_to_prefix(folder, prefix_path)
        _progress("scanning", 80, "Procurando executáveis...")
        scan = scan_prefix_for_exes(prefix_path)
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
        result = _run_installer_in_container(
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
        copy_result = copy_to_prefix(folder_path, prefix_path)

        if not copy_result.get("success"):
            return {
                "success": False,
                "candidates": [],
                "suggested_dir": drive_c,
                "method": "installer",
                "error": copy_result.get("error", "Falha ao copiar pasta"),
            }

        _progress("scanning", 90, "Procurando executáveis após cópia...")
        scan = scan_prefix_for_exes(prefix_path)

        _progress("complete", 100, f"{len(scan['candidates'])} executável(eis) encontrado(s)")
        return {
            "success": True,
            "candidates": scan["candidates"],
            "suggested_dir": scan["suggested_dir"],
            "method": "installer_fallback_copy",
        }

    # Portátil: copiar pasta + scan
    _progress("copying", 30, "Copiando jogo portátil para o prefixo...")

    if not os.path.isdir(source_path):
        source_path = os.path.dirname(source_path)

    copy_result = copy_to_prefix(source_path, prefix_path, lambda pct: (
        _progress("copying", 30 + int(pct * 0.4), f"Copiando... {pct}%")
    ))

    if not copy_result.get("success"):
        return {
            "success": False,
            "candidates": [],
            "suggested_dir": drive_c,
            "method": "portable",
            "error": copy_result.get("error", "Falha ao copiar pasta"),
        }

    _progress("scanning", 80, "Procurando executáveis...")
    scan = scan_prefix_for_exes(prefix_path)

    _progress("complete", 100, f"{len(scan['candidates'])} executável(eis) encontrado(s)")
    return {
        "success": True,
        "candidates": scan["candidates"],
        "suggested_dir": scan["suggested_dir"],
        "method": "portable",
    }
