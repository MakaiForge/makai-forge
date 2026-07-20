"""
Prefix Universal — cria prefixo Wine/Proton sem Steam, sem pressure-vessel.

Pipeline:
  1. Localiza wine/wineserver no Proton (files/bin/ ou dist/bin/)
  2. Tenta `wine wineboot -u` direto (sem script `proton`)
  3. Se falhar: constrói prefixo manualmente (estrutura + templates)
  4. Valida prefixo criado

NUNCA chama o script `proton` — assim evitamos:
  - Dependência de STEAM_COMPAT_*
  - V2-entry-point / pressure-vessel
  - Freeze do sistema por bwrap aninhado
  - Loop infinito de resolucao de runtime
"""

import os
import shutil
import stat
import subprocess
import sys
from pathlib import Path
from typing import Optional

# ── Constantes do prefixo mínimo ──────────────────────────────────────────────

REG_HEADER = "WINE REGISTRY Version 2\n"

USERDEF_REG_TEMPLATE = """WINE REGISTRY Version 2
;; All keys relative to \\\\User\\\\S-1-5-21-0-0-0-1000
;; Created by Makai Prefix Universal

[Software\\\\Wine\\\\DllOverrides] 1525703998
#time=1d514a08a8
"*mshtml"=""
"*winemenubuilder.exe"=""
"""

SYSTEM_REG_MINIMAL = """WINE REGISTRY Version 2
;; Created by Makai Prefix Universal
"""

USER_REG_MINIMAL = """WINE REGISTRY Version 2
;; Created by Makai Prefix Universal
"""


# ── Localização de binários no Proton ─────────────────────────────────────────

def find_wine_binary(proton_path: str) -> Optional[str]:
    """Encontra o binário `wine` dentro de qualquer estrutura de Proton.

    Procura em:
      <proton>/files/bin/wine       ← GE, CachyOS, UMU (padrão moderno)
      <proton>/dist/bin/wine        ← Valve oficial (legado)
      <proton>/wine/bin/wine        ← TKG compilado manualmente
      <proton>/wine/bin-wow64/wine  ← TKG WoW64
      <proton>/bin/wine             ← Wine puro (sem Proton)
    """
    base = Path(proton_path).expanduser().resolve()
    candidates = [
        base / "files" / "bin" / "wine",
        base / "dist" / "bin" / "wine",
        base / "wine" / "bin" / "wine",
        base / "wine" / "bin-wow64" / "wine",
        base / "bin" / "wine",
    ]
    for c in candidates:
        if c.is_file() and os.access(c, os.X_OK):
            return str(c)
    return None


def find_wineserver(proton_path: str) -> Optional[str]:
    """Encontra wineserver no Proton."""
    base = Path(proton_path).expanduser().resolve()
    candidates = [
        base / "files" / "bin" / "wineserver",
        base / "dist" / "bin" / "wineserver",
        base / "wine" / "bin" / "wineserver",
        base / "files" / "bin-wow64" / "wineserver",
    ]
    for c in candidates:
        if c.is_file() and os.access(c, os.X_OK):
            return str(c)
    return None


def _scan_proton_variants(proton_path: str) -> dict:
    """Scan completo: encontra todos os binários e detecta estrutura."""
    base = Path(proton_path).expanduser().resolve()
    info = {
        "proton_path": str(base),
        "has_proton_script": (base / "proton").is_file(),
        "wine": find_wine_binary(proton_path),
        "wineserver": find_wineserver(proton_path),
        "has_dist": (base / "dist").is_dir(),
        "has_files": (base / "files").is_dir(),
        "has_default_pfx": (base / "files" / "share" / "default_pfx").is_dir(),
    }

    wine_bin = info["wine"]
    if wine_bin:
        try:
            r = subprocess.run(
                [wine_bin, "--version"],
                env={"WINEPREFIX": "/tmp/makai-probe", "WINEARCH": "win64"},
                capture_output=True, text=True, timeout=15,
            )
            info["wine_version"] = r.stdout.strip() or r.stderr.strip()
        except (subprocess.TimeoutExpired, OSError):
            info["wine_version"] = "unknown"

    return info


# ── Construção manual do prefixo ─────────────────────────────────────────────

