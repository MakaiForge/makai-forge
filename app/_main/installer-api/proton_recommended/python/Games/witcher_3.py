"""The Witcher 3 — game handler."""

from typing import Optional
from .base_game import BaseGame, DeployRule


class Witcher3Game(BaseGame):
    game_id = "witcher_3"
    name = "The Witcher 3"
    steam_app_id = "292030"
    nexus_game_domain = "witcher3"
    exe_name = "bin/x64/witcher3.exe"
    data_folder_name = "."

    def deploy_rules(self):
        return [
            DeployRule("mods/*", "mods", priority=10, description="Witcher 3 mods directory"),
            DeployRule("dlc/*", "dlc", priority=5, description="Witcher 3 DLC-style mods"),
        ]
