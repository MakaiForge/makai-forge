FORK_ID = "proton-ge"

DEFINITION = {
    "name": "GE-Proton",
    "author": "GloriousEggroll",
    "base": "valve",
    "branch": "bleeding-edge",
    "wine_version": None,
    "dxvk": True,
    "vkd3d": True,
    "dxvk_nvapi": True,
    "features": {
        "dlss_upgrader": True,
        "esync": True,
        "fsr": True,
        "fsr3": True,
        "fsr4": True,
        "gamemode": True,
        "hdr": True,
        "local_shader_cache": True,
        "mlfg": True,
        "ntsync": True,
        "optiscaler": True,
        "per_game_shader_cache": True,
        "wayland": True,
        "xess_upgrader": True,
    },
    "patches": [
        'protonfixes', 'media_conversion', 'protonfixes_winetricks',
        'fsr3_upgrade', 'fsr4_upgrade', 'dlss_upgrade', 'xess_upgrade',
        'hdr', 'writecopy',
    ],
    "dll_overrides": {
        "beclient.dll": "b,n",
        "beclient_x64.dll": "b,n",
        "opencl": "n,d",
        "winebth.sys": "d",
    },
    "env_defaults": {
        "WINEESYNC": "1",
        "WINEFSYNC": "1",
        "WINENTSYNC": "1",
        "DXVK_ENABLE_NVAPI": "1",
    },
    "ld_library_path_extra": [],
    "launch": {"method": "auto", "wineloadernoexec": False, "use_preloader": False},
    "notes": "GloriousEggroll's GE-Proton. FSR3/4/DLSS/XeSS upscalers, HDR, media conversion, protonfixes, NVAPI bundled, writecopy.",
    "container_overrides": {"ntsync": True, "nvidia_libs_bundled": True},
}


def get_container_config() -> dict:
    """Container config for GE-Proton.

    NVIDIA libs bundled → skip host overrides.
    Uses WINENTSYNC (opt-out via PROTON_NO_NTSYNC).
    Media conversion via GStreamer (GST_PLUGIN_SYSTEM_PATH_1_0).
    Write-copy mode via PROTON_USE_WRITECOPY.
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
            "pulse_config": True,
            "openal_config": True,
            "alsa_config_dir": True,
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
            "DXVK_ENABLE_NVAPI": "1",
            "WINEESYNC": "1",
            "WINEFSYNC": "1",
            "WINENTSYNC": "1",
            "GST_PLUGIN_SYSTEM_PATH_1_0": "",
            "GIO_EXTRA_MODULES": "/usr/lib/x86_64-linux-gnu/gio/modules:/usr/lib/i386-linux-gnu/gio/modules",
        },
    }
