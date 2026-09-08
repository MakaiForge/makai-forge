FORK_ID = "proton-cachyos"

DEFINITION = {
    "name": 'Proton-CachyOS',
    "author": 'CachyOS Team',
    "base": 'valve',
    "branch": 'experimental-11.0',
    "wine_version": None,
    "dxvk": True,
    "vkd3d": True,
    "dxvk_nvapi": True,
    "features": {
        "async": False,
        "dlss_upgrader": True,
        "fsr": True,
        "fsr4": True,
        "gamemode": True,
        "hdr": True,
        "local_shader_cache": True,
        "ntsync": True,
        "per_game_shader_cache": True,
        "raytracing": True,
        "wayland": True,
        "xess_upgrader": True,
    },
    "patches": ['bolsacompiler', 'winewayland', 'dxvk_sarek', 'dxvk_low_latency', 'physx_nvidia_bundled', 'nvidia_libs_bundled', 'protonfixes', 'media_fixes', 'fsr4_rdna3', 'ntsync'],
    "dll_overrides": {},
    "env_defaults": {
        'PROTON_LOCAL_SHADER_CACHE': '1',
        'WINE_FULLSCREEN_FSR': '1',
        'WINE_FULLSCREEN_FSR_STRENGTH': '2',
    },
    "ld_library_path_extra": [],
    "launch": {"method": "wine_preloader", "wineloadernoexec": True, "use_preloader": True},
    "notes": 'Most feature-rich. DLSS/XeSS upgrader, FSR4, NTSync, dxvk-sarek fallback, PhysX bundled.',
    "container_overrides": {'ntsync': True, 'nvidia_libs_bundled': True},
}


def get_container_config() -> dict:
    """Configuração completa do container para Proton-CachyOS.

    CachyOS:
    - nvidia_libs_bundled → não precisa de overrides NVIDIA do host
    - Usa PipeWire nativo → não precisa de asound.conf
    - NTSYNC suportado (kernel 6.14+)
    - wine_preloader para launch
    - /dev/snd NÃO é montado (força winepulse.drv, não winealsa.drv)
    """
    return {
        "audio": {
            "setup_alsa_config": False,
            "asound_default": None,
            "bind_pulse_socket": True,
            "bind_pipewire_socket": True,
            "pulse_cookie": True,
            "pulse_server": "unix:/run/user/1000/pulse/native",
            "pulse_clientconfig": "enable-shm=no",
            "alsoft_drivers": "pulse,alsa",
            "bind_dev_snd": False,
            "openal_i386": True,
            "bind_run_user": True,
        },
        "gpu": {
            "vendor": "nvidia",
            "skip_nvidia_overrides": True,
            "egl_vendor_nvidia_only": True,
            "glx_vendor": "nvidia",
            "vk_icd": "nvidia",
            "dri_drivers_path": "",
            "gbm_backends_path": "",
            "bind_dev_dri": True,
            "bind_dev_nvidia": True,
        },
        "display": {
            "bind_x11": True,
            "bind_wayland": True,
            "bind_dbus": True,
            "bind_discord": True,
            "xauthority": True,
            "wayland_display": "wayland-0",
            "display_env": ":0",
            "xdg_session_type": "",
        },
        "container": {
            "unshare_all": False,
            "disable_userns": True,
            "clearenv": True,
            "cap_drop_all": True,
            "seccomp": True,
            "lock_file": True,
            "ld_library_path_extra": [],
            "needs_ntsync_dev": True,
            "host_provider_mount": "/run/host",
            "home_isolation": "tmpfs",
            "runtime_mount": "/usr",
            "lib_mount": "/lib",
            "linkers": True,
            "bin_sbin_symlinks": True,
            "ld_so_cache": True,
        },
        "devices": {
            "bind_snd": False,
            "bind_dri": True,
            "bind_nvidia": True,
            "bind_ntsync": True,
            "bind_shm": True,
            "bind_udev": True,
            "extra_binds": [],
        },
        "mounts": {
            "host_provider": True,
            "proton_mount": "/proton",
        },
        "env": {
            "WINEDLLOVERRIDES": "winemenubuilder.exe=",
            "PROTON_CRASH_REPORT_DIR": "/tmp/proton_crashreports",
        },
    }
