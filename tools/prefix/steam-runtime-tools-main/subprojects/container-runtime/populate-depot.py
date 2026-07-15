#!/usr/bin/env python3

# Copyright © 2019-2022 Collabora Ltd.
#
# SPDX-License-Identifier: MIT
#
# Permission is hereby granted, free of charge, to any person obtaining
# a copy of this software and associated documentation files (the
# "Software"), to deal in the Software without restriction, including
# without limitation the rights to use, copy, modify, merge, publish,
# distribute, sublicense, and/or sell copies of the Software, and to
# permit persons to whom the Software is furnished to do so, subject to
# the following conditions:
#
# The above copyright notice and this permission notice shall be included
# in all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
# EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
# MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
# IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
# CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
# TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
# SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

"""
Build the steam-container-runtime (aka SteamLinuxRuntime) depot, either
from just-built files or by downloading a previous build.

The oldest distribution we are currently testing with the CI is Ubuntu
18.04, that is shipping with Python 3.6.5.
In order to keep the compatibility with Ubuntu 18.04, this Python script
should not require a Python version newer than the 3.6.
"""

import argparse
import errno
import gzip
import hashlib
import json
import logging
import os
import re
import shlex
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest
import urllib.parse
import urllib.request
from contextlib import suppress
from pathlib import Path
from typing import (
    Any,
    Container,
    Dict,
    List,
    Optional,
    Sequence,
    Set,
    TextIO,
    Tuple,
)


HERE = Path(__file__).resolve().parent


logger = logging.getLogger('populate-depot')


DEFAULT_IMAGES_URI = (
    'https://repo.steampowered.com/steamrtMAJOR/images'
)

SUITES = {
    'scout': 1,
    'soldier': 2,
    'sniper': 3,
}


ARCH_TO_TUPLE = {
    'amd64': 'x86_64-linux-gnu',
    'arm64': 'aarch64-linux-gnu',
    'i386': 'i386-linux-gnu',
}


MAX_DOWNLOAD_ATTEMPTS = 3


class InvocationError(Exception):
    pass


def _compute_sha256(path: Path) -> str:
    """
    Return the SHA-256 hex digest of the file at *path*.
    """
    with open(path, 'rb') as reader:
        hasher = hashlib.sha256()

        while True:
            blob = reader.read(4096)

            if not blob:
                break

            hasher.update(blob)

    return hasher.hexdigest()


def _check_sha256(path: Path, expected: str) -> bool:
    """
    Return True if the file at *path* matches the expected SHA-256 digest.
    """
    try:
        return _compute_sha256(path) == expected
    except OSError:
        return False


class Runtime:
    @staticmethod
    def check_valid_version(v: str) -> None:
        if not v or not v[0].isdigit():
            raise ValueError(
                f'Runtime version {v!r} does not start with a digit'
            )

        for c in v:
            if c != '.' and not c.isalnum():
                raise ValueError(
                    f'Runtime version {v!r} contains non-dot, non-alnum'
                )

            if ord(c) >= 128:
                raise ValueError(f'Runtime version {v!r} contains non-ASCII')

    @staticmethod
    def check_valid_alias(a: str) -> None:
        if not a or not a[0].isalpha():
            raise ValueError(
                f'Runtime alias {a!r} does not start with a letter'
            )

        for c in a:
            if c != '-' and not c.isalnum():
                raise ValueError(
                    f'Runtime alias {a!r} contains non-dash, non-alnum'
                )

            if ord(c) >= 128:
                raise ValueError(f'Runtime alias {a!r} contains non-ASCII')

    @staticmethod
    def check_valid_version_or_alias(v: str) -> None:
        if not v:
            raise ValueError('Runtime version or alias cannot be empty')
        elif v[0].isdigit():
            Runtime.check_valid_version(v)
        else:
            Runtime.check_valid_alias(v)

    def __init__(
        self,
        name,
        *,
        suite: str,

        architecture: str = 'amd64,i386',
        cache: str = '.cache',
        images_uri: str = DEFAULT_IMAGES_URI,
        official: bool = False,
        path: Optional[str] = None,
        ssh_host: str = '',
        ssh_path: str = '',
        version: str = '',
    ) -> None:
        self.architecture = architecture
        self.cache = cache
        self.images_uri = images_uri
        self.name = name
        self.official = official
        self.path = path
        self.suite = suite
        self.ssh_host = ssh_host
        self.ssh_path = ssh_path

        if version:
            self.check_valid_version_or_alias(version)

        self.version = version
        self.pinned_version: Optional[str] = None
        self.sha256: Dict[str, str] = {}

        if self.suite.startswith('steamrt'):
            major = self.suite[len('steamrt'):]
        else:
            major = str(SUITES[suite])

        self.major = major

        os.makedirs(self.cache, exist_ok=True)

        self.prefix = 'com.valvesoftware.SteamRuntime'
        self.platform = self.prefix + '.Platform'
        self.sdk = self.prefix + '.Sdk'
        self.tarball = '{}-{}-{}-runtime.tar.gz'.format(
            self.platform,
            self.architecture,
            self.suite,
        )
        self.dockerfile = '{}-{}-{}-sysroot.Dockerfile'.format(
            self.sdk,
            self.architecture,
            self.suite,
        )
        self.sysroot_tarball = '{}-{}-{}-sysroot.tar.gz'.format(
            self.sdk,
            self.architecture,
            self.suite,
        )
        self.build_id_file = '{}-{}-{}-buildid.txt'.format(
            self.platform,
            self.architecture,
            self.suite,
        )
        self.sdk_build_id_file = '{}-{}-{}-buildid.txt'.format(
            self.sdk,
            self.architecture,
            self.suite,
        )
        self.sources = '{}-{}-{}-sources.deb822.gz'.format(
            self.sdk,
            self.architecture,
            self.suite,
        )

    def get_archives(
        self,
        include_sdk_sysroot=False,
    ):
        archives = [self.tarball]

        if include_sdk_sysroot:
            archives.append(self.dockerfile)
            archives.append(self.sysroot_tarball)

        return archives

    def __str__(self) -> str:
        return self.name

    @classmethod
    def from_details(
        cls,
        name: str,
        details: Dict[str, Any],
        cache: str = '.cache',
        default_architecture: str = 'amd64,i386',
        default_suite: str = '',
        default_version: str = '',
        images_uri: str = DEFAULT_IMAGES_URI,
        ssh_host: str = '',
        ssh_path: str = '',
    ):
        if default_version:
            cls.check_valid_version_or_alias(default_version)

        return cls(
            name,
            architecture=details.get(
                'architecture', default_architecture,
            ),
            cache=cache,
            images_uri=images_uri,
            official=details.get('official', False),
            path=details.get('path', None),
            ssh_host=ssh_host,
            ssh_path=ssh_path,
            suite=details.get('suite', default_suite or name),
            version=details.get('version', default_version),
        )

    def get_uri(
        self,
        filename: str = '',
        *,
        suffix: str = '',
        version: Optional[str] = None,
    ) -> str:
        suite = self.suite
        major = self.major
        uri = self.images_uri.replace('SUITE', suite).replace('MAJOR', major)
        v = version or self.pinned_version or self.version or 'latest'
        self.check_valid_version_or_alias(v)

        if filename:
            return f'{uri}/{v}/{filename}{suffix}'
        else:
            return f'{uri}/{v}{suffix}'

    def get_ssh_path(
        self,
        filename: str = '',
        *,
        suffix: str = '',
        version: Optional[str] = None,
    ) -> str:
        ssh_host = self.ssh_host
        suite = self.suite
        major = self.major
        ssh_path = self.ssh_path.replace(
            'SUITE', suite,
        ).replace(
            'MAJOR', major,
        )
        v = version or self.pinned_version or self.version or 'latest'
        self.check_valid_version_or_alias(v)

        if not ssh_host or not ssh_path:
            raise RuntimeError('ssh host/path not configured')

        if filename:
            return f'{ssh_path}/{v}/{filename}{suffix}'
        else:
            return f'{ssh_path}/{v}{suffix}'

    def fetch(
        self,
        filename: str,
        opener: urllib.request.OpenerDirector,
        version: Optional[str] = None,
    ) -> str:
        assert filename

        if version is not None:
            self.check_valid_version_or_alias(version)

        dest = os.path.join(self.cache, filename)

        if filename in self.sha256:
            if _check_sha256(Path(dest), self.sha256[filename]):
                logger.info('Using cached %r', dest)
                return dest

        if self.ssh_host and self.ssh_path:
            path = self.get_ssh_path(filename)
            logger.info('Downloading %r...', path)
            subprocess.run([
                'rsync',
                '--archive',
                '--partial',
                '--progress',
                self.ssh_host + ':' + path,
                dest,
            ], check=True)
        else:
            uri = self.get_uri(filename)
            expected_sha256 = self.sha256.get(filename)

            if expected_sha256 is None:
                raise RuntimeError(
                    'No SHA-256 checksum available for {!r},'
                    ' cannot verify download'.format(filename)
                )

            for attempt in range(MAX_DOWNLOAD_ATTEMPTS):
                logger.info('Downloading %r...', uri)
                with opener.open(uri) as response:
                    length = response.length
                    with open(dest + '.new', 'wb') as writer:
                        shutil.copyfileobj(response, writer)
                        downloaded = writer.tell()

                    # out of `with open()` to make sure writer has been closed
                    if _check_sha256(Path(dest + '.new'), expected_sha256):
                        break
                    else:
                        logger.warning("Integrity check failed for %r", dest)
                        logger.warning("Downloaded %d of %s bytes",
                                       downloaded, length or "(unknown)")

                # Sleep before attempting again to give the server a chance to
                # recover from possible quota limits
                time.sleep(20)
            else:
                raise RuntimeError(
                    'SHA-256 mismatch for {!r} after {} attempts,'
                    ' possible truncated download'.format(
                        filename, MAX_DOWNLOAD_ATTEMPTS,
                    )
                )

            os.rename(dest + '.new', dest)

        return dest

    def pin_version(
        self,
        opener: urllib.request.OpenerDirector,
    ) -> str:
        pinned = self.pinned_version
        sha256: Dict[str, str] = {}

        if pinned is None:
            v = self.version or 'latest'

            if v[0].isdigit():
                # We already have a concrete version number, use it as-is
                pinned = v
            else:
                try:
                    # First try e.g. steamrt4/images/latest-public-beta.txt
                    pinned = self.__pin_version_internal(
                        suffix='.txt',
                        opener=opener,
                    )
                except (
                    urllib.error.URLError,
                    subprocess.CalledProcessError,
                ):
                    # Fall back to e.g.
                    # steamrt4/images/latest-public-beta/VERSION.txt
                    logger.warning(
                        "Couldn't pin version number the new way, "
                        "falling back...",
                        exc_info=True,
                    )
                    pinned = self.__pin_version_internal(
                        filename='VERSION.txt',
                        opener=opener,
                    )

            self.check_valid_version(pinned)
            self.pinned_version = pinned

            if self.ssh_host and self.ssh_path:
                path = self.get_ssh_path(filename='SHA256SUMS')

                sha256sums = subprocess.run([
                    'ssh', self.ssh_host,
                    'cat {}'.format(shlex.quote(path)),
                ], stdout=subprocess.PIPE).stdout
                assert sha256sums is not None
            else:
                uri = self.get_uri(filename='SHA256SUMS')

                with opener.open(uri) as response:
                    sha256sums = response.read()

            for line in sha256sums.splitlines():
                sha256_bytes, name_bytes = line.split(maxsplit=1)
                name = name_bytes.decode('utf-8')

                if name.startswith('*'):
                    name = name[1:]

                sha256[name] = sha256_bytes.decode('ascii')

            self.sha256 = sha256

        return pinned

    def __pin_version_internal(
        self,
        *,
        opener: urllib.request.OpenerDirector,
        filename: str = '',
        suffix: str = '',
    ) -> str:
        if self.ssh_host and self.ssh_path:
            path = self.get_ssh_path(filename=filename, suffix=suffix)
            logger.info('Determining version number from %r...', path)

            return subprocess.run([
                'ssh', self.ssh_host,
                'cat {}'.format(shlex.quote(path)),
            ], stdout=subprocess.PIPE).stdout.decode('utf-8').strip()
        else:
            uri = self.get_uri(filename=filename, suffix=suffix)
            logger.info('Determining version number from %r...', uri)

            with opener.open(uri) as response:
                return response.read().decode('utf-8').strip()


