"""Fallout 4 — game handler."""

from typing import Optional
from .base_game import BaseGame, DeployRule


class Fallout4Game(BaseGame):
    game_id = "Fallout4"
    name = "Fallout 4"
    steam_app_id = "377160"
    nexus_game_domain = "fallout4"
    exe_name = "Fallout4Launcher.exe"
    data_folder_name = "Data"
    plugin_extensions = {".esp", ".esm", ".esl"}
    loot_game_type = "Fallout4"
    supports_bain = True

    def deploy_rules(self):
        return [
            DeployRule("F4SE/*", "F4SE", priority=10, description="F4SE scripts and plugins"),
            DeployRule("f4se*.dll", ".", priority=5, description="F4SE root DLLs"),
            DeployRule("*.dll", ".", priority=1, description="Root DLLs (ENB, etc.)"),
        ]
