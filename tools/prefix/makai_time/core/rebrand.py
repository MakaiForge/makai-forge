"""Rebrand Steam Runtime → Makai Libs.

O Steam Runtime é só pacotes .deb do Debian extraídos (LGPL/GPL).
Nada de propriedade Valve — só 2 arquivos texto referenciam "Steam".
"""

import os
import shutil

MAKAI_OS_RELEASE = """\
PRETTY_NAME="Makai Forge Runtime 1.0"
NAME="Makai Forge Runtime"
VERSION_ID="1.0"
VERSION="1.0"
VERSION_CODENAME=makairt
ID=makairt
ID_LIKE=debian
HOME_URL="https://makaiforge.app"
SUPPORT_URL=""
BUG_REPORT_URL=""
BUILD_ID="1.0.0"
VARIANT=Platform
VARIANT_ID="com.makaiforge.runtime-amd64_i386"
"""


def rebrand(rt_path: str, verbose: bool = False) -> bool:
    if verbose:
        print(f"  Rebranding runtime: {rt_path}")

    metadata = os.path.join(rt_path, "metadata")
    if os.path.isfile(metadata):
        os.remove(metadata)
        if verbose:
            print(f"  Removido: metadata")

    os_release = os.path.join(rt_path, "files", "lib", "os-release")
    os_release_etc = os.path.join(rt_path, "files", "etc", "os-release")
    for path in (os_release, os_release_etc):
        if os.path.isfile(path):
            with open(path, "w") as f:
                f.write(MAKAI_OS_RELEASE)
            if verbose:
                print(f"  Reescrito: {path}")

    steamrt_dir = os.path.join(
        rt_path, "files", "lib", "steamrt"
    )
    if os.path.isdir(steamrt_dir):
        makairt_dir = os.path.join(
            rt_path, "files", "lib", "makairt"
        )
        shutil.move(steamrt_dir, makairt_dir)
        if verbose:
            print(f"  Renomeado: lib/steamrt -> lib/makairt")

    return True
