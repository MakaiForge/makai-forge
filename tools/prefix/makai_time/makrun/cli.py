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

    if not sys.argv[1:]:
        parser.print_help(sys.stderr)
        sys.exit(1)

    args = sys.argv[1:]

    if args[0] in PROTON_VERBS:
        if "PROTON_VERB" not in os.environ:
            os.environ["PROTON_VERB"] = args[0]
        args = args[1:]

    exe = args[0] if args else None
    opts = args[1:] if len(args) > 1 else []

    return parser.parse_known_args(sys.argv[1:])[0], exe, opts
