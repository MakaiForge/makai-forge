import os
from pathlib import Path
from engine.container.steps import StepResult
from engine.log import log


def _setup_alsa_config(asound_default: str | None) -> list[str]:
    """Cria /etc/asound.conf baseado no backend desejado."""
    args = []
    if asound_default is None:
        return args

    content = ""
    if asound_default == "pipewire":
        content = (
            '# Gerado por makrun — ALSA default → PipeWire\n'
            'pcm.!default {\n'
            '    type pipewire\n'
            '    playback_node "-1"\n'
            '    capture_node  "-1"\n'
            '    hint { show on description "Default ALSA Output (PipeWire)" }\n'
            '}\n'
            'ctl.!default { type pipewire }\n'
        )
    elif asound_default == "pulse":
        content = (
            '# Gerado por makrun — ALSA default → PulseAudio\n'
            'pcm.!default {\n'
            '    type pulse\n'
            '    hint { show on description "Default ALSA Output (PulseAudio)" }\n'
            '}\n'
            'ctl.!default { type pulse }\n'
        )

    if content:
        asound_path = Path("/tmp/.makrun-asound.conf")
        if not asound_path.exists():
            asound_path.write_text(content)
        args.extend(["--ro-bind", str(asound_path), "/etc/asound.conf"])

    return args


def _ensure_libopenal_i386(runtime_path: Path) -> list[str]:
    """Baixa e monta libopenal.so.1 i386 se o runtime não tiver."""
    args = []
    runtime_i386 = runtime_path / "files" / "lib" / "i386-linux-gnu"
    if (runtime_i386 / "libopenal.so.1").is_file():
        return args  # runtime já tem

    cache_dir = Path.home() / ".cache" / "engine" / "lib32"
    cache_path = cache_dir / "libopenal.so.1"

    if not cache_path.is_file():
        cache_dir.mkdir(parents=True, exist_ok=True)
        _download_openal_i386(cache_dir)

    if cache_path.is_file():
        args.extend(["--ro-bind", str(cache_path), "/overrides/lib32/libopenal.so.1"])
        log.info("OpenAL i386 montado de %s", cache_path)

    return args


def _download_openal_i386(cache_dir: Path) -> None:
    import urllib.request
    import tarfile
    import io

    url = ("http://ftp.debian.org/debian/pool/main/o/openal-soft/"
           "libopenal1_1.24.2-1_i386.deb")
    deb_path = cache_dir / "libopenal1_i386.deb"

    try:
        urllib.request.urlretrieve(url, deb_path)
    except Exception as e:
        log.warning("Não foi possível baixar OpenAL i386: %s", e)
        return

    try:
        with open(deb_path, "rb") as f:
            data = f.read()
        idx = 0
        while idx < len(data):
            if data[idx:idx+8] == b"data.tar":
                hdr_sz = 60
                fsize = int(data[idx+48:idx+58].strip(), 10)
                fsize = (fsize + 1) & ~1
                tar_start = idx + hdr_sz
                tar_data = data[tar_start:tar_start+fsize]
                break
            idx += 1
        else:
            raise ValueError("data.tar not found in .deb")

        with tarfile.open(fileobj=io.BytesIO(tar_data), mode="r:xz") as tar:
            for member in tar:
                if member.name.endswith("libopenal.so.1.24.2"):
                    member.name = "libopenal.so.1"
                    tar.extract(member, path=cache_dir, filter="data")
                    break

        deb_path.unlink(missing_ok=True)
    except Exception as e:
        log.warning("Erro ao extrair OpenAL i386: %s", e)


def configure(config: dict, runtime_path: Path | None = None) -> StepResult:
    """Configura áudio: PulseAudio, PipeWire, ALSA, OpenAL."""
    args = []
    audio_cfg = config.get("audio", {})
    run_user = Path(f"/run/user/{os.getuid()}")

    # bind /run/user/$UID
    if audio_cfg.get("bind_run_user", True):
        if run_user.is_dir():
            args.extend(["--bind", str(run_user), str(run_user)])
        else:
            args.extend(["--dir", str(run_user)])

    # PulseAudio socket
    if audio_cfg.get("bind_pulse_socket", True):
        pulse_socket = run_user / "pulse"
        if pulse_socket.is_dir():
            args.extend(["--ro-bind", str(pulse_socket), str(pulse_socket)])

    # PipeWire socket
    if audio_cfg.get("bind_pipewire_socket", True):
        pipewire_socket = run_user / "pipewire-0"
        if pipewire_socket.is_socket():
            args.extend(["--ro-bind", str(pipewire_socket), str(pipewire_socket)])

    # PulseAudio cookie
    if audio_cfg.get("pulse_cookie", True):
        pulse_cookie = Path.home() / ".config" / "pulse" / "cookie"
        if pulse_cookie.is_file():
            args.extend(["--ro-bind", str(pulse_cookie), str(pulse_cookie)])

    # ALSA config (asound.conf)
    if audio_cfg.get("setup_alsa_config", False):
        asound_default = audio_cfg.get("asound_default", "pulse")
        args.extend(_setup_alsa_config(asound_default))

    # OpenAL i386
    if audio_cfg.get("openal_i386", False) and runtime_path:
        args.extend(_ensure_libopenal_i386(runtime_path))

    applied = len(args) > 0
    return StepResult(
        args=args,
        applied=applied,
        summary=f"audio: pulse={audio_cfg.get('bind_pulse_socket', True)}, "
                f"pipewire={audio_cfg.get('bind_pipewire_socket', True)}, "
                f"alsa_config={audio_cfg.get('setup_alsa_config', False)}",
    )