RUN_IN_DIR_SOURCE = '''\
#!/bin/sh
# {source_for_generated_file}

set -eu

me="$(readlink -f "$0")"
here="${{me%/*}}"
me="${{me##*/}}"

dir={escaped_dir}
pressure_vessel="${{PRESSURE_VESSEL_PREFIX:-"${{here}}/pressure-vessel"}}"

export PRESSURE_VESSEL_ARCHITECTURES={escaped_multiarch_tuples}
export PRESSURE_VESSEL_COPY_RUNTIME=1
export PRESSURE_VESSEL_RUNTIME="${{dir}}"
unset PRESSURE_VESSEL_RUNTIME_ARCHIVE
export PRESSURE_VESSEL_RUNTIME_BASE="${{here}}"

set -- \\
    --variable-dir="${{PRESSURE_VESSEL_VARIABLE_DIR:-"${{here}}/var"}}" \\
    "$@"

exec "${{pressure_vessel}}/bin/pressure-vessel-unruntime" "$@"
'''


class ComponentVersion:
    def __init__(
        self,
        name: str = '',
        sort_weight: int = 0,
    ) -> None:
        self.name = name
        self.version = ''
        self.runtime = ''
        self.runtime_version = ''
        self.sort_weight = sort_weight
        self.comment = ''

    def __str__(self) -> str:
        ret = '{} version {!r}'.format(self.name, self.version)

        if self.runtime or self.runtime_version:
            ret = ret + ' (from {} version {})'.format(
                self.runtime or '(unknown runtime)',
                self.runtime_version or '(unknown)',
            )

        return ret

    def to_sort_key(self) -> Tuple[int, str]:
        return (self.sort_weight, self.to_tsv())

    def to_tsv(self) -> str:
        if self.comment:
            comment = '# ' + self.comment
        else:
            comment = ''

        return '\t'.join((
            self.name, self.version,
            self.runtime, self.runtime_version,
            comment,
        )) + '\n'


class Depot:
    def __init__(
        self,
        architecture: str,
        depot_id: str,
        path: Path,
    ):
        self.architecture = architecture
        self.depot_id = depot_id
        self.path = path


class MainDepot(Depot):
    pass


class OverlayDepot(Depot):
    def __init__(
        self,
        architecture: str,
        depot_id: str,
        path: Path,
        parent: Depot,
    ):
        super().__init__(architecture, depot_id, path)
        self.parent = parent


class EmulationOverlay(OverlayDepot):
    pass


