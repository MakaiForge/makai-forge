FORK_ID = "proton-ge-rtsp"

DEFINITION = {
    "name": "Proton-GE RTSP",
    "author": "SpookySkeletons",
    "base": "proton-ge",
    "branch": None,
    "wine_version": None,
    "dxvk": True,
    "vkd3d": True,
    "dxvk_nvapi": True,
    "features": {
        "rtsp_codec": True,
        "vrchat_fixes": True,
    },
    "patches": ['rtsp_codec', 'vrchat_optimizations', 'media_conversion'],
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
    "launch": {"method": "wine_preloader", "wineloadernoexec": True, "use_preloader": True},
    "notes": "GE-Proton + RTSP codec support for VRChat. Niche, media-focused.",
    "container_overrides": {"ntsync": False, "nvidia_libs_bundled": True},
}


def get_container_config() -> dict:
    """Container config for Proton-GE RTSP.

    Based on GE-Proton but WITHOUT NTSYNC. RTSP codecs for VRChat.
    NVIDIA libs bundled. Media conversion enabled for codec support.
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
            "needs_ntsync_dev": False,
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
            "bind_ntsync": False,
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
            "GST_PLUGIN_SYSTEM_PATH_1_0": "",
        },
    }
