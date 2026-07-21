"""_registry — Central registry of all known games with their metadata.

Games that need custom deploy rules have dedicated handler files.
All others are defined here as data and wrapped by GenericGame.

LOOT game type values: Skyrim, SkyrimSE, SkyrimVR, Fallout3, Fallout4,
Fallout4VR, FalloutNV, Oblivion, Morrowind, Starfield, Enderal, EnderalSE
"""

from __future__ import annotations
from typing import Optional
from .base_game import BaseGame, GameInfo, DeployRule

# ── Registry ───────────────────────────────────────────────────────────────────

GAME_DEFS: list[dict] = [
    # === Bethesda / LOOT-enabled ===
    {"game_id": "enderal",            "name": "Enderal",              "steam_app_id": "933480",  "nexus_domain": "enderal",      "exe_name": "Enderal Launcher.exe",              "data_folder": "Data", "loot_type": "Enderal",   "exts": {".esp",".esm",".esl"}},
    {"game_id": "enderalse",          "name": "Enderal SE",           "steam_app_id": "976620",  "nexus_domain": "enderal",      "exe_name": "Enderal Launcher.exe",              "data_folder": "Data", "loot_type": "EnderalSE",  "exts": {".esp",".esm",".esl"}},
    {"game_id": "Fallout3",           "name": "Fallout 3",            "steam_app_id": "22300",   "nexus_domain": "fallout3",     "exe_name": "Fallout3Launcher.exe",              "data_folder": "Data", "loot_type": "Fallout3",   "exts": {".esp",".esm",".esl"}},
    {"game_id": "Fallout3GOTY",       "name": "Fallout 3 GOTY",       "steam_app_id": "22370",   "nexus_domain": "fallout3",     "exe_name": "Fallout3Launcher.exe",              "data_folder": "Data", "loot_type": "Fallout3",   "exts": {".esp",".esm",".esl"}},
    {"game_id": "FalloutNV",          "name": "Fallout New Vegas",    "steam_app_id": "22380",   "nexus_domain": "newvegas",     "exe_name": "FalloutNVLauncher.exe",             "data_folder": "Data", "loot_type": "FalloutNV",  "exts": {".esp",".esm",".esl"}},
    {"game_id": "morrowind",          "name": "Morrowind",            "steam_app_id": "22320",   "nexus_domain": "morrowind",    "exe_name": "Morrowind Launcher.exe",            "data_folder": "Data", "loot_type": "Morrowind",  "exts": {".esp",".esm",".esl"}},
    {"game_id": "morrowind_openmw",   "name": "Morrowind (OpenMW)",   "steam_app_id": "22320",   "nexus_domain": "morrowind",    "exe_name": "openmw-launcher",                   "data_folder": "Data", "loot_type": "Morrowind",  "exts": {".esp",".esm",".esl"}},
    {"game_id": "Oblivion",           "name": "Oblivion",             "steam_app_id": "22330",   "nexus_domain": "oblivion",     "exe_name": "OblivionLauncher.exe",              "data_folder": "Data", "loot_type": "Oblivion",   "exts": {".esp",".esm",".esl"}},
    {"game_id": "oblivion_remastered","name": "Oblivion Remastered",  "steam_app_id": "2623190", "nexus_domain": "oblivion",     "exe_name": "OblivionRemastered.exe",            "data_folder": "Data", "loot_type": "Oblivion",   "exts": {".esp",".esm",".esl"}},
    {"game_id": "skyrim",             "name": "Skyrim",               "steam_app_id": "72850",   "nexus_domain": "skyrim",       "exe_name": "SkyrimLauncher.exe",                "data_folder": "Data", "loot_type": "Skyrim",     "exts": {".esp",".esm",".esl"}},
    {"game_id": "skyrimvr",           "name": "Skyrim VR",            "steam_app_id": "611670",  "nexus_domain": "skyrim",       "exe_name": "SkyrimVR.exe",                      "data_folder": "Data", "loot_type": "SkyrimVR",    "exts": {".esp",".esm",".esl"}},
    {"game_id": "Starfield",          "name": "Starfield",            "steam_app_id": "1716740", "nexus_domain": "starfield",     "exe_name": "Starfield.exe",                     "data_folder": "Data", "loot_type": "Starfield",   "exts": {".esp",".esm",".esl"}},

    # === Non-LOOT (data_folder = root) ===
    {"game_id": "7_Days_to_Die",            "name": "7 Days to Die",               "steam_app_id": "251570",  "exe_name": "7dLauncher.exe"},
    {"game_id": "baldurs_gate_3",           "name": "Baldur's Gate 3",             "steam_app_id": "1086940", "nexus_domain": "baldursgate3",   "exe_name": "bin/bg3.exe"},
    {"game_id": "cyberpunk_2077",           "name": "Cyberpunk 2077",              "steam_app_id": "1091500", "nexus_domain": "cyberpunk2077",  "exe_name": "bin/x64/Cyberpunk2077.exe"},
    {"game_id": "darktide",                 "name": "Darktide",                    "steam_app_id": "1361210", "exe_name": "binaries/Darktide.exe"},
    {"game_id": "kingdom_come_deliverance", "name": "Kingdom Come: Deliverance",   "steam_app_id": "379430",  "nexus_domain": "kingdomcomedeliverance", "exe_name": "bin/win64/KingdomCome.exe"},
    {"game_id": "kingdom_come_deliverance_2","name": "Kingdom Come: Deliverance II","steam_app_id": "1771300", "nexus_domain": "kingdomcomedeliverance2", "exe_name": "bin/Win64MasterMasterSteamPGO/KingdomCome.exe"},
    {"game_id": "Lethal_Company",           "name": "Lethal Company",              "steam_app_id": "1966720", "exe_name": "Lethal Company.exe"},
    {"game_id": "marvel_rivals",            "name": "Marvel Rivals",               "steam_app_id": "2767030", "exe_name": "MarvelRivals_Launcher.exe"},
    {"game_id": "mewgenics",                "name": "Mewgenics",                   "steam_app_id": "686060",  "exe_name": "Mewgenics.exe"},
    {"game_id": "monster_hunter_wilds",     "name": "Monster Hunter Wilds",        "steam_app_id": "2246340", "nexus_domain": "monsterhunterwilds", "exe_name": "MonsterHunterWilds.exe"},
    {"game_id": "monster_hunter_rise",      "name": "Monster Hunter Rise",         "steam_app_id": "1446780", "nexus_domain": "monsterhunterrise",  "exe_name": "MonsterHunterRise.exe"},
    {"game_id": "Mount___Blade_II__Bannerlord", "name": "Mount & Blade II: Bannerlord", "steam_app_id": "261550", "exe_name": "bin/Win64_Shipping_Client/Bannerlord.Native.exe"},
    {"game_id": "red_dead_redemption_2",    "name": "Red Dead Redemption 2",       "steam_app_id": "1174180", "nexus_domain": "rdr2",           "exe_name": "RDR2.exe"},
    {"game_id": "resident_evil_requiem",    "name": "Resident Evil Requiem",       "steam_app_id": "3764200", "exe_name": "re9.exe"},
    {"game_id": "resident_evil_village",    "name": "Resident Evil Village",       "steam_app_id": "1196590", "nexus_domain": "residentevilvillage", "exe_name": "re8.exe"},
    {"game_id": "resident_evil_4",          "name": "Resident Evil 4",             "steam_app_id": "2050650", "nexus_domain": "residentevil4",    "exe_name": "re4.exe"},
    {"game_id": "resident_evil_3",          "name": "Resident Evil 3",             "steam_app_id": "952060",  "nexus_domain": "residentevil3",    "exe_name": "re3.exe"},
    {"game_id": "resident_evil_2",          "name": "Resident Evil 2",             "steam_app_id": "883710",  "nexus_domain": "residentevil2",    "exe_name": "re2.exe"},
    {"game_id": "resident_evil_7",          "name": "Resident Evil 7",             "steam_app_id": "418370",  "nexus_domain": "residentevil7",    "exe_name": "re7.exe"},
    {"game_id": "Slay_The_Spire_2",         "name": "Slay The Spire 2",            "steam_app_id": "2868840", "exe_name": "SlayTheSpire2"},
    {"game_id": "Stardew_Valley",           "name": "Stardew Valley",              "steam_app_id": "413150",  "nexus_domain": "stardewvalley",    "exe_name": "StardewValley"},
    {"game_id": "street_fighter_6",         "name": "Street Fighter 6",            "steam_app_id": "1364780", "exe_name": "StreetFighter6.exe"},
    {"game_id": "Subnautica",               "name": "Subnautica",                  "steam_app_id": "264710",  "nexus_domain": "subnautica",       "exe_name": "Subnautica.exe"},
    {"game_id": "Subnautica_Below_Zero",    "name": "Subnautica: Below Zero",      "steam_app_id": "848450",  "nexus_domain": "subnauticabelowzero", "exe_name": "SubnauticaZero.exe"},
    {"game_id": "TCG_Card_Shop_Simulator",  "name": "TCG Card Shop Simulator",     "steam_app_id": "3070070", "exe_name": "Card Shop Simulator.exe"},
    {"game_id": "the_sims_4",               "name": "The Sims 4",                  "steam_app_id": "1222670", "nexus_domain": "thesims4",         "exe_name": "TS4_x64.exe"},
    {"game_id": "Valheim",                  "name": "Valheim",                     "steam_app_id": "892970",  "nexus_domain": "valheim",          "exe_name": "valheim.x86_64"},
]

