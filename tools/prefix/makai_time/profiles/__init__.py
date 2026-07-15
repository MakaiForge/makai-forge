"""Per-game profile management."""
from makai_time.profiles.manager import (
    load_profile, save_profile, list_profiles, default_profile,
    detect_game, merge_profile,
)
from makai_time.profiles.registry import GAME_PROFILES, find_by_exe, get_profile_safe
from makai_time.profiles.engine import detect_engine, apply_engine_config, ENGINE_HANDLERS
