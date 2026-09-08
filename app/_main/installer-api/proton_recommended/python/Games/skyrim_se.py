"""Skyrim Special Edition — game handler."""

from typing import Optional
from .base_game import BaseGame, DeployRule


class SkyrimSEGame(BaseGame):
    game_id = "skyrim_se"
    name = "Skyrim Special Edition"
    steam_app_id = "489830"
    nexus_game_domain = "skyrimspecialedition"
    exe_name = "SkyrimSELauncher.exe"
    data_folder_name = "Data"
    plugin_extensions = {".esp", ".esm", ".esl"}
    loot_game_type = "SkyrimSE"
    supports_bain = True

    def deploy_rules(self):
        return [
            DeployRule("SKSE/*", "SKSE", priority=10, description="SKSE scripts and plugins"),
            DeployRule("skse*.dll", ".", priority=5, description="SKSE root DLLs"),
            DeployRule("*.dll", ".", priority=1, description="Root DLLs (ENB, etc.)"),
        ]