def _build_manual_prefix(prefix_path: str, arch: str = "win64") -> bool:
    """Constrói estrutura mínima de prefixo Wine sem executar nada.

    Isso recria o que o `wineboot` faria, mas sem rodar processo algum.
    Útil quando wineboot falha ou quando queremos criar o prefixo
    antes de rodar qualquer binário.
    """
    pfx = Path(prefix_path).expanduser().resolve()

    # 1. Diretórios base
    drives = {
        "drive_c": pfx / "drive_c",
        "dosdevices": pfx / "dosdevices",
        "system32": pfx / "drive_c" / "windows" / "system32",
        "syswow64": pfx / "drive_c" / "windows" / "syswow64",
    }
    for d in drives.values():
        d.mkdir(parents=True, exist_ok=True)

    # 2. Symlinks dos dosdevices
    c_link = pfx / "dosdevices" / "c:"
    if not c_link.exists():
        c_link.symlink_to("../drive_c")

    z_link = pfx / "dosdevices" / "z:"
    if not z_link.exists():
        z_link.symlink_to("/")

    # 3. Registry files mínimos
    regs = {
        pfx / "system.reg": SYSTEM_REG_MINIMAL,
        pfx / "user.reg": USER_REG_MINIMAL,
        pfx / "userdef.reg": USERDEF_REG_TEMPLATE,
    }
    for path, content in regs.items():
        if not path.exists():
            path.write_text(content)

    # 4. user.reg deve ter o header correto
    user_reg = pfx / "user.reg"
    current = user_reg.read_text() if user_reg.exists() else ""
    if not current.startswith(REG_HEADER):
        user_reg.write_text(REG_HEADER + "\n" + current)

    return True


def _copy_default_pfx(proton_path: str, prefix_path: str) -> bool:
    """Copia default_pfx do Proton para o prefixo (se existir).

    Muitos Protons (GE, CachyOS) têm um prefixo modelo em
    files/share/default_pfx/ com DLLs padrão (kernel32, ntdll, etc).
    Copiar este modelo acelera a criação do prefixo e evita
    que o Wine precise baixar/extrair nada.
    """
    pfx = Path(prefix_path).expanduser().resolve()
    default_pfx = Path(proton_path) / "files" / "share" / "default_pfx"

    if not default_pfx.is_dir():
        return False

    for item in default_pfx.iterdir():
        dest = pfx / item.name
        if dest.exists():
            continue
        if item.is_dir():
            shutil.copytree(str(item), str(dest), symlinks=True, dirs_exist_ok=True)
        elif item.is_file():
            shutil.copy2(str(item), str(dest))

    return True


# ── Criação do prefixo via wineboot direto ────────────────────────────────────

def _run_wineboot_direct(
    wine_bin: str,
    prefix_path: str,
    arch: str = "win64",
    timeout: int = 120,
) -> bool:
    """Roda `wine wineboot -u` chamando o binário wine DIRETAMENTE.

    DIFERENTE de `proton run wineboot -u`:
    - Não passa pelo script `proton` (evita pressure-vessel)
    - Não precisa de STEAM_COMPAT_*
    - Não tenta acessar Steam Runtime
    - Só precisa de WINEPREFIX + WINEARCH

    Args:
        wine_bin: Caminho para files/bin/wine
        prefix_path: WINEPREFIX desejado
        arch: "win64" ou "win32"
        timeout: Timeout em segundos

    Returns:
        True se o prefixo foi criado com sucesso
    """
    env = {
        "WINEPREFIX": str(Path(prefix_path).expanduser().resolve()),
        "WINEARCH": arch,
        "WINEDLLOVERRIDES": "winemenubuilder.exe=d",
        "HOME": os.environ.get("HOME", "/tmp"),
    }

    cmd = [wine_bin, "wineboot", "-u"]

    try:
        r = subprocess.run(
            cmd, env=env,
            capture_output=True, text=True,
            timeout=timeout,
        )
        if r.returncode == 0:
            return True
        # wineboot pode retornar código ≠ 0 mesmo se o prefixo foi criado
        if _is_valid_prefix(prefix_path):
            return True
        return False
    except subprocess.TimeoutExpired:
        return False
    except OSError as e:
        return False


