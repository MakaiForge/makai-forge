"""
core/games_registry.py — Registro de funções por jogo.

Dados extraídos dos GameModules TS em tools/Mods_manager/games/.
Cada jogo tem suas DLL overrides, Makaitricks components,
Script Extender, frameworks e executável de lançamento.
"""

import os
import json
import urllib.request
import urllib.error
import io
import zipfile
import tempfile
import shutil

# ─── DLL Overrides ─────────────────────────────────────────────

_GAME_DLL_OVERRIDES: dict[str, dict[str, str]] = {
    # Bethesda LE (Skyrim, Oblivion, FO3, FNV, Morrowind)
    "skyrim": {
        "winmm": "native,builtin",
        "version": "native,builtin",
        "d3dcompiler_47": "native",
        "x3daudio1_0": "native,builtin",
        "x3daudio1_1": "native,builtin",
        "x3daudio1_2": "native,builtin",
        "x3daudio1_3": "native,builtin",
        "x3daudio1_4": "native,builtin",
        "x3daudio1_5": "native,builtin",
        "x3daudio1_6": "native,builtin",
        "x3daudio1_7": "native,builtin",
    },
    "enderal": {
        "winmm": "native,builtin",
        "version": "native,builtin",
        "d3dcompiler_47": "native",
        "x3daudio1_0": "native,builtin",
        "x3daudio1_1": "native,builtin",
        "x3daudio1_2": "native,builtin",
        "x3daudio1_3": "native,builtin",
        "x3daudio1_4": "native,builtin",
        "x3daudio1_5": "native,builtin",
        "x3daudio1_6": "native,builtin",
        "x3daudio1_7": "native,builtin",
    },
    "oblivion": {
        "winmm": "native,builtin",
        "version": "native,builtin",
        "d3dcompiler_47": "native",
    },
    "fallout3": {
        "winmm": "native,builtin",
        "version": "native,builtin",
        "d3dcompiler_47": "native",
    },
    "falloutnv": {
        "winmm": "native,builtin",
        "version": "native,builtin",
        "d3dcompiler_47": "native",
    },
    "morrowind": {
        "d3d8": "native,builtin",
        "dinput8": "native,builtin",
        "winmm": "native,builtin",
        "version": "native,builtin",
    },
    # Bethesda SE/VR (Skyrim SE, Skyrim VR, FO4, FO4 VR, Starfield)
    "skyrim_se": {
        "winmm": "native,builtin",
        "version": "native,builtin",
        "d3dcompiler_47": "native",
        "x3daudio1_0": "native,builtin",
        "x3daudio1_1": "native,builtin",
        "x3daudio1_2": "native,builtin",
        "x3daudio1_3": "native,builtin",
        "x3daudio1_4": "native,builtin",
        "x3daudio1_5": "native,builtin",
        "x3daudio1_6": "native,builtin",
        "x3daudio1_7": "native,builtin",
    },
    "skyrim_vr": {
        "winmm": "native,builtin",
        "version": "native,builtin",
        "d3dcompiler_47": "native",
        "x3daudio1_0": "native,builtin",
        "x3daudio1_1": "native,builtin",
        "x3daudio1_2": "native,builtin",
        "x3daudio1_3": "native,builtin",
        "x3daudio1_4": "native,builtin",
        "x3daudio1_5": "native,builtin",
        "x3daudio1_6": "native,builtin",
        "x3daudio1_7": "native,builtin",
    },
    "enderal_se": {
        "winmm": "native,builtin",
        "version": "native,builtin",
        "d3dcompiler_47": "native",
        "x3daudio1_0": "native,builtin",
        "x3daudio1_1": "native,builtin",
        "x3daudio1_2": "native,builtin",
        "x3daudio1_3": "native,builtin",
        "x3daudio1_4": "native,builtin",
        "x3daudio1_5": "native,builtin",
        "x3daudio1_6": "native,builtin",
        "x3daudio1_7": "native,builtin",
    },
    "fallout4": {
        "winmm": "native,builtin",
        "version": "native,builtin",
        "d3dcompiler_47": "native",
        "x3daudio1_0": "native,builtin",
        "x3daudio1_1": "native,builtin",
        "x3daudio1_2": "native,builtin",
        "x3daudio1_3": "native,builtin",
        "x3daudio1_4": "native,builtin",
        "x3daudio1_5": "native,builtin",
        "x3daudio1_6": "native,builtin",
        "x3daudio1_7": "native,builtin",
    },
    "fallout4_vr": {
        "winmm": "native,builtin",
        "version": "native,builtin",
        "d3dcompiler_47": "native",
        "x3daudio1_0": "native,builtin",
        "x3daudio1_1": "native,builtin",
        "x3daudio1_2": "native,builtin",
        "x3daudio1_3": "native,builtin",
        "x3daudio1_4": "native,builtin",
        "x3daudio1_5": "native,builtin",
        "x3daudio1_6": "native,builtin",
        "x3daudio1_7": "native,builtin",
    },
    "starfield": {
        "winmm": "native,builtin",
        "version": "native,builtin",
        "d3dcompiler_47": "native",
    },
    # Non-Bethesda
    "cyberpunk2077": {
        "winmm": "native,builtin",
        "version": "native,builtin",
    },
    "witcher3": {
        "winmm": "native,builtin",
        "version": "native,builtin",
    },
    "larian": {
        "winmm": "native,builtin",
        "version": "native,builtin",
    },
}