class Main:
    # A dpkg architecture, for example amd64 or musl-linux-riscv64
    _POSSIBLE_DPKG_ARCHITECTURE_RE = re.compile(r'[0-9a-zA-Z][-0-9a-zA-Z]+')

    def __init__(
        self,
        add_bin_directory: bool = False,
        architecture: str = 'amd64,i386',
        cache: str = '.cache',
        check_steampipe_compatible: Optional[bool] = None,
        credential_envs: Sequence[str] = (),
        credential_hosts: Sequence[str] = (),
        depot: str = 'depot',
        depot_archive: str = '',
        depot_version: str = '',
        emulation_depot_ids: Sequence[str] = (),
        fast: bool = False,
        images_uri: str = DEFAULT_IMAGES_URI,
        include_sdk_sysroot: bool = False,
        layered: bool = False,
        mtree: bool = True,
        multiarch_tuples: Sequence[str] = (),
        pressure_vessel_archive: str = '',
        pressure_vessel_foreign: Sequence[str] = (),
        runtime: str = 'scout',
        scripts_version: str = '',
        source_dir: str = str(HERE),
        ssh_host: str = '',
        ssh_path: str = '',
        steam_app_id: str = '',
        steam_depot_id: str = '',
        suite: str = '',
        toolmanifest: bool = False,
        unpack_ld_library_path: str = '',
        version: str = '',
        versioned_directories: bool = False,
        **kwargs: Dict[str, Any],
    ) -> None:
        openers: List[urllib.request.BaseHandler] = []

        if not credential_hosts:
            credential_hosts = []
            host = urllib.parse.urlparse(images_uri).hostname

            if host is not None:
                credential_hosts.append(host)

        if credential_envs:
            password_manager = urllib.request.HTTPPasswordMgrWithDefaultRealm()

            for cred in credential_envs:
                if ':' in cred:
                    username_env, password_env = cred.split(':', 1)
                    logger.info(
                        'Using username from $%s and password from $%s',
                        username_env, password_env)
                    username = os.environ[username_env]
                    password = os.environ[password_env]
                else:
                    logger.info(
                        'Using username and password from $%s', cred)
                    username, password = os.environ[cred].split(':', 1)

                for host in credential_hosts:
                    password_manager.add_password(
                        None,       # type: ignore
                        host,
                        username,
                        password,
                    )

            openers.append(
                urllib.request.HTTPBasicAuthHandler(password_manager)
            )

        self.opener = urllib.request.build_opener(*openers)

        if check_steampipe_compatible is None:
            check_steampipe_compatible = not include_sdk_sysroot

        if version:
            Runtime.check_valid_version_or_alias(version)

        self.add_bin_directory = add_bin_directory
        self.cache = cache
        self.check_steampipe_compatible = check_steampipe_compatible
        self.default_architecture = architecture
        self.default_suite = suite
        self.default_version = version
        self.depot = Path(depot).resolve()
        self.depot_archive = depot_archive
        self.depot_version = depot_version
        self.fast = fast
        self.images_uri = images_uri
        self.include_sdk_sysroot = include_sdk_sysroot
        self.layered = layered
        self.mtree = mtree
        self.multiarch_tuples = multiarch_tuples
        self.scripts_version = scripts_version
        self.source_dir = Path(source_dir)
        self.ssh_host = ssh_host
        self.ssh_path = ssh_path
        self.steam_app_id = steam_app_id
        self.steam_depot_id = steam_depot_id
        self.toolmanifest = toolmanifest

        if not unpack_ld_library_path:
            self.unpack_ld_library_path: Optional[Path] = None
        else:
            self.unpack_ld_library_path = Path(unpack_ld_library_path)

        self.versioned_directories = versioned_directories

        if (
            depot_archive
            and not depot_archive.endswith(('.tar.gz', '.tar.xz'))
        ):
            raise InvocationError(f'Unknown archive format: {depot_archive}')

        os.makedirs(self.cache, exist_ok=True)

        if '=' in runtime:
            name, rhs = runtime.split('=', 1)

            if rhs.startswith('{'):
                details = json.loads(rhs)
            else:
                with open(rhs, 'rb') as reader:
                    details = json.load(reader)
        else:
            name = runtime
            details = {}

        self.runtime = self.new_runtime(name, details)

        # Map from empty string for native architecture,
        # or dpkg architecture name for emulation,
        # to pressure-vessel archive path
        self.pressure_vessels: Dict[str, Path] = {}

        if self.layered:
            self.pressure_vessels = {}
        elif pressure_vessel_archive:
            self.pressure_vessels = {'': Path(pressure_vessel_archive)}
        else:
            raise InvocationError(
                '--pressure-vessel-archive is required when not '
                'using --layered'
            )

        for pair in pressure_vessel_foreign:
            if '=' not in pair:
                raise InvocationError(
                    '--pressure-vessel-foreign requires ARCH=PATH pairs'
                )

            arch, path = pair.split('=', 1)

            if not self._POSSIBLE_DPKG_ARCHITECTURE_RE.match(arch):
                raise InvocationError(f'Invalid architecture: {arch!r}')

            self.pressure_vessels[arch] = Path(path)

        if 'SOURCE_DATE_EPOCH' in os.environ:
            self.reference_timestamp = int(os.environ['SOURCE_DATE_EPOCH'])
        else:
            self.reference_timestamp = int(time.time())

        self.depots: List[Depot] = []
        self.depots.append(
            MainDepot(
                architecture=self.default_architecture,
                depot_id=self.steam_depot_id,
                path=self.depot,
            ),
        )

        # Map from dpkg architecture name for emulation
        # to Steam depot ID
        self.emulation_depot_ids: Dict[str, str] = {}

        for pair in emulation_depot_ids:
            if '=' not in pair:
                raise InvocationError(
                    '--emulation-depot-id requires ARCH=ID pairs'
                )

            arch, depot_id = pair.split('=', 1)

            if not self._POSSIBLE_DPKG_ARCHITECTURE_RE.match(arch):
                raise InvocationError(f'Invalid architecture: {arch!r}')

            try:
                if int(depot_id) == 0:
                    raise ValueError
            except ValueError:
                # Depot ID is non-numeric or zero
                raise InvocationError(f'Invalid depot ID: {depot_id!r}')

            self.emulation_depot_ids[arch] = depot_id

            self.depots.append(
                EmulationOverlay(
                    architecture=arch,
                    depot_id=depot_id,
                    parent=self.depots[0],
                    path=self.depot / f'depot-{depot_id}-{arch}',
                )
            )

    def new_runtime(
        self,
        name: str,
        details: Dict[str, Any],
        default_suite: str = '',
    ) -> Runtime:
        return Runtime.from_details(
            name,
            details,
            cache=self.cache,
            default_architecture=self.default_architecture,
            default_suite=default_suite or self.default_suite,
            default_version=self.default_version,
            images_uri=self.images_uri,
            ssh_host=self.ssh_host,
            ssh_path=self.ssh_path,
        )

    def merge_dir_into_depot(
        self,
        source_root: Path,
        depot: Path,
    ):
        for (dirpath, dirnames, filenames) in os.walk(source_root):
            relative_path = Path(dirpath).relative_to(source_root)

            for member in dirnames:
                (depot / relative_path / member).mkdir(
                    exist_ok=True,
                    parents=True,
                )

            for member in filenames:
                source = Path(dirpath, member)
                merged = depot / relative_path / member

                with suppress(FileNotFoundError):
                    merged.unlink()

                merged.parent.mkdir(exist_ok=True, parents=True)
                shutil.copy(source, merged)

    def run(self) -> None:
        if self.layered:
            self.do_layered_runtime()
        else:
            self.do_container_runtime()

        if self.steam_app_id and self.steam_depot_id:
            self.write_steampipe_config()

        if self.check_steampipe_compatible:
            depot = Path(self.depot)

            for dir_path, dirs, files in os.walk(
                depot,
                topdown=True,
                followlinks=False,
            ):
                for item in dirs + files:
                    if not self.filename_is_friendly(item):
                        raise AssertionError(
                            f'Filename {item!r} might not be '
                            'Steampipe-compatible',
                        )

        if self.depot_archive:
            self.do_depot_archive(self.depot_archive)

    def do_layered_runtime(self) -> None:
        if self.runtime.name != 'scout':
            raise InvocationError('Can only layer scout onto soldier')

        if self.unpack_ld_library_path is not None:
            raise InvocationError(
                'Cannot use --unpack-ld-library-path with --layered'
            )

        if self.include_sdk_sysroot:
            raise InvocationError(
                'Cannot use --include-sdk-* with --layered'
            )

        self.merge_dir_into_depot(
            self.source_dir / 'runtimes' / 'scout-on-soldier',
            self.depot,
        )

        runtime = self.runtime
        versions: List[ComponentVersion] = []

        if runtime.path:
            logger.info('Using runtime from local directory %r', runtime.path)
            self.unpack_ld_library_path = self.depot
            local_version = ComponentVersion('LD_LIBRARY_PATH')
            extracted_version = self.use_local_scout_tarball(
                str(Path(runtime.path, 'steam-runtime.tar.xz')),
            )
            assert extracted_version is not None
            local_version.version = extracted_version
            local_version.runtime = 'scout'
            local_version.runtime_version = extracted_version
            local_version.comment = 'steam-runtime/'
            versions.append(local_version)
        elif runtime.version:
            logger.info('Downloading runtime from %s', runtime)
            self.unpack_ld_library_path = self.depot
            self.download_scout_tarball(self.runtime)
            local_version = ComponentVersion('LD_LIBRARY_PATH')
            version = self.runtime.pinned_version
            assert version is not None
            local_version.version = version
            local_version.runtime = 'scout'
            local_version.runtime_version = version
            local_version.comment = 'steam-runtime/'
            versions.append(local_version)
        else:
            unspecified_version = ComponentVersion('LD_LIBRARY_PATH')
            unspecified_version.version = '-'
            unspecified_version.runtime = 'scout'
            unspecified_version.runtime_version = '-'
            unspecified_version.comment = (
                'see ~/.steam/root/ubuntu12_32/steam-runtime/version.txt'
            )
            versions.append(unspecified_version)

        self.write_component_versions(versions, self.depot)

        if self.mtree:
            self.write_top_level_mtree(self.depot)

    def prune_runtime(self, directory: Path) -> None:
        """
        Remove files that are considered to be unnecessary
        """

        usr_share = directory / 'files' / 'share'
        doc = usr_share / 'doc'

        # This is a fairly generic list of files that are safe to be removed.
        # Please keep it in sync with prune_files() of steam-runtime.git's
        # build-runtime.py
        paths: list[Path] = [
            # Nvidia cg toolkit manuals, tutorials and documentation
            doc / 'nvidia-cg-toolkit' / 'html',
            *doc.glob('nvidia-cg-toolkit/*.pdf.gz'),
            # Sample code
            *doc.glob('**/examples'),
            # Debian bug reporting scripts
            usr_share / 'bug',
            # Debian documentation metadata
            usr_share / 'doc-base',
            # Debian QA metadata
            usr_share / 'lintian',
            # Programs and utilities manuals
            usr_share / 'man',
            # Remove the localized messages that are likely never going to be
            # seen. Keep only "en", because that's the default language we are
            # using.
            *[x for x in usr_share.glob('locale/*') if x.name != 'en'],
        ]

        if self.runtime.suite not in ('scout', 'soldier', 'sniper'):
            paths.extend(directory.glob('files/lib/*/dri'))

        for path in paths:
            if path.is_dir():
                shutil.rmtree(path)
            else:
                with suppress(FileNotFoundError):
                    path.unlink()

    def deb_arch_to_multiarch(
        self,
        arch: str,
    ) -> str:
        if arch in ARCH_TO_TUPLE:
            # We can do this on any system, including e.g. Arch Linux
            return ARCH_TO_TUPLE[arch]
        else:
            # This will only work on a Debian derivative, so we only
            # do this for future architectures
            completed = subprocess.run(
                [
                    'dpkg-architecture',
                    f'-a{arch}',
                    '-qDEB_HOST_MULTIARCH',
                ],
                check=True,
                stdout=subprocess.PIPE,
            )
            stdout = completed.stdout
            assert stdout is not None
            return stdout.decode('utf-8').strip()

    def do_container_runtime(self) -> None:
        # We assume that only the main depot will contain the Platform:
        # this is the largest part of the complete compatibility tool,
        # and is determined only by the architecture of the game that
        # we want to run, even if we are running it via emulation on some
        # other architecture.
        #
        # For example, if we're going to run an x86 game then it gets the
        # x86_64 + i386 Platform, even if the machine architecture is arm64.
        runtime_version, runtime_subdir = self.provide_runtime_usr()

        for depot in self.depots:
            self.populate_container_runtime_depot(
                depot,
                runtime_subdir=runtime_subdir,
                runtime_version=runtime_version,
            )

    def populate_container_runtime_depot(
        self,
        depot: Depot,
        *,
        runtime_subdir: str,
        runtime_version: ComponentVersion,
    ) -> None:
        logger.info(
            'Populating depot %s in %s...',
            depot.depot_id, depot.path,
        )

        versions: List[ComponentVersion] = []

        depot.path.mkdir(exist_ok=True, parents=True)

        runtime = self.runtime

        self.merge_dir_into_depot(self.source_dir / 'common', depot.path)

        root = self.source_dir / 'runtimes' / self.runtime.name

        if root.exists():
            self.merge_dir_into_depot(root, depot.path)

        tuples = list(self.multiarch_tuples)

        if not tuples:
            for arch in self.default_architecture.split(','):
                tuples.append(self.deb_arch_to_multiarch(arch))

        for arch, pressure_vessel_path in sorted(
            self.pressure_vessels.items()
        ):
            if arch:
                unpack_dir = f'pressure-vessel-{arch}'
            else:
                unpack_dir = 'pressure-vessel'

            if isinstance(depot, EmulationOverlay):
                if arch == depot.architecture:
                    logger.info(
                        'Including %s in emulation overlay depot %s',
                        unpack_dir, depot.depot_id,
                    )
                else:
                    continue

            elif isinstance(depot, MainDepot):
                in_main_depot = True

                for other in self.depots:
                    if other != depot and arch == other.architecture:
                        logger.info(
                            'Not including %s in main depot because it is '
                            'separated into depot %s',
                            unpack_dir, other.depot_id,
                        )
                        in_main_depot = False

                if in_main_depot:
                    logger.info(
                        'Including %s in main depot %s',
                        unpack_dir, depot.depot_id,
                    )
                else:
                    continue

            pv_version = ComponentVersion(unpack_dir)
            self.use_local_pressure_vessel(
                pressure_vessel_path,
                depot.path,
                unpack_dir=unpack_dir,
            )

            for path in ('metadata/VERSION.txt', 'sources/VERSION.txt'):
                full = os.path.join(depot.path, unpack_dir, path)
                if os.path.exists(full):
                    with open(full) as text_reader:
                        v = text_reader.read().rstrip('\n')
                        if pv_version.version:
                            if pv_version.version != v:
                                raise RuntimeError(
                                    'Inconsistent version! '
                                    '{} says {}, but expected {}'.format(
                                        path, v, pv_version.version,
                                    )
                                )
                        else:
                            pv_version.version = v

                break

            versions.append(pv_version)

        if self.add_bin_directory and isinstance(depot, MainDepot):
            bin_dir = os.path.join(self.depot, 'bin')
            os.makedirs(bin_dir, exist_ok=True)

            def symlink_force(src, dst):
                logger.info("Creating symlink from {} to {}".format(
                    src, dst)
                )
                if os.path.exists(dst):
                    os.remove(dst)
                os.symlink(src, dst)

            pv_bin_executables = [
                'steam-runtime-check-requirements',
                'steam-runtime-launch-client',
                'steam-runtime-launch-options',
                'steam-runtime-steam-remote',
                'steam-runtime-supervisor',
                'steam-runtime-system-info',
            ]
            for exe in pv_bin_executables:
                src = os.path.join('..', 'pressure-vessel', 'bin', exe)
                dst = os.path.join(self.depot, bin_dir, exe)
                symlink_force(src, dst)

            # Executables under libexec have their rpath set relative to their
            # location under `libexec/`, not `bin/`, so they need to be linked
            # directly.
            #
            # And also, they may be linked with different names, so use a map
            # instead of a list.
            pv_libexec_executables = {
                'srt-logger': 'srt-logger',
                'steam-runtime-launcher-service':
                    "{}-srt-launcher-service".format(tuples[0]),
            }

            for bin_name, libexec_name in pv_libexec_executables.items():
                src = os.path.join('..', 'pressure-vessel', 'libexec',
                                   'steam-runtime-tools-0', libexec_name)
                dst = os.path.join(self.depot, bin_dir, bin_name)
                symlink_force(src, dst)

        if self.unpack_ld_library_path is not None:
            if self.runtime.name == 'scout':
                scout = self.runtime
            else:
                scout = self.new_runtime(
                    'scout',
                    dict(version='latest'),
                    default_suite='scout',
                )
            logger.info(
                'Downloading LD_LIBRARY_PATH Steam Runtime from scout into %r',
                str(self.unpack_ld_library_path))
            self.download_scout_tarball(scout)

        run_script = depot.path / 'run'

        with open(run_script, 'w') as writer:
            writer.write(
                RUN_IN_DIR_SOURCE.format(
                    escaped_dir=shlex.quote(runtime_subdir),
                    escaped_multiarch_tuples=shlex.quote(':'.join(tuples)),
                    source_for_generated_file=(
                        'Generated file, do not edit'
                    ),
                )
            )

        run_script.chmod(0o755)

        if runtime.name in ('scout', 'soldier', 'sniper'):
            run_script_alias = depot.path / ('run-in-' + runtime.name)
            shutil.copy2(run_script, run_script_alias)
            run_script_alias.chmod(0o755)

        versions.append(runtime_version)

        if self.toolmanifest:

            with open(
                os.path.join(depot.path, 'toolmanifest.vdf'), 'w'
            ) as writer:
                import vdf      # noqa

                writer.write('// Generated file, do not edit\n')
                words = [
                    '/_v2-entry-point',
                    '--verb=%verb%',
                    '--',
                ]

                # Each ABI level needs a unique "priority" so that we will
                # not suggest SLR 2.0 as a runtime for SLR 3.0 games, etc.;
                # and they all need to be less than 10, to avoid colliding
                # with SLR 1.0 (scout), which needs to be highest-priority
                # to make it the default for legacy games.
                filter_exclusive_priority = '9'

                # Note that this is checking whether the runtime /usr
                # is for x86, not whether pressure-vessel is for x86:
                # we want SLR 1.0 to be available on non-x86,
                # as the legacy default (priority 0), via x86 emulation
                is_x86 = all(
                    a in ('amd64', 'i386')
                    for a in runtime.architecture.split(',')
                )

                if runtime.suite == 'sniper' and not is_x86:
                    # On x86 the oldest runtime is scout or
                    # scout-on-soldier (configured elsewhere), but those
                    # legacy runtimes never existed on non-x86, so the default
                    # becomes the oldest runtime that could support non-x86,
                    # namely sniper.
                    filter_exclusive_priority = '0'
                elif runtime.suite.startswith('steamrt'):
                    # steamrt4, steamrt5, ... get priority 4, 5, ...
                    # If we get to steamrt9 with this limitation still
                    # present, we'll have to bump the priority of SLR 1.0
                    # or teach the Steam Client a different mechanism.
                    major_version = runtime.suite[len('steamrt'):]
                    assert int(major_version) >= 4, major_version
                    assert int(major_version) <= 9, major_version
                    filter_exclusive_priority = major_version
                elif runtime.suite == 'scout':
                    # Hypothetically we might have a super-strict scout
                    # runtime for QA purposes (steamrt/tasks#59) and if
                    # we do, it must match SLR 1.0
                    filter_exclusive_priority = '10'
                else:
                    # For older suites with whimsical codenames, we have a
                    # mapping from codename to major version.
                    # Set the priority equal to the major version.
                    filter_exclusive_priority = str(
                        SUITES.get(runtime.suite, 9)
                    )

                content: Dict[str, Any] = dict(
                    manifest=dict(
                        commandline=' '.join(words),
                        filter_exclusive_priority=filter_exclusive_priority,
                        version='2',
                        use_tool_subprocess_reaper='1',
                    )
                )

                content['manifest']['compatmanager_layer_name'] = (
                    'container-runtime'
                )

                vdf.dump(content, writer, pretty=True, escaped=True)

        self.write_component_versions(versions, depot.path)

        if self.mtree:
            exclude_paths: Set[str] = set()
            parent_depot: Optional[Path] = None

            if isinstance(depot, MainDepot):
                for overlay in self.depots:
                    if not isinstance(overlay, MainDepot):
                        exclude_paths.add(overlay.path.name)

            if isinstance(depot, OverlayDepot):
                # We assume the parent of each overlay is the first depot
                # in the stacking order, so that files in the overlay
                # with the same name will overwrite files from the main depot
                parent_depot = depot.parent.path

            self.write_top_level_mtree(
                depot.path,
                exclude_paths=exclude_paths,
                parent_depot=parent_depot,
            )

    def write_component_versions(
        self,
        versions: Sequence[ComponentVersion],
        dest: Path,
    ) -> None:
        try:
            with subprocess.Popen(
                [
                    'git', 'describe',
                    '--always',
                    '--dirty',
                    '--long',
                ],
                cwd=os.path.dirname(__file__),
                stdout=subprocess.PIPE,
                universal_newlines=True,
            ) as describe:
                stdout = describe.stdout
                assert stdout is not None
                version = stdout.read().strip()
                # Deliberately ignoring exit status:
                # if git is missing or old we'll use 'unknown'
        except (OSError, subprocess.SubprocessError):
            version = ''

        try:
            with open(HERE / '.tarball-version', 'r') as reader:
                version = reader.read().strip()
        except OSError:
            pass

        editable_versions = list(versions)

        if self.scripts_version:
            version = self.scripts_version

        if self.depot_version:
            component_version = ComponentVersion('depot', sort_weight=-1)
            component_version.version = self.depot_version
            component_version.comment = 'Overall version number'
            editable_versions.append(component_version)

        component_version = ComponentVersion('scripts')
        component_version.version = version or 'unknown'
        component_version.comment = 'from steam-runtime-tools'
        editable_versions.append(component_version)

        with open(dest / 'VERSIONS.txt', 'w') as writer:
            writer.write(
                '#Name\tVersion\t\tRuntime\tRuntime_Version\tComment\n'
            )

            for entry in sorted(
                editable_versions,
                key=lambda v: v.to_sort_key(),
            ):
                logger.info('Component version: %s', entry)
                writer.write(entry.to_tsv())

    def provide_runtime_usr(self) -> Tuple[ComponentVersion, str]:
        runtime = self.runtime

        if runtime.path:
            logger.info(
                'Using runtime from local directory %r',
                runtime.path)
            self.use_local_runtime(runtime)
        else:
            logger.info(
                'Downloading runtime from %s',
                runtime)
            self.download_runtime(runtime)

        component_version = ComponentVersion(runtime.name)

        if runtime.path:
            with open(
                os.path.join(runtime.path, runtime.build_id_file), 'r',
            ) as text_reader:
                version = text_reader.read().strip()
        else:
            version = runtime.pinned_version or ''
            assert version

        runtime_files = set()

        if self.versioned_directories:
            subdir = '{}_platform_{}'.format(runtime.name, version)
        else:
            subdir = runtime.name

        dest = os.path.join(self.depot, subdir)
        runtime_files.add(subdir + '/')

        with suppress(FileNotFoundError):
            shutil.rmtree(dest)

        os.makedirs(dest, exist_ok=True)
        argv = [
            'tar',
            '-C', dest,
            '-xf',
            os.path.join(self.cache, runtime.tarball),
        ]
        logger.info('%r', argv)
        subprocess.run(argv, check=True)
        self.minimize_runtime(dest)

        if self.include_sdk_sysroot:
            if self.versioned_directories:
                sysroot_subdir = '{}_sysroot_{}'.format(
                    runtime.name, version,
                )
            else:
                sysroot_subdir = '{}_sysroot'.format(runtime.name)

            sysroot = os.path.join(self.depot, sysroot_subdir)
            runtime_files.add(sysroot_subdir + '/')

            with suppress(FileNotFoundError):
                shutil.rmtree(sysroot)

            os.makedirs(os.path.join(sysroot, 'files'), exist_ok=True)
            argv = [
                'tar',
                '-C', os.path.join(sysroot, 'files'),
                '--exclude', 'dev/*',
                '-xf',
                os.path.join(self.cache, runtime.sysroot_tarball),
            ]
            logger.info('%r', argv)
            subprocess.run(argv, check=True)

            os.makedirs(
                os.path.join(
                    sysroot, 'files', 'usr', 'lib', 'debug',
                ),
                exist_ok=True,
            )

        comment = ', '.join(sorted(runtime_files))

        if runtime.path and not runtime.official:
            comment += ' (from local build)'

        component_version.version = version
        component_version.runtime = runtime.suite
        component_version.runtime_version = version
        component_version.comment = comment

        return component_version, subdir

    def use_local_pressure_vessel(
        self,
        archive: Path,
        dest: Path,
        unpack_dir: str = 'pressure-vessel',
    ) -> None:
        pv_dir = dest / unpack_dir
        os.makedirs(pv_dir, exist_ok=True)
        argv = ['tar', '-C', str(pv_dir), '--strip-components=1', '-xf']

        if archive.is_file():
            argv.append(str(archive))
        else:
            argv.append(str(archive / 'pressure-vessel-bin.tar.gz'))

        logger.info('%r', argv)
        subprocess.run(argv, check=True)

    def use_local_runtime(self, runtime: Runtime) -> None:
        assert runtime.path

        for basename in runtime.get_archives(
            include_sdk_sysroot=self.include_sdk_sysroot,
        ):
            src = os.path.join(runtime.path, basename)
            dest = os.path.join(self.cache, basename)
            logger.info('Hard-linking local runtime %r to %r', src, dest)

            with suppress(FileNotFoundError):
                os.unlink(dest)

            os.link(src, dest)

    def download_runtime(self, runtime: Runtime) -> None:
        """
        Download a pre-prepared Platform from a previous container
        runtime build.
        """

        runtime.pin_version(self.opener)

        for basename in runtime.get_archives(
            include_sdk_sysroot=self.include_sdk_sysroot,
        ):
            runtime.fetch(basename, self.opener)

    def download_scout_tarball(self, runtime: Runtime) -> None:
        """
        Download a pre-prepared LD_LIBRARY_PATH Steam Runtime from a
        previous scout build.
        """
        dest = self.unpack_ld_library_path
        assert dest is not None

        filename = 'steam-runtime.tar.xz'

        pinned = runtime.pin_version(self.opener)
        logger.info('Downloading steam-runtime build %s', pinned)
        dest.mkdir(exist_ok=True, parents=True)

        downloaded = runtime.fetch(filename, self.opener)
        got = self.use_local_scout_tarball(downloaded)

        if pinned != got:
            logger.warning(
                'Unexpected runtime: expected %s, got %s',
                pinned, got,
            )

    def use_local_scout_tarball(self, archive: str) -> str:
        """
        Unpack a pre-prepared LD_LIBRARY_PATH Steam Runtime from a
        local archive.
        Return its version number in 1.0.yyyymmdd.x format.
        """
        dest = self.unpack_ld_library_path
        assert dest is not None

        subprocess.run(
            ['tar', '-C', str(dest), '-xf', archive],
            check=True,
        )

        with open(dest / 'steam-runtime' / 'version.txt') as reader:
            marker = reader.read().strip()

        version_bits = marker.split('_')

        if len(version_bits) != 2:
            logger.warning(
                'Unexpected format for runtime version: %s', marker,
            )
            return 'local'
        else:
            logger.info('scout runtime version %s', version_bits[1])
            return version_bits[1]

    def octal_escape_char(self, match: 're.Match') -> str:
        ret: List[str] = []

        for byte in match.group(0).encode('utf-8', 'surrogateescape'):
            ret.append('\\%03o' % byte)

        return ''.join(ret)

    _NEEDS_OCTAL_ESCAPE = re.compile(r'[^-A-Za-z0-9+,./:@_]')

    def octal_escape(self, s: str) -> str:
        return self._NEEDS_OCTAL_ESCAPE.sub(self.octal_escape_char, s)

    _OCTAL_ESCAPES = re.compile(r'(?:\\[0-7]{1,3})+')

    def _octal_unescape_char(self, match: 're.Match') -> str:
        text = match.group(0)
        assert text[0] == '\\'
        sequences = text[1:].split('\\')
        return bytes([int(seq, base=8) for seq in sequences]).decode('utf-8')

    def octal_unescape(self, s: str) -> str:
        return self._OCTAL_ESCAPES.sub(self._octal_unescape_char, s)

    def filename_is_friendly(self, s: str) -> bool:
        '''
        Return true if the filename is non-problematic for Windows
        filesystems, Steampipe, Unix shells and so on.
        '''

        # Some relevant restrictions:
        #
        # * Windows and Steampipe don't allow <>:"\|?*
        # * Windows doesn't allow surrogate escapes U+DC80 to U+DCFF
        # * #$&'()[]{};` are special to Unix shells in general
        # * !^ are special to interactive Unix shells
        # * % is special to Windows shells
        # * , is special to the Steam bootstrapper
        # * whitespace is awkward and not necessarily handled consistently
        # * ASCII control characters are not necessarily handled consistently
        # * non-ASCII is not necessarily handled consistently

        for c in s:
            if c >= 'A' and c <= 'Z':
                continue
            elif c >= 'a' and c <= 'z':
                continue
            elif c >= '0' and c <= '9':
                continue
            elif c not in '+-./=@_~':
                return False

        # ~ is special to Unix shells at the beginning of an argument
        if s.startswith('~') or '/~' in s:
            return False

        # Unix command-line tools can get confused by basenames starting
        # with a dash
        if s.startswith('-') or '/-' in s:
            return False

        # Also avoid filenames like __pycache__/*.pyc, which might otherwise
        # be deleted by "helpful" file cleaning tools
        if (
            '/.cache/' in s
            or '/__pycache__/' in s
            or '/tmp/' in s
            or s.endswith((
                '.pyc',
                '.pyo',
                'CACHEDIR.TAG',
            ))
        ):
            return False

        return True

    def write_mtree(
        self,
        top: Path,
        writer: TextIO,
        *,
        exclude_paths: Container[str] = (),
        minimize: bool = False,
        preserve_mode: bool = True,
        preserve_time: bool = True,
        skip_runtime_files: bool = False
    ) -> Dict[str, str]:
        lc_names: Dict[str, str] = {}
        # { truncated hash: number of distinct files with this hash }
        # Note that even if the content is identical, there can be
        # more than one unique set of permissions for the same content.
        hashed_names_used: Dict[str, int] = {}
        # { new name: old name }
        rename: Dict[str, str] = {}
        unlink_later: Set[str] = set()
        differ_only_by_case: Set[str] = set()
        unfriendly_filenames: Set[str] = set()
        # { [device, inode]: hex sha256 }
        sha256: Dict[Tuple[int, int], str] = {}
        # { [device, inode]: hashed name }
        hashed_names: Dict[Tuple[int, int], str] = {}

        writer.write('#mtree\n')
        writer.write('. type=dir\n')

        for dirpath, dirnames, filenames in os.walk(top):
            for base in sorted(dirnames + filenames):
                member = Path(dirpath) / base
                name = str(member.relative_to(top))

                if name == 'steampipe' and base in dirnames:
                    dirnames.remove(base)
                    continue

                if name in exclude_paths:
                    with suppress(ValueError):
                        dirnames.remove(base)

                    with suppress(ValueError):
                        filenames.remove(base)

                    continue

                if (
                    skip_runtime_files
                    and base == 'files'
                    and base in dirnames
                    and (member.parent / 'usr-mtree.txt.gz').exists()
                ):
                    escaped = self.octal_escape(name)
                    writer.write(f'./{escaped} type=dir ignore\n')
                    dirnames.remove(base)
                    continue

                if not self.filename_is_friendly(name):
                    unfriendly_filenames.add(name)

                if name.lower() in lc_names:
                    differ_only_by_case.add(lc_names[name.lower()])
                    differ_only_by_case.add(name)
                else:
                    lc_names[name.lower()] = name

                fields = ['./' + self.octal_escape(name)]

                stat_info = os.lstat(member)

                if stat.S_ISREG(stat_info.st_mode):
                    fields.append('type=file')

                    if preserve_mode:
                        fields.append('mode=%o' % (stat_info.st_mode & 0o777))
                    elif stat_info.st_mode & 0o111:
                        fields.append('mode=755')

                    if preserve_time:
                        # With sub-second precision, note that some versions
                        # of mtree use the part after the dot as integer
                        # nanoseconds, so "1.234" is actually 1 sec + 234 ns,
                        # or what normal people would write as 1.000000234.
                        # To be compatible with both, we always show the time
                        # with 9 digits after the decimal point, unless it's
                        # exactly an integer.
                        if stat_info.st_mtime == int(stat_info.st_mtime):
                            fields.append(f'time={stat_info.st_mtime:.1f}')
                        else:
                            fields.append(f'time={stat_info.st_mtime:.9f}')

                    fields.append(f'size={stat_info.st_size}')
                    file_id = (stat_info.st_dev, stat_info.st_ino)
                    if stat_info.st_size > 0:
                        if file_id in sha256:
                            digest = sha256[file_id]
                        else:
                            digest = _compute_sha256(member)
                            sha256[file_id] = digest

                        short_hash = digest[:2] + '/' + digest[2:8]
                        fields.append(f'sha256={digest}')

                        if minimize and (
                            stat_info.st_nlink > 1
                            or name in differ_only_by_case
                            or name in unfriendly_filenames
                        ):
                            # Represent hard-linked files or problematic
                            # filenames by a semi-content-addressed name.
                            if file_id in hashed_names:
                                hashed_name = hashed_names[file_id]
                            else:
                                index = hashed_names_used.get(short_hash, 0)
                                index += 1
                                hashed_names_used[short_hash] = index
                                hashed_name = f'{short_hash}-{index}.bin'
                                hashed_names[file_id] = hashed_name

                            fields.append(f'contents=./{hashed_name}')
                            rename[hashed_name] = name
                            unlink_later.add(name)
                        # else represent ./foo/bar as ./foo/bar
                    elif minimize:
                        unlink_later.add(name)

                elif stat.S_ISLNK(stat_info.st_mode):
                    fields.append('type=link')
                    fields.append(
                        f'link={self.octal_escape(os.readlink(member))}')

                    if minimize:
                        unlink_later.add(name)

                elif stat.S_ISDIR(stat_info.st_mode):
                    fields.append('type=dir')
                else:
                    writer.write(
                        '# unknown file type: {}\n'.format(
                            self.octal_escape(name),
                        ),
                    )
                    continue

                writer.write(' '.join(fields) + '\n')

            if differ_only_by_case and not minimize:
                writer.write('\n')
                writer.write('# Files whose names differ only by case:\n')

                for name in sorted(differ_only_by_case):
                    writer.write('# {}\n'.format(self.octal_escape(name)))

            if unfriendly_filenames and not minimize:
                writer.write('\n')
                writer.write('# Files with unfriendly names:\n')

                for name in sorted(unfriendly_filenames):
                    writer.write('# {}\n'.format(self.octal_escape(name)))

        if minimize:
            for name, original in rename.items():
                (top / name).parent.mkdir(parents=True, exist_ok=True)
                (top / original).replace(top / name)

            for name in unlink_later:
                with suppress(FileNotFoundError):
                    (top / name).unlink()
        else:
            assert not rename, rename
            assert not unlink_later, unlink_later

        return lc_names

    def write_top_level_mtree(
        self,
        top: Path,
        *,
        exclude_paths: Container[str] = (),
        parent_depot: Optional[Path] = None,
    ) -> None:
        logger.info('Summarizing %s in mtree manifest...', top)
        with tempfile.TemporaryDirectory(prefix='slr-mtree-') as temp:
            writer = gzip.open(os.path.join(temp, 'mtree.txt.gz'), 'wt')

            lc_names = self.write_mtree(
                top,
                writer,
                minimize=False,
                preserve_mode=False,
                preserve_time=False,
                exclude_paths=exclude_paths,
                skip_runtime_files=True,
            )

            if '.ref' not in lc_names:
                writer.write('./.ref type=file size=0 optional\n')
                lc_names['.ref'] = '.ref'

            if (
                self.steam_app_id
                and self.steam_depot_id
                and 'steampipe' not in lc_names
            ):
                writer.write('./steampipe type=dir ignore optional\n')
                lc_names['steampipe'] = 'steampipe'

            if 'var' not in lc_names:
                writer.write('./var type=dir ignore optional\n')
                lc_names['var'] = 'var'

            writer.write('./mtree.txt.gz type=file\n')
            lc_names['mtree.txt.gz'] = 'mtree.txt.gz'

            if parent_depot is not None:
                with gzip.open(
                    str(parent_depot / 'mtree.txt.gz'),
                    'rt',
                ) as reader:
                    for line in reader:
                        if not line.strip():
                            continue

                        if line.startswith(('#', '. ')):
                            continue

                        assert line.startswith('./'), line
                        name, rest = line[2:].split(maxsplit=1)
                        assert rest.endswith('\n'), line
                        name = self.octal_unescape(name)
                        lower = name.lower()

                        if lower not in lc_names:
                            logger.info('%s inherited from parent depot', name)
                            writer.write(f'./{name} {rest}')
                            lc_names[lower] = name

            writer.close()
            shutil.copy2(writer.name, top)

    def minimize_runtime(self, root: str) -> None:
        '''
        Convert $root from an ordinary runtime into a minimized runtime
        described by a mtree manifest usr-mtree.txt.gz, which
        pressure-vessel can reconstitute back into the original runtime.
        '''

        # Remove unnecessary files
        self.prune_runtime(Path(root))

        # Generate the manifest
        with tempfile.TemporaryDirectory(prefix='slr-mtree-') as temp:
            writer = gzip.open(os.path.join(temp, 'usr-mtree.txt.gz'), 'wt')

            lc_names = self.write_mtree(
                Path(root) / 'files',
                writer,
                minimize=True,
            )

            if '.ref' not in lc_names:
                writer.write('./.ref type=file size=0 mode=644\n')

            # We need to close the gzip before copying it, otherwise we
            # will end up with a corrupted file
            writer.close()
            shutil.copy2(writer.name, root)

        # Remove files that can be restored from the manifest
        for (dirpath, dirnames, filenames) in os.walk(
            os.path.join(root, 'files'),
            topdown=False,
        ):
            for f in filenames + dirnames:
                path = os.path.join(dirpath, f)

                try:
                    statinfo = os.lstat(path)
                except FileNotFoundError:
                    continue

                if stat.S_ISLNK(statinfo.st_mode) or statinfo.st_size == 0:
                    os.remove(path)
            try:
                os.rmdir(dirpath)
            except OSError as e:
                if e.errno != errno.ENOTEMPTY:
                    raise

        # Create $path/files/.ref as an empty regular file.
        #
        # This is useful because pressure-vessel would create this file
        # during processing. If it gets committed to the depot, then Steampipe
        # will remove it when superseded.

        ref = os.path.join(root, 'files', '.ref')

        try:
            statinfo = os.stat(ref, follow_symlinks=False)
        except FileNotFoundError:
            with open(ref, 'x'):
                pass
        else:
            if statinfo.st_size > 0 or not stat.S_ISREG(statinfo.st_mode):
                raise RuntimeError(
                    'Expected {} to be an empty regular file'.format(root)
                )

    def write_steampipe_config(self) -> None:
        import vdf                          # noqa
        from vdf.vdict import VDFDict       # noqa

        assert self.steam_app_id
        assert self.steam_depot_id

        main_depot = Path(self.depot)
        steampipe = main_depot / 'steampipe'
        steampipe.mkdir(exist_ok=True)
        app_vdf = f'app_build_{self.steam_app_id}.vdf'
        depot_vdfs: Dict[str, str] = {}
        exclude_paths = set([
            steampipe,
            main_depot / 'var',
        ])

        for depot in self.depots:
            exclude_paths.add(depot.path)

        for depot in self.depots:
            depot_id = depot.depot_id or '0'
            depot_path = depot.path

            depot_vdf = f'depot_build_{depot_id}.vdf'
            file_mappings: List[Tuple[str, Any]] = []
            # Path to depot, relative to steampipe
            if depot_path == main_depot:
                rel_depot = Path('..')
            else:
                rel_depot = Path('..', depot_path.relative_to(main_depot))

            for child in sorted(depot_path.iterdir()):
                rel_child = rel_depot / child.name

                if child in exclude_paths:
                    continue
                elif child.is_dir():
                    file_mappings.append(
                        (
                            'FileMapping', dict(
                                LocalPath=str(rel_child) + '/*',
                                DepotPath=f'{child.name}/',
                                recursive='1',
                            ),
                        )
                    )
                else:
                    file_mappings.append(
                        (
                            'FileMapping', dict(
                                LocalPath=str(rel_child),
                                DepotPath='.',
                            ),
                        )
                    )

            content = dict(
                DepotBuildConfig=VDFDict(
                    [('DepotID', depot_id)] + file_mappings,
                )
            )

            with open(steampipe / depot_vdf, 'w') as writer:
                vdf.dump(content, writer, pretty=True, escaped=True)

            # We only add depots to app_build_*.vdf if they really exist,
            # and aren't just a placeholder for a depot that we could
            # potentially have in future.
            if depot_id and depot_id != '0':
                depot_vdfs[depot_id] = depot_vdf

        content = dict(
            appbuild=dict(
                appid=self.steam_app_id,
                buildoutput='output',
                depots=depot_vdfs,
            )
        )

        with open(steampipe / app_vdf, 'w') as writer:
            vdf.dump(content, writer, pretty=True, escaped=True)

    def do_depot_archive(self, name: str) -> None:
        if name.endswith('.tar.gz'):
            compress_command = ['pigz', '--fast', '-c', '-n', '--rsyncable']
            artifact_prefix = name[:-len('.tar.gz')]
        elif name.endswith('.tar.xz'):
            if self.fast:
                compress_command = ['xz', '-0']
            else:
                compress_command = ['xz']

            artifact_prefix = name[:-len('.tar.xz')]
        else:
            raise InvocationError(f'Unknown archive format: {name}')

        stem = Path(artifact_prefix).name

        with open(
            name, 'wb'
        ) as archive_writer, subprocess.Popen(
            compress_command,
            stdin=subprocess.PIPE,
            stdout=archive_writer,
        ) as compressor, tarfile.open(
            name,
            mode='w|',
            format=tarfile.GNU_FORMAT,
            fileobj=compressor.stdin,
        ) as archiver:
            members = []
            depot = Path(self.depot)

            for dir_path, dirs, files in os.walk(
                depot,
                topdown=True,
                followlinks=False,
            ):
                rel_dir = Path(dir_path).relative_to(depot)

                if rel_dir == Path('.'):
                    for exclude in ('var',):
                        try:
                            dirs.remove(exclude)
                        except ValueError:
                            pass

                for item in dirs + files:
                    members.append(rel_dir / item)

            root = tarfile.TarInfo(stem)
            root.size = 0
            root.type = tarfile.DIRTYPE
            root = self.normalize_tar_entry(root)
            archiver.addfile(root)

            for member in sorted(members):
                archiver.add(
                    str(depot / member),
                    arcname=f'{stem}/{member}',
                    recursive=False,
                    filter=self.normalize_tar_entry,
                )

        if not self.layered:
            with open(
                HERE / 'SteamLinuxRuntime_whatever.sh.in'
            ) as reader, open(
                artifact_prefix + '.sh', 'w'
            ) as writer:
                for line in reader:
                    writer.write(line.replace('@RUNTIME@', stem))

            shutil.copy(
                depot / 'VERSIONS.txt',
                artifact_prefix + '.VERSIONS.txt',
            )
            os.chmod(artifact_prefix + '.VERSIONS.txt', 0o644)
            os.chmod(artifact_prefix + '.sh', 0o755)

    def normalize_tar_entry(self, entry: tarfile.TarInfo) -> tarfile.TarInfo:
        entry.uid = 65534
        entry.gid = 65534

        if entry.mtime > self.reference_timestamp:
            entry.mtime = self.reference_timestamp

        if (entry.mode & 0o111) != 0 or entry.isdir():
            entry.mode = 0o755
        else:
            entry.mode = 0o644

        entry.uname = 'nobody'
        entry.gname = 'nogroup'

        return entry


