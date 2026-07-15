#!/usr/bin/python3

# Copyright © 2017-2021 Collabora Ltd.
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
Convenience script to build and test steam-runtime-tools and pressure-vessel
using multiple platforms.

Build directory layout:

_build/
    # meson/ninja build directories
    # (built by default)
    clang/                      Build for host system with clang
    host/                       Build for host system, with pressure-vessel
    scout-amd64/                Build for scout, x86_64, with pressure-vessel
    scout-i386/                 Build for scout, i386
    soldier-amd64/              Build for soldier, x86_64, with pressure-vessel
    sniper-amd64/               Build for sniper, x86_64, with pressure-vessel
    steamrt3c-amd64/            Build for steamrt3c, x86_64, with PV
    steamrt3c-arm64/            Build for steamrt3c, arm64, with PV
    steamrt3c-i386/             Build for steamrt3c, i386

    # Non-Meson-managed
    cache/                      Download cache for populate-depot.py
    containers/                 Container images for testing
        scout/files/            scout /usr for builds
        scout_sysroot/          scout sysroot for builds
        scout_sysroot_usrmerge/ scout sysroot for builds, /usr-merged
        soldier/files/          soldier /usr for builds
        soldier_sysroot/        soldier sysroot for builds
    host-artifacts/             Additional test logs
    pv-steamrt3c-*/             Staging dir. for relocatable steamrt3c builds
    scout-DESTDIR/              Staging directory for scout builds
    scout-layered/              Staging directory for scout-on-soldier
    scout-relocatable/          Staging directory for relocatable scout builds
    steamrt3c-DESTDIR-*/        Staging directory for steamrt3c builds

    # Special-purpose meson/ninja build directories
    # (not built by default)
    coverage/                   Build for host system with coverage
    doc/                        Build for host system with gtk-doc and pandoc
    host-no-asan/               No AddressSanitizer, for use with valgrind
    arm64/                      Build for host system for arm64, as an
                                example of a non-x86 platform
    i386/                       Build for host system for i386
