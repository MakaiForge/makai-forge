import logging
import os
import sys

from makrun.cli import parse_args
from makrun.core.runner import run
from makrun.log import log


def main() -> int:
    if os.geteuid() == 0:
        log.error("Do not run as root")
        return 1

    if os.environ.get("UMU_LOG") in {"1", "debug"}:
        log.setLevel(logging.DEBUG)

    ns, exe, opts = parse_args()

    if not exe:
        log.error("No executable specified")
        return 1

    return run(
        proton_name=ns.proton or os.environ.get("PROTONPATH"),
        exe_path=exe,
        game_id=ns.game_id or os.environ.get("GAMEID"),
    )


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        log.warning("Interrupted")
    except Exception as e:
        log.exception(e)
        sys.exit(1)
