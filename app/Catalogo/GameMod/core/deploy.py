"""
core/deploy.py — Deploy de mods (hardlink → symlink → copy cascade).

Espelha a lógica de _shared/ dos GameModules TS.

Link modes:
  hardlink → symlink → copy

Estrutura do staging dir:
  {staging_dir}/
    {mod_name}/
      (conteúdo do mod, ex: Data/, skse_loader.exe, etc.)
"""

import os
import shutil
import stat
import json
import errno

from enum import Enum
from typing import Optional


class LinkMode(Enum):
    HARDLINK = "hardlink"
    SYMLINK = "symlink"
    COPY = "copy"
    REDIRECT = "redirect"


# ─── Deploy ───────────────────────────────────────────────────

def deploy_mods(
    game_id: str,
    game_path: str,
    staging_dir: str,
    modlist: list[dict],
    link_mode: LinkMode = LinkMode.HARDLINK,
    profile: str = "Default",
) -> dict:
    """
    Implanta mods do staging_dir no game_path.

    Args:
        game_id: ID do jogo
        game_path: Diretório raiz do jogo
        staging_dir: Diretório de staging dos mods
        modlist: Lista de mods ativos (ordenada)
        link_mode: Modo de deploy (hardlink, symlink, copy)
        profile: Nome do perfil

    Returns:
        dict com count, details, errors
    """
    if not os.path.isdir(staging_dir):
        return {"count": 0, "details": [], "errors": ["Staging dir não encontrado"]}

    data_dir = os.path.join(game_path, "Data")
    root_files_target = game_path

    stats = {"hardlinks": 0, "symlinks": 0, "copies": 0, "errors": 0, "skipped": 0}
    details = []
    errors = []

    # Cria symlink do profile/plugins.txt pro prefixo (se Bethesda)
    if _is_bethesda_game(game_id):
        _ensure_bethesda_plugins_symlink(game_id, game_path, profile)

    for mod_entry in modlist:
        mod_name = mod_entry.get("name", "")
        enabled = mod_entry.get("enabled", True)
        if not enabled or not mod_name:
            continue

        mod_src = os.path.join(staging_dir, mod_name)
        if not os.path.isdir(mod_src):
            stats["skipped"] += 1
            continue

        # Deploy rules do jogo
        rules = _get_deploy_rules(game_id)

        if not rules:
            # Fallback: Data/ + root
            rules = _detect_mod_structure(mod_src)

        for rule in rules:
            dest_base = _resolve_dest_base(rule, game_path, data_dir)
            source_base = mod_src
            sub_path = rule.get("dest", "")

            if sub_path:
                source_base = os.path.join(mod_src, sub_path)

            if not os.path.isdir(source_base):
                continue

            for root, dirs, files in os.walk(source_base):
                rel = os.path.relpath(root, source_base)
                target_dir = os.path.join(dest_base, rel) if rel != "." else dest_base

                os.makedirs(target_dir, exist_ok=True)

                for fname in files:
                    src_file = os.path.join(root, fname)
                    dst_file = os.path.join(target_dir, fname)

                    # Filtros
                    if rule.get("extensions") and not any(fname.lower().endswith(e.lower()) for e in rule["extensions"]):
                        continue
                    if rule.get("filenames") and fname not in rule["filenames"]:
                        continue
                    if rule.get("folders") and rel.split(os.sep)[0] not in rule["folders"]:
                        continue

                    try:
                        count = _link_file(src_file, dst_file, link_mode)
                        if count:
                            stats[count] += 1
                            details.append({"mod": mod_name, "file": fname, "mode": count})
                    except Exception as e:
                        stats["errors"] += 1
                        errors.append(f"{mod_name}/{fname}: {e}")

    # Archive invalidation (Bethesda)
    if _is_bethesda_game(game_id):
        _run_archive_invalidation(game_path, game_id)

    total = sum(stats[k] for k in ("hardlinks", "symlinks", "copies"))
    return {"count": total, **stats, "details": details, "errors": errors}


