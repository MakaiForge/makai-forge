"""base_game — Abstract base class for all game handlers."""

from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class DeployRule:
    """A deploy rule for a game handler.

    Attributes:
        source_glob: Glob pattern relative to mod staging dir (e.g. "*.esp", "SKSE/**")
        dest_subdir: Subdirectory inside the game's data folder to place files (e.g. "SKSE")
        priority: Higher = processed later (overrides earlier)
        description: Human-readable description
    """
    source_glob: str
    dest_subdir: str = "."
    priority: int = 0
    description: str = ""


@dataclass
class GameInfo:
    """Serialisable game info returned by the bridge."""
    name: str
    game_id: str
    steam_app_id: Optional[str]
    nexus_game_domain: Optional[str]
    exe_name: str
    data_folder_name: str
    plugin_extensions: list[str]
    supports_bain: bool
    loot_game_type: str
    configured: bool = False
    game_path: str = ""


class BaseGame(ABC):
    """Abstract base class for game handlers.

    Each game in the manager has a subclass of BaseGame that defines:
      - Identification (steam_app_id, nexus domain)
      - Paths (data folder, plugin extensions)
      - Deploy rules (where mod files go)

    Handlers are auto-discovered by game_loader.py.
    """

    # ── Identity ───────────────────────────────────────────────────────────

    @property
    @abstractmethod
    def game_id(self) -> str:
        """Unique identifier (e.g. 'skyrim_se')."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name displayed in the UI."""

    @property
    def steam_app_id(self) -> Optional[str]:
        """Steam App ID for auto-detection, or None."""
        return None

    @property
    def nexus_game_domain(self) -> Optional[str]:
        """Nexus Mods domain slug (e.g. 'skyrimspecialedition'), or None."""
        return None

    @property
    @abstractmethod
    def exe_name(self) -> str:
        """Game executable filename (relative to game root)."""

    # ── Game structure ─────────────────────────────────────────────────────

    @property
    def data_folder_name(self) -> str:
        """Name of the data folder inside the game directory (e.g. 'Data')."""
        return "."

    @property
    def plugin_extensions(self) -> set[str]:
        """File extensions that are considered plugins (e.g. .esp, .esm)."""
        return set()

    @property
    def supports_bain(self) -> bool:
        """Whether this game supports BAIN installers."""
        return False

    @property
    def loot_game_type(self) -> str:
        """LOOT game type identifier, or empty if not supported."""
        return ""

    # ── Deploy ─────────────────────────────────────────────────────────────

    def deploy_rules(self) -> list[DeployRule]:
        """Custom deploy rules for this game.

        Default: deploy everything to data_folder_name root.
        """
        return []

    def get_staging_path(self, profiles_root: Path) -> Path:
        """Return the per-game staging directory path."""
        return profiles_root / self.game_id

    # ── Serialisation ──────────────────────────────────────────────────────

    def to_game_info(self, configured: bool = False, game_path: str = "") -> GameInfo:
        return GameInfo(
            name=self.name,
            game_id=self.game_id,
            steam_app_id=self.steam_app_id,
            nexus_game_domain=self.nexus_game_domain,
            exe_name=self.exe_name,
            data_folder_name=self.data_folder_name,
            plugin_extensions=sorted(self.plugin_extensions),
            supports_bain=self.supports_bain,
            loot_game_type=self.loot_game_type,
            configured=configured,
            game_path=game_path,
        )
