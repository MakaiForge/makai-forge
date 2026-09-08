"""Fallout 4 VR — game handler."""

from typing import Optional
from .base_game import BaseGame, DeployRule


class Fallout4VRGame(BaseGame):
    game_id = "Fallout4VR"
    name = "Fallout 4 VR"
    steam_app_id = "611660"
    nexus_game_domain = "fallout4"
    exe_name = "Fallout4VR.exe"
    data_folder_name = "Data"
    plugin_extensions = {".esp", ".esm", ".esl"}
    loot_game_type = "Fallout4VR"
    supports_bain = True

    def deploy_rules(self):
        return [
            DeployRule("F4SE/*", "F4SE", priority=10, description="F4SE scripts and plugins"),
            DeployRule("f4se*.dll", ".", priority=5, description="F4SE root DLLs"),
            DeployRule("*.dll", ".", priority=1, description="Root DLLs (ENB, etc.)"),
        ]