def undeploy_mods(
    game_path: str,
    staging_dir: str,
    filemap_path: Optional[str] = None,
) -> dict:
    """Remove todos os links/arquivos implantados."""
    count = 0
    errors = []

    if filemap_path and os.path.isfile(filemap_path):
        with open(filemap_path) as f:
            filemap = json.load(f)
        for entry in filemap:
            dst = entry.get("dst", "")
            if os.path.islink(dst):
                os.unlink(dst)
                count += 1
            elif os.path.isfile(dst) and os.stat(dst).st_nlink > 1:
                os.unlink(dst)
                count += 1
            elif os.path.isfile(dst):
                os.remove(dst)
                count += 1
        return {"removed": count, "errors": errors}

    return {"removed": count, "errors": errors}


# ─── File linking ─────────────────────────────────────────────

def _link_file(
    src: str,
    dst: str,
    mode: LinkMode = LinkMode.HARDLINK,
) -> Optional[str]:
    """Tenta hardlink, fallback symlink, fallback copy."""
    if os.path.exists(dst):
        if os.path.samefile(src, dst):
            return None
        os.remove(dst)

    if mode == LinkMode.HARDLINK:
        try:
            os.link(src, dst)
            return "hardlinks"
        except (OSError, PermissionError):
            pass

        # Fallback symlink
        try:
            os.symlink(src, dst)
            return "symlinks"
        except OSError:
            pass

        # Fallback copy
        try:
            shutil.copy2(src, dst)
            return "copies"
        except OSError as e:
            raise e

    elif mode == LinkMode.SYMLINK:
        try:
            os.symlink(src, dst)
            return "symlinks"
        except OSError:
            try:
                shutil.copy2(src, dst)
                return "copies"
            except OSError as e:
                raise e

    elif mode == LinkMode.COPY:
        try:
            shutil.copy2(src, dst)
            return "copies"
        except OSError as e:
            raise e

    return None


# ─── Bethesda helpers ─────────────────────────────────────────

def _is_bethesda_game(game_id: str) -> bool:
    bethesda_ids = {
        "skyrim", "skyrim_se", "skyrim_vr",
        "enderal", "enderal_se",
        "fallout3", "falloutnv", "fallout4", "fallout4_vr",
        "oblivion", "morrowind", "starfield",
    }
    return game_id in bethesda_ids


def _ensure_bethesda_plugins_symlink(game_id: str, game_path: str, profile: str):
    """Cria symlink de plugins.txt no prefixo."""
    try:
        from core.storage import get as storage_get
        config = storage_get(f"game:{game_id}:config") or {}
        prefix_path = config.get("protonPrefix", os.path.expanduser(f"~/Games/Prefix/{game_id}"))

        plugins_src = os.path.join(game_path, "Data", f"{profile}_plugins.txt")
        if not os.path.isfile(plugins_src):
            return

        # Destino no prefixo: drive_c/users/steamuser/Local Settings/Application Data/{game}/plugins.txt
        appdata_map = {
            "skyrim":    "Skyrim",
            "skyrim_se": "Skyrim Special Edition",
            "fallout4":  "Fallout4",
            "falloutnv": "FalloutNV",
            "fallout3":  "Fallout3",
            "oblivion":  "Oblivion",
            "morrowind": "Morrowind",
            "starfield": "Starfield",
        }
        sub = appdata_map.get(game_id, game_id.title())
        plugins_dst = os.path.join(
            prefix_path, "pfx", "drive_c",
            "users", "steamuser",
            "Local Settings", "Application Data", sub, "plugins.txt"
        )
        os.makedirs(os.path.dirname(plugins_dst), exist_ok=True)
        if os.path.isfile(plugins_dst) or os.path.islink(plugins_dst):
            os.remove(plugins_dst)
        os.symlink(plugins_src, plugins_dst)
    except Exception:
        pass


def _run_archive_invalidation(game_path: str, game_id: str):
    """Cria/atualiza arquivos de invalidação de archive."""
    invalidation_map = {
        "skyrim":    {"bsa": "Skyrim - Invalidation.bsa", "ini": "Skyrim.ini"},
        "skyrim_se": {"bsa": "Skyrim - Invalidation.bsa", "ini": "Skyrim.ini"},
        "fallout3":  {"bsa": "Fallout - Invalidation.bsa", "ini": "FALLOUT.INI"},
        "falloutnv": {"bsa": "Fallout - Invalidation.bsa", "ini": "Fallout.ini"},
        "oblivion":  {"bsa": "Oblivion - Invalidation.bsa", "ini": "Oblivion.ini"},
        "morrowind": {"bsa": "Morrowind - Invalidation.bsa", "ini": "Morrowind.ini"},
    }
    info = invalidation_map.get(game_id)
    if not info:
        return

    data_dir = os.path.join(game_path, "Data")
    bsa_path = os.path.join(data_dir, info["bsa"])
    if not os.path.isfile(bsa_path):
        _create_empty_bsa(bsa_path)


