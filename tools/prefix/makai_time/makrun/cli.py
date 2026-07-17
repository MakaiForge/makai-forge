import os
import sys
from argparse import ArgumentParser, RawTextHelpFormatter

from makrun import __version__
from makrun.consts import PROTON_VERBS
from makrun.log import log


def parse_args():
    parser = ArgumentParser(
        description="Makai Runner — Unified Linux Wine Game Launcher",
        formatter_class=RawTextHelpFormatter,
    )
    parser.add_argument(
        "-v", "--version",
        action="version",
        version=f"makrun version {__version__}",
    )
    parser.add_argument(
        "--game-id",
        help="Game ID for the prefix (default: makrun-default)",
        default=None,
    )
    parser.add_argument(
        "--proton",
        help="Proton name or path (e.g. UMU-Proton-10.0-4)",
        default=None,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build container command but do not execute",
    )
    parser.add_argument(
        "--display-backend",
        choices=["auto", "x11", "wayland"],
        default="auto",
        help="Display backend for the container",
    )

    if not sys.argv[1:]:
        parser.print_help(sys.stderr)
        sys.exit(1)

    argv = list(sys.argv[1:])

    # Extrai verb (waitforexitandrun, run, etc.) de qualquer posição
    verb = None
    remaining = []
    for a in argv:
        if a in PROTON_VERBS:
            verb = a
        else:
            remaining.append(a)
    if verb:
        os.environ.setdefault("PROTON_VERB", verb)

    parsed, unknown = parser.parse_known_args(remaining)

    exe = unknown[0] if unknown else None

    if parsed.dry_run:
        os.environ["MAKAI_DRY_RUN"] = "1"
    if parsed.display_backend:
        os.environ["DISPLAY_BACKEND"] = parsed.display_backend

    return parsed, exe
