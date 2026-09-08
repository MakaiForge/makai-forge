from pathlib import Path
from engine.container.steps import StepResult


def configure(config: dict) -> StepResult:
    """Monta fontes do host no container."""
    args = []

    # Fontes do sistema
    usr_fonts = Path("/usr/share/fonts")
    if usr_fonts.is_dir():
        args.extend(["--ro-bind", "/usr/share/fonts", "/usr/share/fonts"])

    # Fontes do usuário
    home = Path.home()
    for font_dir in [home / ".local" / "share" / "fonts", home / ".fonts"]:
        if font_dir.is_dir():
            args.extend(["--ro-bind", str(font_dir), str(font_dir)])

    applied = len(args) > 0
    return StepResult(
        args=args,
        applied=applied,
        summary="fonts: system + user" if applied else "fonts: skipped",
    )