class SelfTest(unittest.TestCase):
    def test_valid_alias(self) -> None:
        check = Runtime.check_valid_alias

        for good in [
            'x',
            'latest',
            'latest-steam-client-general-availability',
            'best-before-end-2024',
        ]:
            self.assertIsNone(
                check(good),
                msg=f'{good!r} should be a valid alias',
            )

        for bad in [
            '',
            '1',
            '..',
            'a b',
            'a/b',
            'a\u06f5',      # U+06F5 EXTENDED ARABIC-INDIC DIGIT FIVE
            '\u00E4',       # U+00E4 LATIN SMALL LETTER A WITH DIAERESIS
            'a\u00E4',
            'a\u2026',      # U+2026 HORIZONTAL ELLIPSIS
        ]:
            with self.assertRaises(
                ValueError,
                msg=f'{bad!r} should not be a valid alias',
            ):
                check(bad)

    def test_valid_version(self) -> None:
        check = Runtime.check_valid_version

        for good in [
            '0',
            '0.20260123.4',
            '3c.0.20260123.123456',
            '6z.hypothetical.2038.01.19',
        ]:
            self.assertIsNone(
                check(good),
                msg=f'{good!r} should be a valid version',
            )

        for bad in [
            '',
            'latest',
            '..',
            '1 2',
            '1/2',
            '0+this.is.not.dpkg',
            '0~this.is.not.dpkg',
            'smcv-task1234-3c.0.20260123.123456',
            '\u06f5',       # U+06F5 EXTENDED ARABIC-INDIC DIGIT FIVE
            '0\u06f5',
            '0\u00E4',      # U+00E4 LATIN SMALL LETTER A WITH DIAERESIS
            '0\u2026',      # U+2026 HORIZONTAL ELLIPSIS
        ]:
            with self.assertRaises(
                ValueError,
                msg=f'{bad!r} should not be a valid version',
            ):
                check(bad)

    def test_filename_is_friendly(self) -> None:
        # This happens to be the easiest way to create a Main object
        # with all required parameters
        m = Main(layered=True)

        for good in (
            'bin/bash',
            'lib/x86_64-linux-gnu/libglib-2.0.so.0',
        ):
            self.assertTrue(
                m.filename_is_friendly(good),
                f'{good!r} should be treated as friendly'
            )

        for bad in r'<>:"\|?*':
            self.assertFalse(
                m.filename_is_friendly(bad),
                f'{bad!r} is not Windows-compatible'
            )
            self.assertFalse(
                m.filename_is_friendly(f'my{bad}file'),
                f'{bad!r} is not Windows-compatible'
            )

        for bad in r"#$&'()[]{};`~":
            self.assertFalse(
                m.filename_is_friendly(bad),
                f'{bad!r} is not Unix-shell-friendly',
            )

        for bad, why in (
            ('bin/[', 'Special to Unix shells'),
            ('%TEMP%', 'Special to Windows shells'),
            ('Program Files', 'Has whitespace'),
            ('carriage\rreturn', 'Has ASCII control character'),
            ('interrobang\u203D', 'Has non-ASCII'),
            ('delete\x7F', 'Has ASCII DEL'),
            ('foo/tmp/bar', 'Could be deleted by cleanup tools'),
            ('foo/__pycache__/bar', 'Could be deleted by cleanup tools'),
            ('foo/.cache/bar', 'Could be deleted by cleanup tools'),
            ('foo/CACHEDIR.TAG', 'Could be deleted by cleanup tools'),
            ('foo/bar.pyc', 'Could be deleted by cleanup tools'),
            ('libexec/--inadvisable', 'Special to Unix CLI tools'),
            ('--inadvisable', 'Special to Unix CLI tools'),
            ('share/i18n/charmaps/ISO_8859-1,GL.gz',
             "Steam bootstrapper doesn't like commas"),
        ):
            self.assertFalse(
                m.filename_is_friendly(bad),
                f'{bad!r} should be unfriendly: {why}'
            )

    def test_octal_unescape(self) -> None:
        m = Main(layered=True)

        for i, o in (
            ('', ''),
            ('abc', 'abc'),
            (r'\302\247', '\u00a7'),
            (r'\302\247\342\200\275', '\u00a7\u203D'),
            (r'abc\302\247def\342\200\275ghi', 'abc\u00a7def\u203Dghi'),
        ):
            self.assertEqual(m.octal_unescape(i), o)