# ─── Makaitricks Components ────────────────────────────────────

_GAME_MAKAITRICKS: dict[str, list[str]] = {
    "skyrim":          ["d3dx9", "xact", "vcrun2019"],
    "enderal":         ["d3dx9", "xact", "vcrun2019"],
    "oblivion":        ["d3dx9", "xact", "vcrun2019"],
    "fallout3":        ["d3dx9", "xact", "vcrun2019"],
    "falloutnv":       ["d3dx9", "xact", "vcrun2019"],
    "morrowind":       ["d3dx9", "xact", "vcrun2019"],
    "fallout4":        ["vcrun2022", "d3dcompiler_47"],
    "fallout4_vr":     ["vcrun2022", "d3dcompiler_47"],
    "starfield":       ["vcrun2022", "d3dcompiler_47"],
    "cyberpunk2077":   ["d3dcompiler_47"],
    "larian":          ["vcrun2022"],
}

# ─── Script Extenders ──────────────────────────────────────────

_GAME_SCRIPT_EXTENDERS: dict[str, dict] = {
    "skyrim": {
        "name": "SKSE",
        "loader_exe": "skse_loader.exe",
        "release_version": "1_07_03",
        "release_url": "https://skse.silverlock.org/beta/skse_1_07_03.7z",
        "dll_pattern": "skse_1_9_32",
    },
    "skyrim_se": {
        "name": "SKSE64",
        "loader_exe": "skse64_loader.exe",
        "release_version": "2_02_06",
        "release_url": "https://skse.silverlock.org/beta/skse64_2_02_06.7z",
        "dll_pattern": "skse64_1_6_1170",
    },
    "skyrim_vr": {
        "name": "SKSEVR",
        "loader_exe": "sksevr_loader.exe",
        "release_version": "2_00_12",
        "release_url": "https://skse.silverlock.org/beta/sksevr_2_00_12.7z",
        "dll_pattern": "sksevr64_2_00_12",
    },
    "enderal": {
        "name": "SKSE (Enderal LE)",
        "loader_exe": "skse_loader.exe",
        "release_version": "1_07_03",
        "release_url": "https://skse.silverlock.org/beta/skse_1_07_03.7z",
        "dll_pattern": "skse_1_9_32",
    },
    "enderal_se": {
        "name": "SKSE64 (Enderal SE)",
        "loader_exe": "skse64_loader.exe",
        "release_version": "2_02_06",
        "release_url": "https://skse.silverlock.org/beta/skse64_2_02_06.7z",
        "dll_pattern": "skse64_1_6_1170",
    },
    "fallout3": {
        "name": "FOSE",
        "loader_exe": "fose_loader.exe",
        "release_version": "4.2.2",
        "release_url": "https://github.com/llde/FOSE/releases/download/4.2.2/fose_4_2_2.7z",
        "dll_pattern": "fose_4_2_2",
    },
    "falloutnv": {
        "name": "NVSE",
        "loader_exe": "nvse_loader.exe",
        "release_version": "6.2.4",
        "release_url": "https://github.com/llde/NVSE/releases/download/6.2.4/nvse_6_2_4.7z",
        "dll_pattern": "nvse_6_2_4",
    },
    "fallout4": {
        "name": "F4SE",
        "loader_exe": "f4se_loader.exe",
        "release_version": "0.6.23",
        "release_url": "https://f4se.silverlock.org/beta/f4se_0_06_23.7z",
        "dll_pattern": "f4se_0_06_23",
    },
    "fallout4_vr": {
        "name": "F4SEVR",
        "loader_exe": "f4sevr_loader.exe",
        "release_version": "0.2.0",
        "release_url": "https://github.com/llde/F4SEVR/releases/download/0.2.0/f4sevr_0_2_0.7z",
        "dll_pattern": "f4sevr_0_2_0",
    },
    "oblivion": {
        "name": "OBSE",
        "loader_exe": "obse_loader.exe",
        "release_version": "21.0",
        "release_url": "https://github.com/llde/OBSE/releases/download/21.0/obse_21_0.7z",
        "dll_pattern": "obse_21_0",
    },
    "morrowind": {
        "name": "MWSE",
        "loader_exe": "mwse_launcher.exe",
        "release_version": "2.1",
        "release_url": "https://github.com/MWSE/MWSE/releases/download/2.1/MWSE-2.1.7z",
        "dll_pattern": "mwse_2_1",
    },
    "starfield": {
        "name": "SFSE",
        "loader_exe": "sfse_loader.exe",
        "release_version": "0.2.6",
        "release_url": "https://sfse.silverlock.org/beta/sfse_0_2_6.7z",
        "dll_pattern": "sfse_0_2_6",
    },
}

