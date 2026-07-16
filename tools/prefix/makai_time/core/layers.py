"""Vulkan/OpenXR layer masking.

Mounts empty tmpfs over host implicit layer directories to prevent
host Vulkan layers (e.g. MangoHud, vkBasalt, OBS capture) from
interfering with games inside the container.

Only layers in the overrides directory are allowed.
"""

import os


VULKAN_IMPLICIT_PATHS = [
    os.path.expanduser("~/.local/share/vulkan/implicit_layer.d"),
    "/usr/share/vulkan/implicit_layer.d",
    "/usr/local/share/vulkan/implicit_layer.d",
]

OPENXR_ACTIVE_PATHS = [
    os.path.expanduser("~/.local/share/openxr/1/api_layers"),
    "/usr/share/openxr/1/api_layers",
    "/usr/local/share/openxr/1/api_layers",
]


def layer_mask_args(
    overrides_base: str | None = None,
    skip_nvidia: bool = False,
) -> list[str]:
    args = []
    for path in VULKAN_IMPLICIT_PATHS:
        if os.path.isdir(path):
            args.extend(["--tmpfs", path])

    for path in OPENXR_ACTIVE_PATHS:
        if os.path.isdir(path):
            args.extend(["--tmpfs", path])

    if overrides_base:
        native = "x86_64-linux-gnu"
        for api, subdir in [("vulkan", "implicit_layer.d"), ("openxr/1", "api_layers")]:
            override_layer = os.path.join(
                overrides_base, native, "share", api, subdir
            )
            if os.path.isdir(override_layer):
                args.extend(["--ro-bind", override_layer, override_layer])

    return args
