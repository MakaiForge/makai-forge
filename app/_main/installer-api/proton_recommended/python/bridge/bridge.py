#!/usr/bin/env python3
import json, os, sys
from pathlib import Path

BRIDGE_DIR = Path(__file__).resolve().parent

GAMES = [
    {"name": "7 Days to Die", "game_id": "7_Days_to_Die", "steam_id": "251570", "exe_name": "7dLauncher.exe"},
    {"name": "Baldur's Gate 3", "game_id": "baldurs_gate_3", "steam_id": "1086940", "exe_name": "bin/bg3.exe"},
    {"name": "Cyberpunk 2077", "game_id": "cyberpunk_2077", "steam_id": "1091500", "exe_name": "bin/x64/Cyberpunk2077.exe"},
    {"name": "Darktide", "game_id": "darktide", "steam_id": "1361210", "exe_name": "binaries/Darktide.exe"},
    {"name": "Enderal", "game_id": "enderal", "steam_id": "933480", "exe_name": "Enderal Launcher.exe"},
    {"name": "Enderal SE", "game_id": "enderalse", "steam_id": "976620", "exe_name": "Enderal Launcher.exe"},
    {"name": "Fallout 3", "game_id": "Fallout3", "steam_id": "22300", "exe_name": "Fallout3Launcher.exe"},
    {"name": "Fallout 3 GOTY", "game_id": "Fallout3GOTY", "steam_id": "22370", "exe_name": "Fallout3Launcher.exe"},
    {"name": "Fallout 4", "game_id": "Fallout4", "steam_id": "377160", "exe_name": "Fallout4Launcher.exe"},
    {"name": "Fallout 4 VR", "game_id": "Fallout4VR", "steam_id": "611660", "exe_name": "Fallout4VR.exe"},
    {"name": "Fallout New Vegas", "game_id": "FalloutNV", "steam_id": "22380", "exe_name": "FalloutNVLauncher.exe"},
    {"name": "Kingdom Come: Deliverance II", "game_id": "kingdom_come_deliverance_2", "steam_id": "1771300", "exe_name": "bin/Win64MasterMasterSteamPGO/KingdomCome.exe"},
    {"name": "Kingdom Come: Deliverance", "game_id": "kingdom_come_deliverance", "steam_id": "379430", "exe_name": "bin/win64/KingdomCome.exe"},
    {"name": "Lethal Company", "game_id": "Lethal_Company", "steam_id": "1966720", "exe_name": "Lethal Company.exe"},
    {"name": "Marvel Rivals", "game_id": "marvel_rivals", "steam_id": "2767030", "exe_name": "MarvelRivals_Launcher.exe"},
    {"name": "Mewgenics", "game_id": "mewgenics", "steam_id": "686060", "exe_name": "Mewgenics.exe"},
    {"name": "Monster Hunter Wilds", "game_id": "monster_hunter_wilds", "steam_id": "2246340", "exe_name": "MonsterHunterWilds.exe"},
    {"name": "Monster Hunter Rise", "game_id": "monster_hunter_rise", "steam_id": "1446780", "exe_name": "MonsterHunterRise.exe"},
    {"name": "Morrowind", "game_id": "morrowind", "steam_id": "22320", "exe_name": "Morrowind Launcher.exe"},
    {"name": "Morrowind (OpenMW)", "game_id": "morrowind_openmw", "steam_id": "22320", "exe_name": "openmw-launcher"},
    {"name": "Mount & Blade II: Bannerlord", "game_id": "Mount___Blade_II__Bannerlord", "steam_id": "261550", "exe_name": "bin/Win64_Shipping_Client/Bannerlord.Native.exe"},
    {"name": "Oblivion", "game_id": "Oblivion", "steam_id": "22330", "exe_name": "OblivionLauncher.exe"},
    {"name": "Oblivion Remastered", "game_id": "oblivion_remastered", "steam_id": "2623190", "exe_name": "OblivionRemastered.exe"},
    {"name": "Red Dead Redemption 2", "game_id": "red_dead_redemption_2", "steam_id": "1174180", "exe_name": "RDR2.exe"},
    {"name": "Resident Evil Requiem", "game_id": "resident_evil_requiem", "steam_id": "3764200", "exe_name": "re9.exe"},
    {"name": "Resident Evil Village", "game_id": "resident_evil_village", "steam_id": "1196590", "exe_name": "re8.exe"},
    {"name": "Resident Evil 4", "game_id": "resident_evil_4", "steam_id": "2050650", "exe_name": "re4.exe"},
    {"name": "Resident Evil 3", "game_id": "resident_evil_3", "steam_id": "952060", "exe_name": "re3.exe"},
    {"name": "Resident Evil 2", "game_id": "resident_evil_2", "steam_id": "883710", "exe_name": "re2.exe"},
    {"name": "Resident Evil 7", "game_id": "resident_evil_7", "steam_id": "418370", "exe_name": "re7.exe"},
    {"name": "Skyrim", "game_id": "skyrim", "steam_id": "72850", "exe_name": "SkyrimLauncher.exe"},
    {"name": "Skyrim Special Edition", "game_id": "skyrim_se", "steam_id": "489830", "exe_name": "SkyrimSELauncher.exe"},
    {"name": "Skyrim VR", "game_id": "skyrimvr", "steam_id": "611670", "exe_name": "SkyrimVR.exe"},
    {"name": "Slay The Spire 2", "game_id": "Slay_The_Spire_2", "steam_id": "2868840", "exe_name": "SlayTheSpire2"},
    {"name": "Stardew Valley", "game_id": "Stardew_Valley", "steam_id": "413150", "exe_name": "StardewValley"},
    {"name": "Starfield", "game_id": "Starfield", "steam_id": "1716740", "exe_name": "Starfield.exe"},
    {"name": "Street Fighter 6", "game_id": "street_fighter_6", "steam_id": "1364780", "exe_name": "StreetFighter6.exe"},
    {"name": "Subnautica", "game_id": "Subnautica", "steam_id": "264710", "exe_name": "Subnautica.exe"},
    {"name": "Subnautica: Below Zero", "game_id": "Subnautica_Below_Zero", "steam_id": "848450", "exe_name": "SubnauticaZero.exe"},
    {"name": "TCG Card Shop Simulator", "game_id": "TCG_Card_Shop_Simulator", "steam_id": "3070070", "exe_name": "Card Shop Simulator.exe"},
    {"name": "The Sims 4", "game_id": "the_sims_4", "steam_id": "1222670", "exe_name": "TS4_x64.exe"},
    {"name": "The Witcher 3", "game_id": "witcher_3", "steam_id": "292030", "exe_name": "bin/x64/witcher3.exe"},
    {"name": "Valheim", "game_id": "Valheim", "steam_id": "892970", "exe_name": "valheim.x86_64"},
]

