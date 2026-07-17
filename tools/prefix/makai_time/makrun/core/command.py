from pathlib import Path

from makrun.log import log


def build_command(env: dict[str, str], runtime_path: Path) -> tuple[Path | str, ...]:
    entry_point = runtime_path / "_v2-entry-point"
    shim = runtime_path / "umu-shim"
    proton = Path(env["PROTONPATH"]) / "proton"

    if not entry_point.is_file():
        raise FileNotFoundError(f"_v2-entry-point not found in runtime: {entry_point}")

    if not proton.is_file():
        raise FileNotFoundError(f"proton script not found: {proton}")

    verb = env.get("PROTON_VERB", "waitforexitandrun")
    exe = env.get("EXE", "")

    if env.get("UMU_NO_RUNTIME") == "1":
        log.warning("Runtime disabled")
        return (proton, verb, exe)

    return (
        entry_point,
        "--verb",
        verb,
        "--",
        shim,
        proton,
        verb,
        exe,
    )