# Games with dedicated handler files (not in GAME_DEFS)
DEDICATED_HANDLERS = {
    "Fallout4", "Fallout4VR",
    "skyrim_se",
    "witcher_3",
}

# ── GenericGame ────────────────────────────────────────────────────────────────

class GenericGame(BaseGame):
    """Data-driven game handler for games without custom deploy logic."""

    _abstract = True  # Don't pick up via auto-discover; instantiated by registry

    def __init__(self, data: dict):
        self._data = data

    @property
    def game_id(self) -> str:
        return self._data["game_id"]

    @property
    def name(self) -> str:
        return self._data["name"]

    @property
    def steam_app_id(self) -> Optional[str]:
        return self._data.get("steam_app_id")

    @property
    def nexus_game_domain(self) -> Optional[str]:
        return self._data.get("nexus_domain")

    @property
    def exe_name(self) -> str:
        return self._data.get("exe_name", "")

    @property
    def data_folder_name(self) -> str:
        return self._data.get("data_folder", ".")

    @property
    def plugin_extensions(self) -> set[str]:
        return self._data.get("exts", set())

    @property
    def loot_game_type(self) -> str:
        return self._data.get("loot_type", "")

    @property
    def supports_bain(self) -> bool:
        return bool(self._data.get("exts"))


def create_generic_games() -> list[BaseGame]:
    """Create GenericGame instances for all registry entries not covered by dedicated handlers."""
    games: list[BaseGame] = []
    for data in GAME_DEFS:
        if data["game_id"] in DEDICATED_HANDLERS:
            continue
        games.append(GenericGame(data))
    return games