"""

import argparse
import grp
import logging
import os
import shutil
import subprocess
import sys
import tempfile

from contextlib import suppress
from pathlib import Path
from typing import Dict, List, Sequence, Union


logger = logging.getLogger('many-builds')

ARCH_TO_TUPLE = {
    'amd64': 'x86_64-linux-gnu',
    'arm64': 'aarch64-linux-gnu',
    'i386': 'i386-linux-gnu',
}
# The GNU type and the multiarch tuple are usually equal...
ARCH_TO_GNU_TYPE = ARCH_TO_TUPLE.copy()
# ... except on i386 (and 32-bit ARM, but we don't support that)
ARCH_TO_GNU_TYPE['i386'] = 'i686-linux-gnu'
SYSROOT_TAR = (
    'com.valvesoftware.SteamRuntime.Sdk-amd64,i386-{}-sysroot.tar.gz'
)


class SuiteDetails:
    def __init__(
        self,
        suite: str,
        *,
        archs: Sequence[str] = ('amd64',),
        oci: str = '',
        cross_oci: Dict[str, str] = {},
        tests_need_platform: bool = False,
        tests_need_sysroot: bool = False,
    ) -> None:
        self.suite = suite
        self.archs = list(archs)
        self.oci = oci
        self.cross_oci = dict(cross_oci)
        self.tests_need_platform = tests_need_platform
        self.tests_need_sysroot = tests_need_sysroot


class Environment:
    def __init__(
        self,
        builddir_parent: Union[str, os.PathLike] = '_build',
        bwrap: bool = False,
        cross: bool = False,
        docker: bool = False,
        podman: bool = False,
        srcdir: Union[str, os.PathLike] = '.',
    ) -> None:
        if not (bwrap or docker or podman):
            if shutil.which('podman') is not None:
                podman = True
            else:
                bwrap = True

        self.builddir_parent = Path(builddir_parent)
        self.srcdir = Path(srcdir)

        self.builddir_parent.mkdir(exist_ok=True)

        self.abs_srcdir = self.srcdir.resolve()
        self.abs_builddir_parent = self.builddir_parent.resolve()

        self.bwrap = bwrap
        self.cross = cross
        self.podman = podman

        if docker:
            groups = set(os.getgroups())
            groups.add(os.geteuid())

            try:
                docker_gid = grp.getgrnam('docker').gr_gid
            except KeyError:
                self.docker = ['sudo', 'docker']
            else:
                if docker_gid in groups:
                    self.docker = ['docker']
                else:
                    self.docker = ['sudo', 'docker']
        else:
            self.docker = []

        self.download_pressure_vessel = (
            self.abs_srcdir / 'subprojects' / 'container-runtime'
            / 'download-pressure-vessel.py'
        )
        self.populate_depot = (
            self.abs_srcdir / 'subprojects' / 'container-runtime'
            / 'populate-depot.py'
        )

        self.cache = self.abs_builddir_parent / 'cache'
        self.containers = self.abs_builddir_parent / 'containers'

        real_builddir = self.abs_builddir_parent.resolve()

        oci_run_args = [
            '--rm',
            '-i',
            '--security-opt', 'label=disable',
            '--platform', 'linux/amd64',
            '--tmpfs', '/tmp',
            '--tmpfs', '/var/tmp',
            '--tmpfs', '/home',
            '--tmpfs', '/run',
            '--tmpfs', '/run/host',
            '-v', '{}:{}'.format(self.abs_srcdir, self.abs_srcdir),
            '-v', '{}:{}'.format(real_builddir, real_builddir),
            '-w', str(self.abs_srcdir),
        ]

        if not self.podman:
            oci_run_args.extend([
                '-v', '/etc/passwd:/etc/passwd:ro',
                '-v', '/etc/group:/etc/group:ro',
            ])

        if sys.stdout.isatty() and sys.stderr.isatty():
            oci_run_args.append('-t')

        if real_builddir != self.abs_builddir_parent:
            oci_run_args.extend([
                '-v', '{}:{}'.format(
                    real_builddir,
                    self.abs_builddir_parent,
                ),
            ])

        self.suites: Dict[str, SuiteDetails] = {}

        for suite in ('scout', 'soldier', 'sniper', 'steamrt3c'):
            cross_oci: Dict[str, str] = {}
            registry = 'registry.gitlab.steamos.cloud'

            if suite == 'steamrt3c':
                archs = ['amd64', 'arm64', 'i386']
                cross_oci = dict(
                    arm64=(
                        f'{registry}/steamrt/{suite}/sdk/arm64-on-amd64:beta'
                    ),
                )
            elif suite == 'scout':
                archs = ['amd64', 'i386']
            else:
                archs = ['amd64']

            self.suites[suite] = SuiteDetails(
                suite,
                oci=f'{registry}/steamrt/{suite}/sdk:beta',
                archs=archs,
                cross_oci=cross_oci,
                tests_need_platform=(suite in ('scout', 'soldier')),
                tests_need_sysroot=(suite in ('scout', 'soldier')),
            )

        for suite in ('steamrt4', 'steamrt5'):
            # Known about, but not built
            self.suites[suite] = SuiteDetails(suite)

        if self.podman:
            self.oci_run_argv = ['podman', 'run'] + oci_run_args
        elif self.docker:
            self.oci_run_argv = self.docker + [
                'run',
                '-e', 'HOME={}'.format(Path.home()),
                '-u', '{}:{}'.format(os.geteuid(), os.getegid()),
            ] + oci_run_args
        else:
            self.oci_run_argv = []

    def populate_depots(self):
        self.cache.mkdir(exist_ok=True)

        with tempfile.TemporaryDirectory() as empty_depot_template:
            Path(empty_depot_template, 'common').mkdir()

            subprocess.run(
                [self.download_pressure_vessel, self.cache],
                check=True,
            )

            for suite, details in self.suites.items():
                if not details.oci:
                    continue

                if (
                    self.oci_run_argv
                    and not (
                        details.tests_need_platform
                        or details.tests_need_sysroot
                    )
                ):
                    continue

                if suite in ('scout', 'steamrt3c'):
                    version = 'latest-steam-client-public-beta'
                else:
                    version = 'latest-container-runtime-public-beta'

                argv = [
                    self.populate_depot,
                    '--cache', self.cache,
                    '--depot', self.containers,
                    '--pressure-vessel-archive', os.path.join(
                        self.cache, 'pressure-vessel-bin.tar.gz',
                    ),
                    '--no-check-steampipe-compatible',
                    '--no-mtrees',
                    '--no-versioned-directories',
                    '--source-dir', empty_depot_template,
                    f'--version={version}',
                ]

                if details.tests_need_sysroot or not self.oci_run_argv:
                    argv.append('--include-sdk-sysroot')

                argv.append(suite)
                subprocess.run(argv, check=True)

    def run_in_suite(
        self,
        suite: str,
        argv: List[str],
        check: bool = True,
        build_arch: str = '',
        host_arch: str = ''
    ) -> None:
        if self.oci_run_argv:
            if build_arch and host_arch:
                image = self.suites[suite].oci.replace(
                    ':',
                    f'/{host_arch}-on-{build_arch}:',
                )
            else:
                image = self.suites[suite].oci

            subprocess.run(
                self.oci_run_argv + [image] + argv,
                check=check,
            )
        else:
            sysroot = self.containers / (suite + '_sysroot')
            tarball = self.cache / SYSROOT_TAR.format(suite)
            subprocess.run(
                [
                    str(self.abs_srcdir / 'build-aux' / 'run-in-sysroot.py'),
                    '--srcdir', str(self.srcdir),
                    '--builddir', str(self.builddir_parent),
                    '--sysroot', str(sysroot),
                    '--tarball', str(tarball),
                    '--',
                ] + argv,
                check=check,
            )

    def run_scout_builds(self, verb: str, args: List[str]) -> None:
        self.run_in_suite(
            'scout',
            [
                str(self.abs_srcdir / 'build-aux' / 'scout-builds.py'),
                '--srcdir', str(self.srcdir),
                '--builddir', str(self.builddir_parent),
                verb,
            ] + args,
        )

    def deps(self, args: List[str]) -> None:
        self.populate_depots()

        for suite, details in self.suites.items():
            for oci in [details.oci] + list(details.cross_oci.values()):
                if not oci:
                    continue

                if self.podman:
                    subprocess.run(['podman', 'pull', oci], check=True)
                elif self.docker:
                    subprocess.run(
                        self.docker + ['pull', oci],
                        check=True,
                    )

    def setup_one(
        self,
        subdir: str,
        args: List[str],
        *,
        build_arch: str = '',
        check: bool = True,
        host_arch: str = '',
        in_suite: str = '',
    ) -> None:
        d = self.abs_builddir_parent / subdir

        if (d / 'meson-private' / 'coredata.dat').exists():
            maybe_wipe = ['--wipe']
        else:
            maybe_wipe = []

        argv = [
            'meson',
            'setup',
            str(d),
        ] + maybe_wipe + args

        if in_suite:
            self.run_in_suite(
                in_suite,
                argv,
                build_arch=build_arch,
                check=check,
                host_arch=host_arch,
            )
        else:
            subprocess.run(argv, check=check)

    def setup(self, args: List[str]) -> None:
        common_args = [
            '-Doptimization=g',
            '-Dprefix=/usr',
        ]

        minimal_args = common_args + [
            '-Dgtk_doc=disabled',
            '-Dlibcurl_compat=false',
            '-Dman=disabled',
            '-Dpressure_vessel=false',
        ]

        dev_build = common_args + [
            '-Dbin=true',
            # libcurl_compat defaults to false, but for developer builds
            # we want it true so we can get more test coverage
            '-Dlibcurl_compat=true',
            '-Dpressure_vessel=true',
            '-Dwarning_level=3',
            '-Dwerror=true',
        ]

        asan_dev_build = dev_build + [
            '-Db_lundef=false',
            '-Db_sanitize=address,undefined',
        ]

        self.setup_one(
            'host',
            asan_dev_build + [
                ('-Dtest_containers_dir='
                 + str(self.abs_builddir_parent / 'containers')),
            ] + args,
        )

        self.setup_one(
            'arm64',
            dev_build + [
                '-Dintrospection=disabled',
                '-Dmultiarch_tuple=aarch64-linux-gnu',
                '--cross-file=build-aux/meson/arm64.txt',
            ] + args,
            # Host system doesn't necessarily have an arm64 toolchain
            check=False,
        )

        self.setup_one(
            'i386',
            asan_dev_build + [
                '-Dmultiarch_tuple=i386-linux-gnu',
                '--cross-file=build-aux/meson/i386.txt',
                '--libdir=lib/i386-linux-gnu',
            ] + args,
            # Host system doesn't necessarily have an i386 toolchain
            check=False,
        )

        self.setup_one(
            'host-no-asan',
            dev_build + [
                ('-Dtest_containers_dir='
                 + str(self.abs_builddir_parent / 'containers')),
            ] + args,
        )

        self.setup_one(
            'coverage',
            dev_build + [
                '-Db_coverage=true',
            ] + args,
        )

        self.setup_one(
            'doc',
            [
                '-Dgtk_doc=enabled',
                '-Dman=enabled',
                '-Dpressure_vessel=true',
            ] + args,
        )

        self.setup_one(
            'clang',
            asan_dev_build + [
                '--native-file=build-aux/meson/clang.txt',
                # Workaround for
                # https://github.com/mesonbuild/meson/issues/13211
                '-Dintrospection=disabled',
            ] + args,
        )

        for suite, details in self.suites.items():
            if suite == 'scout' or not details.oci:
                continue

            for arch in details.archs:
                build_arch = host_arch = ''
                multiarch = ARCH_TO_TUPLE[arch]
                gnu_type = ARCH_TO_GNU_TYPE[arch]

                if arch not in ('amd64', 'i386'):
                    # For now we assume an amd64 build architecture
                    build_arch = 'amd64'
                    host_arch = arch
                    options = minimal_args + [
                        f'-Dmultiarch_tuple={multiarch}',
                        '-Dpressure_vessel=true',
                        f'--cross-file={gnu_type}-gcc.txt',
                        f'--libdir=lib/{multiarch}',
                    ]
                elif arch == 'i386':
                    # For now we assume an amd64 build architecture,
                    # for which i386 is a secondary architecture
                    # rather than needing a special cross container
                    options = minimal_args + [
                        f'-Dmultiarch_tuple={multiarch}',
                        f'--cross-file={gnu_type}-gcc.txt',
                        f'--libdir=lib/{multiarch}',
                    ]
                else:
                    options = dev_build

                # We don't currently support cross-compiling with just bwrap,
                # only via an expanded OCI image that has both build- and
                # host-architecture packages
                if host_arch and not self.oci_run_argv:
                    continue

                self.setup_one(
                    f'{suite}-{arch}',
                    options + ['-Dwarning_level=2'] + args,
                    build_arch=build_arch,
                    host_arch=host_arch,
                    in_suite=suite,
                )

        self.run_scout_builds('setup', args)

    def clean(self, args: List[str]) -> None:
        for builddir in ('clang', 'host', 'coverage', 'doc', 'host-no-asan'):
            subprocess.run(
                [
                    'ninja',
                    '-C', str(self.builddir_parent / builddir),
                    'clean',
                ] + args,
                check=True,
            )

        for builddir in ('i386',):
            subprocess.run(
                [
                    'ninja',
                    '-C', str(self.builddir_parent / builddir),
                    'clean',
                ] + args,
                check=False,
            )

        for suite, details in self.suites.items():
            if suite == 'scout' or not details.oci:
                continue

            for arch in details.archs:
                if arch not in ('amd64', 'i386'):
                    build_arch = 'amd64'
                    host_arch = arch
                else:
                    build_arch = host_arch = ''

                if host_arch and not self.oci_run_argv:
                    continue

                self.run_in_suite(
                    suite,
                    [
                        'ninja',
                        '-C',
                        str(self.abs_builddir_parent / f'{suite}-{arch}'),
                        'clean',
                    ] + args,
                    build_arch=build_arch,
                    host_arch=host_arch,
                )

        self.run_scout_builds('clean', args)

    def build(self, args: List[str]) -> None:
        for builddir in ('host', 'clang'):
            subprocess.run(
                [
                    'ninja',
                    '-C', str(self.builddir_parent / builddir),
                ] + args,
                check=True,
            )

        for suite, details in self.suites.items():
            if suite == 'scout' or not details.oci:
                continue

            for arch in details.archs:
                if arch not in ('amd64', 'i386'):
                    build_arch = 'amd64'
                    host_arch = arch
                else:
                    build_arch = host_arch = ''

                if host_arch and not self.oci_run_argv:
                    continue

                self.run_in_suite(
                    suite,
                    [
                        'ninja',
                        '-C',
                        str(self.abs_builddir_parent / f'{suite}-{arch}'),
                    ] + args,
                    build_arch=build_arch,
                    host_arch=host_arch,
                )

        self.run_scout_builds('build', args)

    def test(self, args: List[str]) -> None:
        subprocess.run(
            [
                'meson', 'test',
                '-C', str(self.builddir_parent / 'clang'),
            ] + args,
            check=True,
        )

        for suite, details in self.suites.items():
            if suite == 'scout' or not details.oci:
                continue

            for arch in details.archs:
                if arch in ('amd64', 'i386'):
                    self.run_in_suite(
                        suite,
                        [
                            'meson', 'test',
                            '-C',
                            str(self.abs_builddir_parent / f'{suite}-{arch}'),
                        ] + args,
                    )

        self.run_scout_builds('test', args)

        # We need to set up the relocatable installation before we can
        # have full test coverage for the host build
        self.install([])

        artifacts = self.abs_builddir_parent / 'host-artifacts'

        with suppress(FileNotFoundError):
            shutil.rmtree(artifacts)

        subprocess.run(
            [
                'env',
                'AUTOPKGTEST_ARTIFACTS=' + str(artifacts),
                'meson', 'test',
                '-C', str(self.builddir_parent / 'host'),
            ] + args,
            check=True,
        )

    def lint(self, args: List[str]) -> None:
        subprocess.run(
            [
                'env', 'LINT_WARNINGS_ARE_ERRORS=1',
                'meson', 'test',
                '-C', str(self.builddir_parent / 'host'),
                '--suite=lint',
                '--verbose',
            ] + args,
            check=True,
        )

    def install(self, args: List[str]) -> None:
        if self.oci_run_argv:
            suite = 'steamrt3c'

            for comma_archs in ('amd64,i386', 'arm64', 'arm64,amd64,i386'):
                archs = comma_archs.split(',')
                destdir = (
                    self.abs_builddir_parent
                    / f'{suite}-DESTDIR-{comma_archs}'
                )

                with suppress(FileNotFoundError):
                    shutil.rmtree(destdir)

                # True if we can run all of the architectures natively
                can_run = True

                # We install the last architecture first, so that the main
                # architecture is installed last, overwriting shared binaries
                # like bin/pv-verify with those from the "main" architecture.
                for arch in reversed(archs):
                    if arch not in ('amd64', 'i386'):
                        build_arch = 'amd64'
                        host_arch = arch
                        can_run = False
                    else:
                        build_arch = host_arch = ''

                    self.run_in_suite(
                        suite,
                        [
                            'env',
                            f'DESTDIR={destdir}',
                            'ninja',
                            '-C',
                            str(self.abs_builddir_parent / f'{suite}-{arch}'),
                            'install',
                        ],
                        build_arch=build_arch,
                        host_arch=host_arch,
                    )

                relocatable = (
                    self.abs_builddir_parent
                    / f'pv-{suite}-{comma_archs}'
                )

                with suppress(FileNotFoundError):
                    shutil.rmtree(relocatable)

                comma_tuples = ','.join(
                    ARCH_TO_TUPLE[a] for a in comma_archs.split(',')
                )
                argv = [
                    str(
                        self.abs_srcdir
                        / 'pressure-vessel'
                        / 'build-relocatable-install.py'
                    ),
                    '--allow-missing-sources',
                    f'--archive={self.abs_builddir_parent}',
                    f'--architecture-multiarch={comma_tuples}',
                    f'--architecture-name={comma_archs}',
                    '--cache=' + str(self.abs_builddir_parent / 'cache'),
                    f'--destdir={destdir}',
                    '--no-archive-versions',
                    f'--output={relocatable}',
                ]

                if not can_run:
                    # The steamrt3c SDK doesn't currently contain qemu-user,
                    # which we need to be able to run
                    # aarch64-linux-gnu-capsule-capture-libs and collect
                    # arm64 dependencies, and installing it could take a while.
                    # Skip this step by default, and if enabled, install
                    # qemu-user before proceeding.
                    if not self.cross:
                        continue

                    argv = [
                        'sh',
                        '-euc',
                        ('apt-get -y update; '
                         'apt-get -y --no-install-recommends install '
                         'qemu-user; '
                         'exec "$@"'),
                        'sh',
                    ] + argv

                build_arch = host_arch = ''

                for arch in archs:
                    # The main SDK is for amd64 and supports i386,
                    # but in cross-architecture use cases we might need
                    # a cross-SDK.
                    if arch not in ('amd64', 'i386'):
                        build_arch = 'amd64'

                        if host_arch != arch:
                            # Can't happen right now, but if we added
                            # another architecture (riscv64 or something)
                            # we could conceivably find ourselves needing an
                            # arm64-riscv64-on-amd64 SDK, and run_in_suite()
                            # can't currently handle that.
                            raise AssertionError(
                                f'We need a SDK supporting both {arch} and '
                                f'{host_arch}'
                            )

                        host_arch = arch

                self.run_in_suite(
                    suite,
                    argv,
                    build_arch=build_arch,
                    check=True,
                    host_arch=host_arch,
                )

                if can_run:
                    subprocess.run(
                        [
                            str(
                                self.abs_srcdir
                                / 'tests'
                                / 'pressure-vessel'
                                / 'relocatable-install.py'
                            ),
                            str(relocatable),
                        ],
                        check=True,
                    )

        self.run_scout_builds('install', args)

        subprocess.run(
            [
                str(self.abs_srcdir / 'build-aux' / 'scout-layered.sh'),
                str(self.builddir_parent / 'scout-layered'),
            ],
            check=True,
        )

        pv = self.containers / 'pressure-vessel'

        with suppress(FileNotFoundError):
            shutil.rmtree(pv)

        shutil.copytree(
            self.builddir_parent / 'scout-relocatable',
            pv,
            symlinks=True,
        )
        print('To upload to a test machine:')
        print(
            'rsync -avzP --delete {}/ '
            'machine:tmp/steam-runtime-tools-tests/'.format(
                self.builddir_parent
                / 'scout-DESTDIR/usr/libexec/installed-tests'
                / 'steam-runtime-tools-0'
            )
        )
        print(
            'rsync -avzP --delete {}/ '
            'machine:.../steamapps/common/'
            'SteamLinuxRuntime_soldier/pressure-vessel/'.format(pv)
        )
        print(
            'rsync -avzP --delete '
            '{}/scout-layered/SteamLinuxRuntime/ '
            'machine:.../steamapps/common/SteamLinuxRuntime/'.format(
                self.builddir_parent,
            )
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--builddir-parent', default='_build')
    parser.add_argument(
        '--bwrap', action='store_true', default=False,
        help='Use SDK tarball via bubblewrap',
    )
    parser.add_argument(
        '--cross', action='store_true', default=False,
        help='Install cross-architecture things, even if it could be slow',
    )
    parser.add_argument(
        '--docker', action='store_true', default=False,
        help='Use SDK OCI image via Docker',
    )
    parser.add_argument(
        '--podman', action='store_true', default=False,
        help='Use SDK OCI image via podman [default if installed]',
    )
    parser.add_argument('--srcdir', default='.')
    parser.add_argument(
        'command',
        choices=(
            'deps',
            'setup',
            'clean',
            'build',
            'test',
            'lint',
            'install',
            'all',
        ),
    )
    parser.add_argument('args', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    env = Environment(
        builddir_parent=args.builddir_parent,
        bwrap=args.bwrap,
        cross=args.cross,
        docker=args.docker,
        podman=args.podman,
        srcdir=args.srcdir,
    )

    if args.command == 'deps':
        env.deps(args.args)
    elif args.command == 'setup':
        env.setup(args.args)
    elif args.command == 'clean':
        env.clean(args.args)
    elif args.command == 'build':
        env.build(args.args)
    elif args.command == 'test':
        env.test(args.args)
    elif args.command == 'lint':
        env.lint(args.args)
    elif args.command == 'install':
        env.install(args.args)
    elif args.command == 'all':
        env.test(args.args)
        env.install(args.args)
    else:
        raise AssertionError

    return 0


if __name__ == '__main__':
    sys.exit(main())

# vim:set sw=4 sts=4 et:
