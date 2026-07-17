"""Anti-cheat database, detection, and container relaxation for Proton games.

Container relaxation flags:
  - no_unshare_pid    → --no-unshare-pid (PID namespace host)
  - no_unshare_cgroup → --no-unshare-cgroup
  - full_dev           → --dev-bind /dev /dev
  - full_proc          → --bind /proc /proc
"""

from makai_time.proton.anticheat.api import (
    detect_anticheat,
    get_ac_env_vars,
    get_ac_container_relaxations,
    get_ac_container_bwrap_flags,
    is_anticheat_compatible,
    has_anticheat,
    list_anticheat_games,
    list_ac_types,
    get_anticheat_info,
    suggest_proton_for_anticheat,
)
from makai_time.proton.anticheat.ac_types import AC_TYPE_INFO
from makai_time.proton.anticheat.container import CONTAINER_RELAX_FLAGS
from makai_time.proton.anticheat.features import ANTICHEAT_FEATURE_ENV_MAP
from makai_time.proton.anticheat.games import GAME_AC_DATABASE