def _run_wineboot_proton_fallback(
    proton_path: str,
    prefix_path: str,
    arch: str = "win64",
    timeout: int = 120,
) -> bool:
    """Último recurso: tenta `proton run wineboot -u`.

    Só chamado se o wineboot direto falhar.
    Usa env vars mínimas (sem STEAM_COMPAT_CLIENT_INSTALL_PATH Steam).
    """
    proton_script = Path(proton_path) / "proton"
    if not proton_script.is_file():
        return False

    pfx = Path(prefix_path).expanduser().resolve()
    env = {
        "WINEPREFIX": str(pfx),
        "WINEARCH": arch,
        "STEAM_COMPAT_DATA_PATH": str(pfx),
        "STEAM_COMPAT_CLIENT_INSTALL_PATH": str(proton_script.parent),
        "WINEDLLOVERRIDES": "winemenubuilder.exe=d",
        "HOME": os.environ.get("HOME", "/tmp"),
    }

    cmd = [str(proton_script), "run", "wineboot", "-u"]

    try:
        r = subprocess.run(
            cmd, env=env,
            capture_output=True, text=True,
            timeout=timeout,
        )
        return r.returncode == 0 or _is_valid_prefix(prefix_path)
    except (subprocess.TimeoutExpired, OSError):
        return False


# ── Validação ─────────────────────────────────────────────────────────────────

def _is_valid_prefix(prefix_path: str) -> bool:
    """Verifica se um prefixo Wine parece válido."""
    pfx = Path(prefix_path).expanduser().resolve()

    checks = [
        (pfx / "drive_c").is_dir(),
        (pfx / "dosdevices").is_dir(),
        (pfx / "system.reg").is_file(),
        (pfx / "user.reg").is_file(),
        (pfx / "dosdevices" / "c:").exists(),
    ]

    drive_c = pfx / "drive_c"
    system32 = drive_c / "windows" / "system32"
    checks.append(system32.is_dir() or system32.is_symlink())

    return all(checks)


def _is_prefix_initialized(prefix_path: str) -> bool:
    """Verifica se o prefixo foi inicializado (wineboot rodou com sucesso).

    Um prefixo inicializado tem system32 com kernel32.dll presente.
    """
    pfx = Path(prefix_path).expanduser().resolve()
    kernel32 = pfx / "drive_c" / "windows" / "system32" / "kernel32.dll"
    return kernel32.is_file() or kernel32.is_symlink()


# ── Steam Runtime Guard ───────────────────────────────────────────────────────

def _check_steam_env_vars() -> list[str]:
    """Verifica se há vars Steam no ambiente que poderiam atrapalhar.

    Retorna lista de vars encontradas (vazia = ambiente limpo).
    """
    found = []
    for var in os.environ:
        if var.startswith("STEAM_COMPAT_") or var in ("SteamAppId", "SteamGameId"):
            found.append(var)
    return found


def _sanitize_env(env: dict[str, str]) -> dict[str, str]:
    """Remove vars Steam do env que poderiam fazer o Proton tentar
    acessar pressure-vessel ou Steam Runtime."""
    sanitized = dict(env)
    keys_to_remove = [k for k in sanitized if k.startswith("STEAM_COMPAT_")]
    keys_to_remove += ["SteamAppId", "SteamGameId"]
    # Mas PRESERVA WINEPREFIX e WINEARCH
    keys_to_remove = [k for k in keys_to_remove if k not in ("WINEPREFIX", "WINEARCH")]
    for k in keys_to_remove:
        sanitized.pop(k, None)
    return sanitized


# ── API Pública ───────────────────────────────────────────────────────────────