def _load_game_configs():
    configs = {}
    config_dir = Path.home() / ".config" / "ProtonForgeMods" / "games"
    if config_dir.is_dir():
        for f in config_dir.iterdir():
            if f.suffix == ".json":
                try:
                    data = json.loads(f.read_text())
                    configs[data.get("name", f.stem)] = data
                except: pass
    return configs

def _get_profiles_dir(game_name: str) -> Path:
    return Path.home() / ".config" / "ProtonForgeMods" / "profiles" / game_name

def _find_steam_library():
    from Utils.steam_finder import find_steam_libraries
    return find_steam_libraries()

_LOOT_MAP = {
    "Enderal": "Skyrim",
    "Enderal SE": "SkyrimSE",
    "Fallout 3": "Fallout3",
    "Fallout 3 GOTY": "Fallout3",
    "Fallout 4": "Fallout4",
    "Fallout 4 VR": "Fallout4VR",
    "Fallout New Vegas": "FalloutNV",
    "Morrowind": "Morrowind",
    "Morrowind (OpenMW)": "Morrowind",
    "Oblivion": "Oblivion",
    "Oblivion Remastered": "Oblivion",
    "Skyrim": "Skyrim",
    "Skyrim Special Edition": "SkyrimSE",
    "Skyrim VR": "SkyrimVR",
    "Starfield": "Starfield",
}

def _resolve_prefix(context: dict | None, configs: dict, game_key: str) -> str:
    if context and context.get("prefix_path"):
        return context["prefix_path"]
    cfg = configs.get(game_key, {})
    return cfg.get("proton_prefix", "")

def cmd_list_games(configs: dict) -> dict:
    result = []
    for g in GAMES:
        cfg = configs.get(g["name"], {})
        name = g["name"]
        loot_type = _LOOT_MAP.get(name, "")
        loot_enabled = bool(loot_type)
        result.append({
            "name": name,
            "game_id": g["game_id"],
            "steam_id": g["steam_id"],
            "configured": bool(cfg.get("game_path")),
            "game_path": cfg.get("game_path", ""),
            "exe_name": g["exe_name"],
            "loot_enabled": loot_enabled,
            "loot_game_type": loot_type,
        })
    return {"ok": True, "data": result}

def cmd_list_profiles(configs: dict, game_key: str) -> dict:
    profiles_dir = _get_profiles_dir(game_key)
    if not profiles_dir.is_dir():
        return {"ok": True, "data": []}
    return {"ok": True, "data": sorted(p.name for p in profiles_dir.iterdir() if p.is_dir())}

def cmd_discover_games(configs: dict) -> dict:
    discovered = []
    try:
        libraries = _find_steam_library()
    except Exception as e:
        return {"ok": True, "data": []}
    for g in GAMES:
        if g["name"] in configs and configs[g["name"]].get("game_path"):
            discovered.append({"name": g["name"], "game_id": g["game_id"], "game_path": configs[g["name"]]["game_path"], "steam_id": g["steam_id"]})
            continue
        sid = g["steam_id"]
        if not sid:
            continue
        from Utils.steam_finder import find_game_by_steam_id
        try:
            p = find_game_by_steam_id(libraries, sid, g["exe_name"])
            if p:
                discovered.append({"name": g["name"], "game_id": g["game_id"], "game_path": str(p), "steam_id": sid})
        except: pass
    return {"ok": True, "data": discovered}