# ─── Frameworks ────────────────────────────────────────────────

_GAME_FRAMEWORKS: dict[str, dict[str, str]] = {
    "skyrim":         {"Script Extender": "skse_loader.exe"},
    "skyrim_se":      {"Script Extender": "skse64_loader.exe"},
    "skyrim_vr":      {"Script Extender": "sksevr_loader.exe"},
    "fallout3":       {"Script Extender": "fose_loader.exe"},
    "falloutnv":      {"Script Extender": "nvse_loader.exe"},
    "fallout4":       {"Script Extender": "f4se_loader.exe"},
    "fallout4_vr":    {"Script Extender": "f4sevr_loader.exe"},
    "oblivion":       {"Script Extender": "obse_loader.exe"},
    "morrowind":      {"MGE XE": "MGEXEgui.exe"},
    "starfield":      {"Script Extender": "sfse_loader.exe"},
    "cyberpunk2077":  {
        "RED4ext": "red4ext/win64/red4ext.dll",
        "Cyber Engine Tweaks": "bin/x64/plugins/cyber_engine_tweaks.asi",
    },
    "valheim":        {"BepInEx": "BepInEx/core/BepInEx.Preloader.dll"},
    "subnautica":     {"BepInEx": "BepInEx/core/BepInEx.Preloader.dll"},
    "stardewvalley":  {"SMAPI": "StardewModdingAPI.exe"},
    "larian":         {"Script Extender": "bg3se_loader.exe"},
    "terraria":       {"tModLoader": "tModLoader.exe"},
    "satisfactory":   {"SML": "SML/Bootstrap.dll"},
    "minecraft":      {
        "Fabric Loader": "fabric-loader.jar",
        "Forge": "forge.jar",
        "NeoForge": "neoforge.jar",
    },
}

# ─── Launch Executáveis ────────────────────────────────────────

_GAME_LAUNCH_EXE: dict[str, str] = {
    "skyrim":                "TESV.exe",
    "skyrim_se":             "SkyrimSE.exe",
    "skyrim_vr":             "SkyrimVR.exe",
    "enderal":               "TESV.exe",
    "enderal_se":            "SkyrimSE.exe",
    "fallout3":              "Fallout3.exe",
    "falloutnv":             "FalloutNV.exe",
    "fallout4":              "Fallout4.exe",
    "fallout4_vr":           "Fallout4VR.exe",
    "oblivion":              "Oblivion.exe",
    "morrowind":             "Morrowind.exe",
    "starfield":             "Starfield.exe",
    "cyberpunk2077":         "Cyberpunk2077.exe",
    "witcher3":              "witcher3.exe",
    "larian":                "bg3.exe",
    "stardewvalley":         "StardewValley",
    "valheim":               "valheim.x86_64",
    "subnautica":            "Subnautica.x86_64",
    "terraria":              "Terraria",
    "rimworld":              "RimWorldLinux",
    "factorio":              "factorio",
    "bannerlord":            "Bannerlord.exe",
    "7daystodie":            "7DaysToDie_EAC",
    "projectzomboid":        "ProjectZomboid64",
    "thelongdark":           "TLD.x86_64",
    "satisfactory":          "FactoryGame.exe",
    "masseffect":            "MassEffectLauncher.exe",
    "xcom2":                 "XCom2.exe",
    "battletech":            "BattleTech.exe",
    "dragonageorigins":      "DAOrigins.exe",
    "dragonage2":            "DragonAge2.exe",
    "kerbalspaceprogram":    "KSP_x64.exe",
    "donotfeedthemonkeys":   "DoNotFeedTheMonkeys.exe",
    "minecraft":             "",
}