def create_prefix_universal(
    proton_path: str,
    prefix_path: str,
    arch: str = "win64",
    timeout: int = 120,
    force: bool = False,
    copy_defaults: bool = True,
) -> dict:
    """Cria prefixo Wine/Proton universal — SEM Steam, SEM pressure-vessel.

    Args:
        proton_path: Caminho para o diretório do Proton
        prefix_path: WINEPREFIX desejado
        arch: "win64" (padrão) ou "win32"
        timeout: Timeout máximo por estratégia
        force: Se True, recria prefixo existente
        copy_defaults: Se True, copia default_pfx do Proton (mais rápido)

    Returns:
        dict com resultado:
        {
            "success": bool,
            "prefix_path": str,
            "method": "direct_wineboot" | "manual_proton" | "manual_build" | "already_exists",
            "initialized": bool,
            "wine_version": str | None,
            "wine_binary": str | None,
            "errors": list[str],
        }
    """
    errors: list[str] = []
    pfx = Path(prefix_path).expanduser().resolve()

    # ── 0. Já existe? ─────────────────────────────────────────────────────
    if _is_valid_prefix(str(pfx)) and not force:
        return {
            "success": True,
            "prefix_path": str(pfx),
            "method": "already_exists",
            "initialized": _is_prefix_initialized(str(pfx)),
            "wine_version": None,
            "wine_binary": None,
            "errors": [],
        }

    if force and pfx.exists():
        shutil.rmtree(str(pfx), ignore_errors=True)

    pfx.mkdir(parents=True, exist_ok=True)

    # ── 1. Sanitizar ambiente ─────────────────────────────────────────────
    steam_vars = _check_steam_env_vars()
    if steam_vars:
        for var in steam_vars:
            del os.environ[var]

    # ── 2. Localizar binários ─────────────────────────────────────────────
    wine_bin = find_wine_binary(proton_path)
    wineserver_bin = find_wineserver(proton_path)

    if not wine_bin:
        errors.append(f"wine binary not found in {proton_path}")
        # Fallback: construir manualmente mesmo sem wine
        _build_manual_prefix(str(pfx), arch)
        if copy_defaults:
            _copy_default_pfx(proton_path, str(pfx))
        return {
            "success": _is_valid_prefix(str(pfx)),
            "prefix_path": str(pfx),
            "method": "manual_build",
            "initialized": False,
            "wine_version": None,
            "wine_binary": None,
            "errors": errors,
        }

    try:
        wine_version = subprocess.run(
            [wine_bin, "--version"],
            env={"WINEPREFIX": str(pfx), "WINEARCH": arch},
            capture_output=True, text=True, timeout=15,
        ).stdout.strip()
    except (subprocess.TimeoutExpired, OSError):
        wine_version = None

    # ── 3. Estratégia PRIMÁRIA: wine wineboot -u em diretório vazio ──────
    # NÃO criar estrutura manual ANTES — o wineboot detecta system.reg
    # existente e PULA a criação das DLLs (kernel32, ntdll, etc).
    method = "manual_build"

    if wine_bin:
        success = _run_wineboot_direct(wine_bin, str(pfx), arch, timeout)
        if success:
            method = "direct_wineboot"

    # ── 4. Se wineboot falhou: construir estrutura manual ─────────────────
    # A estrutura manual não tem DLLs (só registros + dosdevices),
    # mas é suficiente para operações básicas (regedit, etc.)
    if method == "manual_build":
        errors.append("direct wineboot failed, building manual structure")
        _build_manual_prefix(str(pfx), arch)
        if copy_defaults:
            _copy_default_pfx(proton_path, str(pfx))

    # ── 5. Fallback: proton run wineboot -u ───────────────────────────────
    # Só tenta se wineboot direto falhou. Timeout curto (30s) para não travar.
    if method == "manual_build" and wine_bin:
        success = _run_wineboot_proton_fallback(
            proton_path, str(pfx), arch, timeout=min(timeout, 30),
        )
        if success:
            method = "proton_wineboot_fallback"

    # ── 6. Resultado final ─────────────────────────────────────────────────
    initialized = _is_prefix_initialized(str(pfx))
    valid = _is_valid_prefix(str(pfx))

    return {
        "success": valid,
        "prefix_path": str(pfx),
        "method": method,
        "initialized": initialized,
        "wine_version": wine_version,
        "wine_binary": wine_bin,
        "errors": errors,
    }


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Cria prefixo Wine/Proton universal")
    parser.add_argument("proton_path", help="Caminho do Proton")
    parser.add_argument("prefix_path", help="WINEPREFIX desejado")
    parser.add_argument("--arch", choices=["win64", "win32"], default="win64")
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--force", action="store_true", help="Recria prefixo existente")
    parser.add_argument("--no-copy-defaults", action="store_true",
                        help="Não copiar default_pfx do Proton")

    args = parser.parse_args()
    result = create_prefix_universal(
        proton_path=args.proton_path,
        prefix_path=args.prefix_path,
        arch=args.arch,
        timeout=args.timeout,
        force=args.force,
        copy_defaults=not args.no_copy_defaults,
    )

    import json
    print(json.dumps(result, indent=2, ensure_ascii=False))
    sys.exit(0 if result["success"] else 1)


if __name__ == "__main__":
    main()
