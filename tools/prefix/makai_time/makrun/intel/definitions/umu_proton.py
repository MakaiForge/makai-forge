FORK_ID = "umu-proton"

DEFINITION = {
    "name": "UMU-Proton",
    "author": "Open-Wine-Components",
    "base": "valve",
    "branch": "10.0-4",
    "wine_version": None,
    "dxvk": True,
    "vkd3d": True,
    "dxvk_nvapi": True,
    "features": {
        "esync": True,
        "gamemode": False,
        "hdr": True,
        "local_shader_cache": False,
        "ntsync": True,
        "per_game_shader_cache": False,
        "wayland": True,
    },
    "patches": ['umu_protonfixes', 'non_steam_focus', 'media_conversion', 'hdr'],
    "dll_overrides": {
        "beclient.dll": "b,n",
        "beclient_x64.dll": "b,n",
        "opencl": "n,d",
        "winebth.sys": "d",
    },
    "env_defaults": {
        "WINEESYNC": "1",
        "WINEFSYNC": "1",
        "DXVK_ENABLE_NVAPI": "1",
    },
    "ld_library_path_extra": [],
    "launch": {"method": "wine64", "wineloadernoexec": False, "use_preloader": False, "use_umu_exe": True},
    "notes": "UMU-Proton for non-Steam games via UMU-Launcher. Designed for umu.exe, not steam.exe.",
    "container_overrides": {"ntsync": True, "nvidia_libs_bundled": False},
}


def get_container_config() -> dict:
    """Container config for UMU-Proton.

    UMU-Proton usa NVIDIA libs do host (NVIDIA_WINE_DLL_DIR).
    Usa wine64 (não wine-preloader) com umu.exe como entry point.
    Suporta NTSYNC, HDR, Wayland, media conversion.
    """
    return {
        "audio": {
            "setup_alsa_config": False,
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
            "skip_nvidia_overrides": False,
            "egl_vendor_nvidia_only": True,
            "glx_vendor": "nvidia",
            "vk_icd": "nvidia",
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
        },
        "container": {
            "unshare_all": False,
            "disable_userns": True,
            "clearenv": True,
            "cap_drop_all": True,
            "seccomp": True,
            "lock_file": True,
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
            "DXVK_HDR": "1",
            "ENABLE_HDR_WSI": "1",
        },
    }