def _create_empty_bsa(path: str):
    """Cria um BSA vazio para invalidação."""
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            bsa_header = bytes([
                0x00, 0x01, 0x00, 0x00,  # version
                0x00, 0x00, 0x00, 0x00,  #未知
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00,  # offset (0)
                0x00, 0x00, 0x00, 0x00,  # size (0)
            ])
            f.write(bsa_header)
    except Exception:
        pass


# ─── Deploy rules ─────────────────────────────────────────────

def _get_deploy_rules(game_id: str) -> list[dict]:
    """Retorna regras de deploy do jogo."""
    return _DEPLOY_RULES.get(game_id, [])


_DEPLOY_RULES: dict[str, list[dict]] = {
    # Bethesda LE
    "skyrim": [
        {"dest": "Data", "folders": ["Data"]},
        {"dest": "", "filenames": ["skse_loader.exe", "skse_steam_loader.dll", "skse_1_9_32.dll"]},
        {"dest": "", "extensions": [".dll", ".asi", ".exe"]},
    ],
    "enderal": [
        {"dest": "Data", "folders": ["Data"]},
        {"dest": "", "filenames": ["skse_loader.exe"]},
        {"dest": "", "extensions": [".dll", ".asi", ".exe"]},
    ],
    "fallout3": [
        {"dest": "Data", "folders": ["Data"]},
        {"dest": "", "filenames": ["fose_loader.exe", "fose_1_2.dll"]},
        {"dest": "", "extensions": [".dll", ".asi"]},
    ],
    "falloutnv": [
        {"dest": "Data", "folders": ["Data"]},
        {"dest": "", "filenames": ["nvse_loader.exe", "nvse_1_4.dll"]},
        {"dest": "", "extensions": [".dll", ".asi"]},
    ],
    "oblivion": [
        {"dest": "Data", "folders": ["Data"]},
        {"dest": "", "filenames": ["obse_loader.exe", "obse_1_2_416.dll"]},
        {"dest": "", "extensions": [".dll"]},
    ],
    "morrowind": [
        {"dest": "Data Files", "folders": ["Data Files"]},
        {"dest": "", "filenames": ["MWSE-Update.exe", "mwse_launcher.exe"]},
        {"dest": "", "extensions": [".dll"]},
    ],
    # Bethesda SE/VR
    "skyrim_se": [
        {"dest": "Data", "folders": ["Data"]},
        {"dest": "", "filenames": ["skse64_loader.exe", "skse64_1_6_1170.dll", "skse64_steam_loader.dll"]},
        {"dest": "", "extensions": [".dll", ".asi", ".exe"]},
    ],
    "skyrim_vr": [
        {"dest": "Data", "folders": ["Data"]},
        {"dest": "", "filenames": ["sksevr_loader.exe", "sksevr_1_4_15.dll"]},
        {"dest": "", "extensions": [".dll", ".asi"]},
    ],
    "enderal_se": [
        {"dest": "Data", "folders": ["Data"]},
        {"dest": "", "filenames": ["skse64_loader.exe"]},
        {"dest": "", "extensions": [".dll", ".asi"]},
    ],
    "fallout4": [
        {"dest": "Data", "folders": ["Data"]},
        {"dest": "", "filenames": ["f4se_loader.exe", "f4se_1_10_163.dll"]},
        {"dest": "", "extensions": [".dll", ".asi"]},
    ],
    "fallout4_vr": [
        {"dest": "Data", "folders": ["Data"]},
        {"dest": "", "filenames": ["f4sevr_loader.exe", "f4sevr_0_1_0.dll"]},
        {"dest": "", "extensions": [".dll", ".asi"]},
    ],
    "starfield": [
        {"dest": "Data", "folders": ["Data"]},
        {"dest": "", "filenames": ["sfse_loader.exe", "sfse_1_0_0.dll"]},
        {"dest": "", "extensions": [".dll"]},
    ],
    # Non-Bethesda
    "cyberpunk2077": [
        {"dest": "archive/pc/mod", "folders": ["archive", "archive/pc/mod"]},
        {"dest": "bin/x64/plugins", "folders": ["bin", "plugins"]},
        {"dest": "red4ext", "folders": ["red4ext"]},
    ],
    "witcher3": [
        {"dest": "mods", "folders": ["mods"]},
        {"dest": "dlc", "folders": ["dlc"]},
        {"dest": "bin/x64", "folders": ["bin"]},
    ],
    "valheim": [
        {"dest": "BepInEx/plugins", "folders": ["plugins", "BepInEx/plugins"]},
        {"dest": "", "folders": ["BepInEx"]},
    ],
    "subnautica": [
        {"dest": "BepInEx/plugins", "folders": ["plugins", "BepInEx/plugins"]},
        {"dest": "", "folders": ["BepInEx"]},
    ],
    "stardewvalley": [
        {"dest": "Mods", "folders": ["Mods", "mods"]},
    ],
    "larian": [
        {"dest": "Mods", "folders": ["Mods", "mods"]},
    ],
    "factorio": [
        {"dest": "mods", "folders": ["mods"]},
    ],
    "rimworld": [
        {"dest": "Mods", "folders": ["Mods", "mods"]},
    ],
    "7daystodie": [
        {"dest": "Mods", "folders": ["Mods", "mods"]},
    ],
    "projectzomboid": [
        {"dest": "mods", "folders": ["mods"]},
    ],
    "thelongdark": [
        {"dest": "Mods", "folders": ["Mods", "mods"]},
    ],
    "satisfactory": [
        {"dest": "Mods", "folders": ["Mods", "mods"]},
        {"dest": "", "folders": ["SML"]},
    ],
    "battletech": [
        {"dest": "Mods", "folders": ["Mods", "mods"]},
    ],
    "kerbalspaceprogram": [
        {"dest": "GameData", "folders": ["GameData", "gamedata"]},
    ],
    "dragonageorigins": [
        {"dest": "modules", "folders": ["modules"]},
    ],
    "dragonage2": [
        {"dest": "modules", "folders": ["modules"]},
    ],
    "terraria": [
        {"dest": "Mods", "folders": ["Mods", "mods"]},
    ],
    "masseffect": [
        {"dest": "Mods", "folders": ["Mods", "mods"]},
    ],
    "xcom2": [
        {"dest": "XComGame/Mods", "folders": ["Mods", "XComGame"]},
    ],
}