def main() -> None:
    logging.basicConfig()
    logging.getLogger().setLevel(logging.DEBUG)

    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        '--architecture', default='amd64,i386',
        help=(
            'Default dpkg architecture or comma-separated list of '
            'architectures'
        )
    )
    parser.add_argument(
        '--multiarch-tuple',
        action='append',
        default=[],
        dest='multiarch_tuples',
        help=(
            'Declare that the container supports each TUPLE. '
            'May be repeated. '
            'The first is the primary architecture.'
        ),
    )
    parser.add_argument(
        '--suite', default='',
        help=(
            'Default suite to use if none is specified'
        )
    )
    parser.add_argument(
        '--version', default='',
        help=(
            'Default version to use if none is specified'
        )
    )

    parser.add_argument(
        '--cache', default='.cache',
        help=(
            'Cache downloaded files that are not in --depot here'
        ),
    )

    parser.add_argument(
        '--credential-env',
        action='append',
        default=[],
        dest='credential_envs',
        help=(
            'Environment variable to be evaluated for login:password, '
            'or a pair of environment variables VAR1:VAR2 to be evaluated '
            'for login and password respectively'
        ),
    )
    parser.add_argument(
        '--credential-host',
        action='append',
        default=[],
        dest='credential_hosts',
        metavar='HOST',
        help=(
            'Use --credential-env when downloading from the given HOST'
            '(default: hostname of --images-uri)'
        ),
    )
    parser.add_argument(
        '--images-uri',
        default=DEFAULT_IMAGES_URI,
        metavar='URI',
        help=(
            'Download files from the given URI. '
            '"MAJOR" will be replaced with the major version. '
            '"SUITE" will be replaced with the suite name.'
        ),
    )

    parser.add_argument(
        '--ssh-host', default='', metavar='HOST',
        help='Use ssh and rsync to download files from HOST',
    )
    parser.add_argument(
        '--ssh-path', default='', metavar='PATH',
        help=(
            'Use ssh and rsync to download files from PATH on HOST. '
            '"MAJOR" will be replaced with the major version. '
            '"SUITE" will be replaced with the suite name.'
        ),
    )

    parser.add_argument(
        '--check-steampipe-compatible', action='store_true', default=None,
    )
    parser.add_argument(
        '--no-check-steampipe-compatible',
        dest='check_steampipe_compatible', action='store_false', default=None,
    )

    parser.add_argument(
        '--depot', default='depot',
        help=(
            'Download runtime into this existing directory'
        )
    )
    parser.add_argument(
        '--depot-version', default='',
        help=(
            'Set an overall version number for the depot contents'
        )
    )
    parser.add_argument(
        '--depot-archive', default='',
        help=(
            'Export the depot as an archive'
        )
    )
    parser.add_argument(
        '--emulation-depot-id', action='append', default=[],
        dest='emulation_depot_ids',
        metavar='ARCH=ID',
        help=(
            'Add a secondary depot to run under CPU emulation with a '
            'different architecture'
        ),
    )
    parser.add_argument(
        '--fast', default=False, action='store_true',
        help=(
            'Speed up compression at the expense of compression ratio'
        )
    )
    parser.add_argument(
        '--scripts-version', default='',
        help=(
            'Set a version number for the scripts from steam-runtime-tools'
        )
    )

    parser.add_argument(
        '--pressure-vessel-archive', default='', metavar='PATH',
        help=(
            'Unpack pressure-vessel from the named archive'
        ),
    )
    parser.add_argument(
        '--pressure-vessel-official', dest='_ignored', action='store_true',
        help='Ignored for backwards compatibility',
    )
    parser.add_argument(
        '--pressure-vessel-foreign', default=[], metavar='ARCH=PATH',
        action='append',
        help=(
            'Unpack pressure-vessel from PATH for use with emulation on '
            'dpkg architecture ARCH'
        ),
    )
    parser.add_argument(
        '--add-bin-directory', default=False, action='store_true',
        help='Add a bin/ directory with some commonly useful executables',
    )
    parser.add_argument(
        '--no-include-archives', dest='_ignored', action='store_true',
        help='Ignored for backwards compatibility',
    )
    parser.add_argument(
        '--include-sdk-sysroot', default=False, action='store_true',
        help='Include a corresponding SDK',
    )
    parser.add_argument(
        '--layered', default=False, action='store_true',
        help='Produce a layered runtime that runs scout on soldier',
    )
    parser.add_argument(
        '--minimize', dest='_ignored', action='store_true',
        help='Ignored for backwards compatibility',
    )
    parser.add_argument(
        '--no-mtrees', dest='mtree', action='store_false', default=True,
        help='Skip generation of non-essential mtree manifests',
    )
    parser.add_argument(
        '--source-dir', default=str(HERE),
        help=(
            'Source directory for files to include in the depot'
        )
    )
    parser.add_argument(
        '--steam-app-id', default='',
        help='Set Steam app ID for the depot',
    )
    parser.add_argument(
        '--steam-depot-id', default='',
        help='Set Steam depot ID',
    )
    parser.add_argument(
        '--toolmanifest', default=False, action='store_true',
        help='Generate toolmanifest.vdf',
    )
    parser.add_argument(
        '--unpack-ld-library-path', metavar='PATH', default='',
        help=(
            'Get the steam-runtime.tar.xz from the same place as '
            'pressure-vessel and unpack it into the given PATH, '
            'for use in regression testing.'
        )
    )
    parser.add_argument(
        '--unpack-runtime', '--unpack-runtimes', dest='_ignored',
        action='store_true', default=True,
        help='Ignored for backwards compatibility',
    )
    parser.add_argument(
        '--versioned-directories', action='store_true', default=True,
        help=(
            'Include version number in unpacked runtime directories '
            '[default]'
        )
    )
    parser.add_argument(
        '--no-versioned-directories', action='store_false',
        dest='versioned_directories',
        help=(
            'Do not include version number in unpacked runtime directories'
        )
    )
    parser.add_argument(
        'runtime',
        default='',
        metavar='NAME[="DETAILS"]',
        help=(
            'Runtime to download, in the form NAME or NAME="DETAILS". '
            'DETAILS is a JSON object containing something like '
            '{"path": "../prebuilt", "suite: "scout", "version": "latest", '
            '"architecture": "amd64,i386"}, or the '
            'path to a file with the same JSON object in. All JSON fields '
            'are optional.'
        ),
    )

    if sys.argv[1:2] == ['--self-test']:
        del sys.argv[1:2]
        unittest.main()
        return

    try:
        args = parser.parse_args()
        Main(**vars(args)).run()
    except InvocationError as e:
        parser.error(str(e))


if __name__ == '__main__':
    main()
