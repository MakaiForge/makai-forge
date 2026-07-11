"""
Unified CLI for Wine/Proton operations from TypeScript.
Usage:
  python3 cli.py create-prefix <gameId> <prefixPath> <protonPath> [verb...]
  python3 cli.py install-makaitricks <prefixPath> <protonPath> [verb...]
  python3 cli.py run <exePath> <protonPath> [flags]
  python3 cli.py validate-prefix <prefixPath>
"""

import sys
import os
import json

# Ensure prefix module is importable
_script_dir = os.path.dirname(os.path.abspath(__file__))
if _script_dir not in sys.path:
    sys.path.insert(0, _script_dir)


def cmd_create_prefix(args: list[str]) -> None:
    from prefix.core import create_prefix

    game_id = args[0]
    prefix_path = args[1]
    proton_path = args[2]
    extra_verbs = args[3:] if len(args) > 3 else None

    result = create_prefix(
        game_id=game_id,
        proton_path=proton_path,
        prefix_path=prefix_path,
        auto_dlls=True,
        extra_verbs=extra_verbs,
    )
    print(json.dumps(result))


def cmd_install_makaitricks(args: list[str]) -> None:
    from prefix.makaitricks import install_recommended_dlls

    prefix_path = args[0]
    proton_path = args[1]
    verbs = args[2:]

    result = install_recommended_dlls("", prefix_path, proton_path, verbs)
    print(json.dumps(result))


def cmd_run(args: list[str]) -> None:
    from prefix.runner import run_proton_command_for_game

    # Parse optional --umu flag
    use_umu = False
    filtered = []
    for a in args:
        if a == "--umu":
            use_umu = True
        else:
            filtered.append(a)
    exe_path = filtered[0] if filtered else ""
    proton_path = filtered[1] if len(filtered) > 1 else ""

    # Read critical env vars from the environment (set by TS caller)
    env = {
        "STEAM_COMPAT_DATA_PATH": os.environ.get("STEAM_COMPAT_DATA_PATH", ""),
        "STEAM_COMPAT_CLIENT_INSTALL_PATH": os.environ.get("STEAM_COMPAT_CLIENT_INSTALL_PATH", ""),
        "STEAM_COMPAT_INSTALL_PATH": os.environ.get("STEAM_COMPAT_INSTALL_PATH", ""),
    }
    if os.environ.get("SteamAppId"):
        env["SteamAppId"] = os.environ["SteamAppId"]
    if os.environ.get("SteamGameId"):
        env["SteamGameId"] = os.environ["SteamGameId"]
    if os.environ.get("GAMEID"):
        env["GAMEID"] = os.environ["GAMEID"]
    if os.environ.get("WINEPREFIX"):
        env["WINEPREFIX"] = os.environ["WINEPREFIX"]
    if os.environ.get("PROTON_LOG"):
        env["PROTON_LOG"] = os.environ["PROTON_LOG"]

    returncode = run_proton_command_for_game(
        proton_path=proton_path,
        command=[exe_path],
        use_umu=use_umu,
        env_override=env,
    )
    print(json.dumps({"returncode": returncode}))


def cmd_validate_prefix(args: list[str]) -> None:
    from prefix.core import prefix_exists, is_prefix_initialized, resolve_actual_prefix

    prefix_path = args[0]
    exists = prefix_exists(prefix_path)
    initialized = is_prefix_initialized(resolve_actual_prefix(prefix_path))

    print(json.dumps({
        "exists": exists,
        "initialized": initialized,
        "prefix_path": prefix_path,
    }))


COMMANDS = {
    "create-prefix": cmd_create_prefix,
    "install-makaitricks": cmd_install_makaitricks,
    "run": cmd_run,
    "validate-prefix": cmd_validate_prefix,
}


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3 cli.py <command> [args...]", file=sys.stderr)
        sys.exit(1)

    command = sys.argv[1]
    handler = COMMANDS.get(command)
    if not handler:
        print(f"Unknown command: {command}", file=sys.stderr)
        print(f"Available: {', '.join(COMMANDS.keys())}", file=sys.stderr)
        sys.exit(1)

    handler(sys.argv[2:])


if __name__ == "__main__":
    main()