def _detect_mod_structure(mod_path: str) -> list[dict]:
    """Detecta estrutura do mod e retorna regras apropriadas."""
    rules = []
    has_data = os.path.isdir(os.path.join(mod_path, "Data"))
    has_mods = os.path.isdir(os.path.join(mod_path, "Mods"))
    has_bepinex = os.path.isdir(os.path.join(mod_path, "BepInEx"))
    has_plugins = os.path.isdir(os.path.join(mod_path, "plugins"))
    has_exe = any(f.endswith(".exe") for f in os.listdir(mod_path))

    if has_data:
        rules.append({"dest": "Data", "folders": ["Data"]})
    if has_bepinex:
        rules.append({"dest": "", "folders": ["BepInEx"]})
    if has_plugins:
        rules.append({"dest": "BepInEx/plugins", "folders": ["plugins"]})
    if has_mods:
        rules.append({"dest": "Mods", "folders": ["Mods"]})

    if has_exe:
        rules.append({"dest": "", "extensions": [".exe", ".dll"]})

    # Skyrim root files (SKSE, ENB, etc.)
    for fname in os.listdir(mod_path):
        if fname.endswith((".exe", ".dll", ".asi")):
            if not has_data and not has_mods:
                rules.append({"dest": "", "extensions": [".exe", ".dll", ".asi"]})
            break

    if not rules:
        rules.append({"dest": "Data", "extensions": [".esp", ".esm", ".esl", ".bsa", ".ba2"]})
        rules.append({"dest": "", "extensions": [".dll", ".exe", ".asi"]})

    return rules


def _resolve_dest_base(rule: dict, game_path: str, data_dir: str) -> str:
    """Resolve o diretório base de destino baseado na regra."""
    dest = rule.get("dest", "")
    if dest == "Data":
        return data_dir
    if dest == "":
        return game_path
    return os.path.join(game_path, dest)