# ─── Funções públicas ─────────────────────────────────────────

def get_game_dll_overrides(game_id: str) -> list[dict]:
    overrides = _GAME_DLL_OVERRIDES.get(game_id, {})
    return [{"name": k, "type": v} for k, v in overrides.items()]


def get_game_winetricks(game_id: str) -> list[str]:
    return _GAME_MAKAITRICKS.get(game_id, [])


def get_game_frameworks(game_id: str) -> list[str]:
    fws = _GAME_FRAMEWORKS.get(game_id, {})
    return list(fws.keys())


def is_framework_installed(game_path: str, framework: str) -> bool:
    checks: dict[str, str] = {
        "BepInEx": "BepInEx/core",
        "SMAPI": "StardewModdingAPI.exe",
        "RED4ext": "red4ext/win64/red4ext.dll",
        "Cyber Engine Tweaks": "bin/x64/plugins/cyber_engine_tweaks.asi",
        "Script Extender": "",
        "MGE XE": "MGEXEgui.exe",
        "SML": "SML/Bootstrap.dll",
        "tModLoader": "tModLoader.exe",
        "Fabric Loader": "fabric-loader.jar",
        "Forge": "forge.jar",
        "NeoForge": "neoforge.jar",
    }
    rel = checks.get(framework)
    if not rel:
        return False
    return os.path.exists(os.path.join(game_path, rel))


def install_framework(game_path: str, framework: str):
    raise NotImplementedError(f"Framework {framework} não implementado ainda")


def get_script_extender_info(game_id: str) -> dict | None:
    return _GAME_SCRIPT_EXTENDERS.get(game_id)


def check_script_extender(game_path: str, se_info: dict) -> str | None:
    exe_name = se_info.get("loader_exe", "")
    exe_path = os.path.join(game_path, exe_name)
    if os.path.isfile(exe_path) and os.path.getsize(exe_path) > 0:
        return exe_path
    # Remove arquivo corrompido se existir
    if os.path.lexists(exe_path):
        try:
            os.unlink(exe_path)
        except OSError:
            pass
    return None


def install_script_extender(game_path: str, se_info: dict) -> str | None:
    """
    Baixa e instala o Script Extender (SKSE, F4SE, etc.) no game_path.

    Returns:
        Caminho para o loader, ou None se falhou.
    """
    release_url = se_info.get("release_url")
    loader_exe = se_info.get("loader_exe", "")

    if not release_url:
        raise NotImplementedError("URL de download não configurada para este Script Extender")

    # Verifica se já está instalado (com conteúdo válido)
    loader_path = os.path.join(game_path, loader_exe)
    if os.path.isfile(loader_path) and os.path.getsize(loader_path) > 0:
        return loader_path
    # Remove arquivo corrompido se existir
    if os.path.lexists(loader_path):
        try:
            os.unlink(loader_path)
        except OSError:
            pass

    # Cria diretório temporário
    with tempfile.TemporaryDirectory(prefix="skse_") as tmpdir:
        zip_path = os.path.join(tmpdir, "se.7z")

        try:
            # Download
            _emit_log("info", f"Baixando {se_info['name']} de {release_url}")
            urllib.request.urlretrieve(release_url, zip_path)
        except Exception as e:
            _emit_log("warn", f"Download falhou: {e}")
            return None

        # Extrai — tenta como zip, depois 7z (requer py7zr ou 7z)
        extracted = _extract_archive(zip_path, tmpdir)

        if not extracted:
            _emit_log("warn", "Extração do Script Extender falhou")
            return None

        # Procura os arquivos relevantes
        files_found: list[str] = []
        dll_pattern = se_info.get("dll_pattern", "")

        for root, _dirs, files in os.walk(tmpdir):
            for f in files:
                if f.lower() == loader_exe.lower():
                    files_found.append(os.path.join(root, f))
                elif dll_pattern and dll_pattern.lower() in f.lower() and f.lower().endswith(".dll"):
                    files_found.append(os.path.join(root, f))
                elif f.lower().endswith(".txt") and "readme" in f.lower():
                    pass  # ignora

        if not files_found:
            _emit_log("warn", f"Nenhum arquivo do {se_info['name']} encontrado no archive")
            return None

        # Copia tudo para o game_path
        for src in files_found:
            dst = os.path.join(game_path, os.path.basename(src))
            try:
                shutil.copy2(src, dst)
                os.chmod(dst, 0o755)
                _emit_log("info", f"Instalado: {os.path.basename(dst)}")
            except Exception as e:
                _emit_log("warn", f"Falha ao copiar {os.path.basename(src)}: {e}")

        if os.path.exists(loader_path):
            return loader_path

    return None


