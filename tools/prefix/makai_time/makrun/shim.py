"""
makrun.shim — Makai Shim

Substitui pressure-vessel-unruntime.
Sanitiza o ambiente e chama o runner do Makai Time Runtime diretamente.
"""

import os
import sys

from makrun.core.runner import run
from makrun.log import log


SANITIZE_VARS = {
    "LD_LIBRARY_PATH",
    "LD_AUDIT",
    "LD_PRELOAD",
    "STEAM_RUNTIME",
    "STEAM_RUNTIME_LIBRARY_PATH",
}

KEEP_VARS = {
    "SYSTEM_LD_LIBRARY_PATH",
    "SYSTEM_PATH",
    "PRESSURE_VESSEL_APP_LD_LIBRARY_PATH",
}


def sanitize_env() -> dict[str, str]:
    saved: dict[str, str] = {}
    for var in SANITIZE_VARS:
        val = os.environ.get(var)
        if val:
            saved[var] = val
            del os.environ[var]
    saved["PATH"] = os.environ.get("PATH", "")
    os.environ["PATH"] = "/usr/local/sbin:/usr/sbin:/sbin:/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games"
    for var in KEEP_VARS:
        if var in os.environ:
            saved[var] = os.environ[var]
    return saved


def main() -> int:
    args = sys.argv[1:]

    verb = None
    exe = None
    rest: list[str] = []

    for a in args:
        if a in {"waitforexitandrun", "run", "runinprefix"}:
            verb = a
        else:
            rest.append(a)

    if verb:
        os.environ.setdefault("PROTON_VERB", verb)
    else:
        os.environ.setdefault("PROTON_VERB", "waitforexitandrun")

    if rest:
        exe = rest[-1]

    if not exe:
        for var in ("EXE", "UMU_EXE"):
            val = os.environ.get(var)
            if val:
                exe = val
                break

    saved = sanitize_env()
    os.environ["MAKAI_SHIM_ACTIVE"] = "1"
    log.info("Makai Shim — environment sanitized (%d vars)", len(saved))

    proton_name = os.environ.get("PROTONPATH")
    game_id = os.environ.get("GAMEID")
    dry_run = os.environ.get("MAKAI_DRY_RUN") == "1"

    if exe:
        return run(
            proton_name=proton_name,
            exe_path=exe,
            game_id=game_id,
            dry_run=dry_run,
        )

    log.error("No executable specified")
    log.info("Usage: makai-shim [waitforexitandrun] <exe>")
    return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        log.warning("Interrupted")
    except Exception as e:
        log.exception(e)
        sys.exit(1)
