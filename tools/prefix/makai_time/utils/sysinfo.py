"""System information: kernel, CPU topology, memory."""

import os
import platform


def kernel_version() -> tuple:
    """Retorna (major, minor, patch) do kernel."""
    parts = platform.release().split("-")[0].split(".")
    return tuple(int(x) for x in parts[:3])


def kernel_has_futex2() -> bool:
    """Kernel >= 5.16 tem suporte a futex2 (necessário para fsync otimizado)."""
    return kernel_version() >= (5, 16, 0)


def ntsync_available() -> bool:
    return os.path.exists("/dev/ntsync")


def cpu_topology() -> dict:
    """Detecta CPU: número de cores, híbrido?, P-cores vs E-cores.
    
    Retorna:
    {
        "total_cores": 16,
        "total_threads": 24,
        "hybrid": True,
        "p_core_ids": [0,1,2,3,4,5,6,7],
        "e_core_ids": [8,9,10,11,12,13,14,15],
        "p_core_count": 8,
        "e_core_count": 8,
    }
    """
    try:
        cpu_info_path = "/sys/devices/system/cpu"
        if not os.path.isdir(cpu_info_path):
            return _fallback_cpu_info()

        cpus = sorted([
            d for d in os.listdir(cpu_info_path)
            if d.startswith("cpu") and d[3:].isdigit()
        ], key=lambda x: int(x[3:]))

        if not cpus:
            return _fallback_cpu_info()

        total_threads = len(cpus)

        p_cores = []
        e_cores = []
        for cpu in cpus:
            topo = os.path.join(cpu_info_path, cpu, "topology", "core_id")
            if os.path.isfile(topo):
                with open(topo) as f:
                    core_id = int(f.read().strip())
                cpu_num = int(cpu[3:])
                # Em CPUs Intel híbridas, E-cores geralmente têm core_id
                # maior que P-cores, mas a detecção confiável depende
                # de /sys/devices/system/cpu/cpu*/cpu_capacity
                capacity_path = os.path.join(cpu_info_path, cpu, "cpu_capacity")
                if os.path.isfile(capacity_path):
                    with open(capacity_path) as f:
                        capacity = int(f.read().strip())
                    if capacity >= 500:
                        p_cores.append(cpu_num)
                    else:
                        e_cores.append(cpu_num)
                else:
                    p_cores.append(cpu_num)

        hybrid = len(p_cores) > 0 and len(e_cores) > 0

        return {
            "total_cores": len(set(
                int(open(os.path.join(cpu_info_path, c, "topology", "core_id")).read().strip())
                for c in cpus if os.path.isfile(os.path.join(cpu_info_path, c, "topology", "core_id"))
            )),
            "total_threads": total_threads,
            "hybrid": hybrid,
            "p_core_ids": sorted(p_cores),
            "e_core_ids": sorted(e_cores),
            "p_core_count": len(p_cores),
            "e_core_count": len(e_cores),
        }
    except (OSError, ValueError, IndexError):
        return _fallback_cpu_info()


def _fallback_cpu_info() -> dict:
    import os
    count = os.cpu_count() or 1
    return {
        "total_cores": count,
        "total_threads": count,
        "hybrid": False,
        "p_core_ids": list(range(count)),
        "e_core_ids": [],
        "p_core_count": count,
        "e_core_count": 0,
    }