def get_launch_exe(game_id: str, se_path: str | None) -> str | None:
    if se_path:
        return os.path.basename(se_path)
    exe = _GAME_LAUNCH_EXE.get(game_id)
    if exe:
        return exe
    return None


# ─── Launcher Swap ────────────────────────────────────────────

_GAME_LAUNCHER_EXE: dict[str, str] = {
    "skyrim":             "SkyrimLauncher.exe",
    "skyrim_se":          "SkyrimSE.exe",
    "skyrim_vr":          "SkyrimVR.exe",
    "enderal":            "TESV.exe",
    "enderal_se":         "SkyrimSE.exe",
    "fallout3":           "Fallout3.exe",
    "falloutnv":          "FalloutNV.exe",
    "fallout4":           "Fallout4.exe",
    "fallout4_vr":        "Fallout4VR.exe",
    "oblivion":           "Oblivion.exe",
    "morrowind":          "Morrowind.exe",
    "starfield":          "Starfield.exe",
}


def swap_launcher(game_path: str, game_id: str, se_loader_exe: str) -> bool:
    """Substitui launcher original pelo SE via swap (Amethyst-style)."""
    launcher_name = _GAME_LAUNCHER_EXE.get(game_id)
    if not launcher_name:
        return False

    launcher = os.path.join(game_path, launcher_name)
    backup   = os.path.join(game_path, launcher_name + ".bak")
    se       = os.path.join(game_path, se_loader_exe)

    if not os.path.isfile(se) or os.path.getsize(se) == 0:
        _emit_log("warn", f"SE loader inválido ou vazio: {se}")
        return False

    # Já está swappado? Se o launcher é o mesmo arquivo que o SE, skip
    if os.path.samefile(launcher, se):
        _emit_log("info", f"Swap já ativo: {launcher_name} -> {se_loader_exe}")
        return True

    # Se o backup já existe, o launcher atual é o SE (swap anterior)
    # Não sobrescreve o backup original
    if os.path.isfile(backup):
        _emit_log("info", f"Backup existe, pulando rename: {launcher_name}.bak preservado")
    elif os.path.isfile(launcher):
        os.rename(launcher, backup)
        _emit_log("info", f"Renomeado {launcher_name} -> {launcher_name}.bak")

    shutil.copy2(se, launcher)
    os.chmod(launcher, 0o755)
    _emit_log("info", f"Copiado {se_loader_exe} -> {launcher_name} (swap)")
    return True


def restore_launcher(game_path: str, game_id: str) -> bool:
    """Reverte swap: restaura .bak."""
    launcher_name = _GAME_LAUNCHER_EXE.get(game_id)
    if not launcher_name:
        return False

    backup   = os.path.join(game_path, launcher_name + ".bak")
    launcher = os.path.join(game_path, launcher_name)

    if not os.path.isfile(backup):
        return False

    if os.path.isfile(launcher):
        os.unlink(launcher)
    os.rename(backup, launcher)
    _emit_log("info", f"Restaurado {launcher_name} de {launcher_name}.bak")
    return True


# ─── Helpers ──────────────────────────────────────────────────

def _extract_archive(archive_path: str, dest_dir: str) -> bool:
    """
    Tenta extrair um arquivo 7z ou zip.
    Tenta py7zr primeiro, depois 7z CLI, depois zipfile.
    """
    # Tenta py7zr (7z)
    try:
        import py7zr
        with py7zr.SevenZipFile(archive_path, mode="r") as z:
            z.extractall(path=dest_dir)
        return True
    except ImportError:
        pass
    except Exception:
        pass

    # Tenta 7z CLI
    try:
        import subprocess
        result = subprocess.run(
            ["7z", "x", archive_path, f"-o{dest_dir}", "-y"],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            return True
    except Exception:
        pass

    # Tenta zipfile (alguns SE vêm como .zip)
    try:
        with zipfile.ZipFile(archive_path) as z:
            z.extractall(dest_dir)
        return True
    except Exception:
        pass

    return False


def _emit_log(level: str, message: str):
    """Emite evento de log via stdout."""
    try:
        import sys, json
        payload = {"event": "log", "level": level, "message": message}
        sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
        sys.stdout.flush()
    except Exception:
        pass