def cmd_sync_steam_games(configs: dict) -> dict:
    synced = []
    try:
        libraries = _find_steam_library()
    except:
        return {"ok": False, "error": "Steam libraries not found"}
    from Utils.steam_finder import find_game_by_steam_id
    for g in GAMES:
        sid = g["steam_id"]
        if not sid: continue
        try:
            p = find_game_by_steam_id(libraries, sid, g["exe_name"])
            if p:
                synced.append({"name": g["name"], "steam_id": sid, "path": str(p)})
        except: pass
    return {"ok": True, "data": synced}

def cmd_deploy(configs: dict, game_key: str, profile: str, game_path: str = "", staging_path: str = "") -> dict:
    return {"ok": False, "error": "Deploy requires Amethyst backend"}

def cmd_restore(configs: dict, game_key: str, game_path: str = "", staging_path: str = "") -> dict:
    return {"ok": False, "error": "Restore requires Amethyst backend"}

def cmd_fomod_parse(configs: dict, mod_directory: str) -> dict:
    return {"ok": False, "error": "FOMOD requires Amethyst backend"}

def cmd_fomod_install(configs: dict, mod_directory: str, selections: dict, staging_dir: str) -> dict:
    return {"ok": False, "error": "FOMOD install requires Amethyst backend"}

def cmd_loot_sort(configs: dict, game_key: str, plugin_names: list, enabled_set: list) -> dict:
    return {"ok": False, "error": "LOOT sorting requires Amethyst backend"}

def _cmd_run_wine_tool(prefix_path: str, tool: str, context: dict | None = None) -> dict:
    if not prefix_path or not os.path.isdir(os.path.dirname(prefix_path)):
        return {"ok": False, "error": "Prefix path not found or not configured. Set context or game config first."}
    try:
        from Utils.wine_runner import run_wine_tool
        result = run_wine_tool(prefix_path, tool)
        return {"ok": True, "data": {"tool": tool, "prefix": prefix_path, "result": result, "context": context}}
    except ImportError:
        return {"ok": False, "error": "wine_runner module not available (Amethyst backend required)"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def _cmd_get_prefix_info(prefix_path: str, context: dict | None = None) -> dict:
    if not prefix_path:
        return {"ok": False, "error": "No prefix path provided"}
    pfx = Path(prefix_path)
    if not pfx.is_dir():
        return {"ok": False, "error": f"Prefix directory not found: {prefix_path}"}
    info = {
        "prefix_path": str(pfx),
        "has_user_reg": (pfx / "user.reg").is_file(),
        "has_system_reg": (pfx / "system.reg").is_file(),
        "has_drive_c": (pfx / "drive_c").is_dir(),
        "context": context,
    }
    return {"ok": True, "data": info}

def main():
    sys.path.insert(0, str(BRIDGE_DIR))
    configs = _load_game_configs()
    for line in sys.stdin:
        line = line.strip()
        if not line: continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            sys.stdout.write(json.dumps({"ok": False, "error": f"Invalid JSON: {e}"}) + "\n")
            sys.stdout.flush()
            continue
        cmd = request.get("cmd", "")
        context = request.get("context", None)
        try:
            if cmd == "list_games": response = cmd_list_games(configs)
            elif cmd == "list_profiles": response = cmd_list_profiles(configs, request.get("game_key", ""))
            elif cmd == "deploy": response = cmd_deploy(configs, request.get("game_key", ""), request.get("profile", "default"))
            elif cmd == "restore": response = cmd_restore(configs, request.get("game_key", ""))
            elif cmd == "discover_games": response = cmd_discover_games(configs)
            elif cmd == "sync_steam_games": response = cmd_sync_steam_games(configs)
            elif cmd == "fomod_parse": response = cmd_fomod_parse(configs, request.get("mod_directory", ""))
            elif cmd == "fomod_install": response = cmd_fomod_install(configs, request.get("mod_directory", ""), request.get("selections", {}), request.get("staging_dir", ""))
            elif cmd == "loot_sort": response = cmd_loot_sort(configs, request.get("game_key", ""), request.get("plugin_names", []), request.get("enabled_set", []))
            elif cmd == "run_wine_tool":
                prefix_path = _resolve_prefix(context, configs, request.get("game_key", ""))
                tool = request.get("tool", "winecfg")
                response = _cmd_run_wine_tool(prefix_path, tool, context)
            elif cmd == "get_prefix_info":
                prefix_path = _resolve_prefix(context, configs, request.get("game_key", ""))
                response = _cmd_get_prefix_info(prefix_path, context)
            else: response = {"ok": False, "error": f"Unknown command: {cmd}"}
        except Exception as e:
            response = {"ok": False, "error": str(e)}
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()

if __name__ == "__main__":
    main()
