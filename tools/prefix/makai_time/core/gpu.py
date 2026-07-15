"""GPU detection: vendor, driver version, capabilities."""

import os
import re
import subprocess


def detect_vendor() -> str:
    if os.path.exists("/proc/driver/nvidia/version"):
        return "nvidia"
    try:
        r = subprocess.run(
            ["glxinfo"], capture_output=True, text=True, timeout=5
        )
        if "NVIDIA" in r.stdout:
            return "nvidia"
        if "Mesa" in r.stdout and ("AMD" in r.stdout or "Radeon" in r.stdout):
            return "amd"
        if "Intel" in r.stdout and "Mesa" in r.stdout:
            return "intel"
    except FileNotFoundError:
        pass
    if os.path.isdir("/sys/class/drm"):
        for dev in os.listdir("/sys/class/drm"):
            if dev.startswith("card"):
                link = os.readlink(f"/sys/class/drm/{dev}")
                if "amdgpu" in link:
                    return "amd"
                if "i915" in link:
                    return "intel"
                if "nvidia" in link:
                    return "nvidia"
    return "unknown"


def driver_version() -> str:
    try:
        r = subprocess.run(
            ["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=5
        )
        ver = r.stdout.strip()
        if ver and re.match(r"\d+\.\d+", ver):
            return ver
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    try:
        r = subprocess.run(
            ["glxinfo"], capture_output=True, text=True, timeout=5
        )
        m = re.search(r"OpenGL version string:\s*(\S+)", r.stdout)
        if m:
            return m.group(1)
    except FileNotFoundError:
        pass
    return "unknown"


def mesa_version() -> str:
    try:
        r = subprocess.run(
            ["glxinfo"], capture_output=True, text=True, timeout=5
        )
        m = re.search(r"OpenGL version string:\s*(\S+)", r.stdout)
        if m:
            return m.group(1)
    except FileNotFoundError:
        pass
    return "unknown"


def vulkan_version() -> str:
    try:
        r = subprocess.run(
            ["vulkaninfo", "--summary"], capture_output=True, text=True, timeout=5
        )
        m = re.search(r"Vulkan Instance Version:\s*(\S+)", r.stdout)
        if m:
            return m.group(1)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return "unknown"


def has_nvidia_prime() -> bool:
    return os.path.exists("/sys/bus/pci/devices/0000:00:00.0") and os.path.exists(
        "/sys/bus/pci/devices/0000:01:00.0"
    )


def info() -> dict:
    return {
        "vendor": detect_vendor(),
        "driver": driver_version(),
        "opengl": mesa_version(),
        "vulkan": vulkan_version(),
        "nvidia_prime": has_nvidia_prime(),
    }
