#!/usr/bin/env python3
# Copyright 2020 Collabora Ltd.
#
# SPDX-License-Identifier: MIT

"""
Test pressure-vessel against an out-of-band set of pre-prepared containers.

To run during build-time testing, build with
-Dtest_containers_dir=/path/to/containers, where /path/to/containers
ideally contains at least:

* pressure-vessel:
    A sufficiently recent copy of pressure-vessel, used for the parts
    that must run inside the container (because we cannot assume that
    an arbitrary build done on the host system is compatible with the
    libraries inside the container)
* steam-runtime:
    An LD_LIBRARY_PATH runtime, which we use to find versions of
    steam-runtime-system-info and capsule-capture-libs that can run
    on the host system
* scout/files:
    The Platform merged-/usr from the SteamLinuxRuntime depot
* soldier/files:
    The Platform merged-/usr from the SteamLinuxRuntime depot
* scout_sysroot, soldier_sysroot:
    An SDK sysroot like the one recommended for the Docker container
* scout_sysroot_usrmerge:
    The same, but /usr-merged

and run (for example) 'meson test -v -C _build' as usual.

The same test can also be run against a version of pressure-vessel
that was built against scout:

    export PRESSURE_VESSEL_TEST_CONTAINERS=/path/to/containers
    ./build-aux/run-in-sysroot.py --sysroot ../scout-sysroot -- \
        ninja -C _build-for-sysroot
    env DESTDIR="$(pwd)/_build-for-sysroot/DESTDIR" \
        ./build-aux/run-in-sysroot.py --sysroot ../scout-sysroot -- \
        ninja -C _build-for-sysroot install
    rm -fr "$PRESSURE_VESSEL_TEST_CONTAINERS/pressure-vessel"
    env DESTDIR="$(pwd)/_build-for-sysroot/DESTDIR" \
        ./build-aux/run-in-sysroot.py --sysroot ../scout-sysroot -- \
        python3.5 ./pressure-vessel/build-relocatable-install.py \
        --output="$PRESSURE_VESSEL_TEST_CONTAINERS/pressure-vessel" \
        --check-source-directory="$PRESSURE_VESSEL_TEST_CONTAINERS" \
        --allow-missing-sources
    ./tests/pressure-vessel/soldier-usr.py  # etc.

or against the SteamLinuxRuntime depot that gets uploaded to the Steam CDN:

    export PRESSURE_VESSEL_TEST_CONTAINERS=../SteamLinuxRuntime/depot
    ./tests/pressure-vessel/soldier-usr.py  # etc.

Influential environment variables:

* AUTOPKGTEST_ARTIFACTS:
    Write test artifacts to this directory (borrowed from Debian's
    autopkgtest framework) instead of a temporary directory. This makes
    debugging easier.
* BWRAP:
    A bubblewrap executable.
    Only set this if a setuid bwrap is required,
    or if not running from a just-built version of steam-runtime-tools.
* G_TEST_SRCDIR:
    The ./tests/pressure-vessel subdirectory of the source root,
    typically $(pwd)/tests/pressure-vessel,
    or the pressure-vessel subdirectory of the "as-installed" tests,
    ${libexecdir}/installed-tests/steam-runtime-tools-0/pressure-vessel
* G_TEST_BUILDDIR:
    The ./tests/pressure-vessel subdirectory of the build root,
    typically $(pwd)/_build/tests/pressure-vessel,
    or the pressure-vessel subdirectory of the "as-installed" tests,
    ${libexecdir}/installed-tests/steam-runtime-tools-0/pressure-vessel
* PRESSURE_VESSEL_LIBCAPSULE_TOOLS:
    Override the location of capsule-capture-libs etc.
* PRESSURE_VESSEL_TEST_CONTAINERS:
    A complete relocatable pressure-vessel installation, including its
    dependencies such as libsteam-runtime-tools
* SRT_TEST_UNINSTALLED:
    Set when running from the source/build trees
* STEAM_RUNTIME_SYSTEM_INFO:
    Path to a steam-runtime-system-info executable for the host system

Please keep this script compatible with python3.4 so that it can be
run on the oldest platforms where pressure-vessel works:
SteamOS 2 'brewmaster', Debian 8 'jessie', Ubuntu 14.04 'trusty'.
"""

import contextlib
import fcntl
import glob
import json
import logging
import os
import shutil
import struct
import sys
import tempfile
import time
import unittest
from pathlib import Path

try:
    import typing
    typing      # placate pyflakes
except ImportError:
    pass

from testutils import (
    BaseTest,
    run_subprocess,
)


logger = logging.getLogger('test-containers')


class FilesystemEnvVar:
    def __init__(
        self,
        name,       # type: str
        *,
        plural=False,
        read_only=False
    ) -> None:
        self.name = name
        self.plural = plural
        self.read_only = read_only

    def __str__(self) -> str:
        return self.name


FILESYSTEM_ENV_VARS = [
    FilesystemEnvVar(
        'PRESSURE_VESSEL_FILESYSTEMS_RO', plural=True, read_only=True,
    ),
    FilesystemEnvVar('PRESSURE_VESSEL_FILESYSTEMS_RW', plural=True),
    FilesystemEnvVar('STEAM_COMPAT_APP_LIBRARY_PATH'),
    FilesystemEnvVar('STEAM_COMPAT_APP_LIBRARY_PATHS', plural=True),
    FilesystemEnvVar('STEAM_COMPAT_CLIENT_INSTALL_PATH'),
    FilesystemEnvVar('STEAM_COMPAT_DATA_PATH'),
    FilesystemEnvVar('STEAM_COMPAT_INSTALL_PATH'),
    FilesystemEnvVar('STEAM_COMPAT_LIBRARY_PATHS', plural=True),
    FilesystemEnvVar('STEAM_COMPAT_MOUNT_PATHS', plural=True),
    FilesystemEnvVar('STEAM_COMPAT_MOUNTS', plural=True),
    FilesystemEnvVar('STEAM_COMPAT_SHADER_PATH'),
    FilesystemEnvVar('STEAM_COMPAT_TOOL_PATH'),
    FilesystemEnvVar('STEAM_COMPAT_TOOL_PATHS', plural=True),
    FilesystemEnvVar('STEAM_EXTRA_COMPAT_TOOLS_PATHS', plural=True),
]


class BaseContainersTest(BaseTest):
    bwrap = None            # type: typing.Optional[str]
    containers_dir = ''
    host_srsi = None        # type: typing.Optional[str]
    host_srsi_parsed = {}   # type: typing.Dict[str, typing.Any]
    pv_dir = ''
    pv_wrap = ''
    runtime_is_sdk = False

    @staticmethod
    def copy2(src, dest):
        logger.info('Copying %r to %r', src, dest)
        shutil.copy2(src, dest)

    @staticmethod
    def copytree(src, dest):
        logger.info('Copying %r to %r', src, dest)
        shutil.copytree(src, dest, symlinks=True)

    @classmethod
    def setUpClass(cls) -> None:
        super().setUpClass()

        cls.run_inside_runtime = False

        cls.G_TEST_SRCDIR = os.getenv(
            'G_TEST_SRCDIR',
            os.path.abspath(os.path.dirname(__file__)),
        )
        cls.G_TEST_BUILDDIR = os.getenv(
            'G_TEST_BUILDDIR',
            os.path.abspath(
                os.path.join(os.path.dirname(__file__)),
            ),
        )

        if not os.environ.get('PRESSURE_VESSEL_TEST_CONTAINERS', ''):
            raise unittest.SkipTest('Containers not available')

        cls.containers_dir = os.path.abspath(
            os.environ['PRESSURE_VESSEL_TEST_CONTAINERS']
        )

        cls.pv_dir = os.path.join(cls.tmpdir.name, 'pressure-vessel')
        os.makedirs(cls.pv_dir, exist_ok=True)

        for var in FILESYSTEM_ENV_VARS:
            paths = []

            if var.plural:
                names = [var.name + '_n1', var.name + '_n2']
            else:
                # Use an inconvenient name with colon and space
                # to check that we handle those correctly
                names = [var.name + ': .d']

            for name in names:
                path = os.path.join(cls.tmpdir.name, name)
                os.makedirs(path, exist_ok=True)
                paths.append(path)

            os.environ[var.name] = ':'.join(paths)

        # We rely on steam-runtime-system-info finding the bundled helpers
        # for both i386 and x86_64, and not just the x86_64 helpers from
        # the build tree
        os.environ.pop('SRT_HELPERS_PATH', None)

        if 'SRT_TEST_UNINSTALLED' in os.environ:
            os.makedirs(os.path.join(cls.pv_dir, 'bin'))
            os.makedirs(
                os.path.join(cls.pv_dir, 'libexec', 'steam-runtime-tools-0'),
            )

            for exe in (
                'pressure-vessel/pressure-vessel-wrap',
            ):
                cls.copy2(
                    os.path.join(cls.top_builddir, exe),
                    os.path.join(cls.pv_dir, 'bin', os.path.basename(exe)),
                )

            for exe in (
                'subprojects/bubblewrap/srt-bwrap',
            ):
                cls.copy2(
                    os.path.join(cls.top_builddir, exe),
                    os.path.join(
                        cls.pv_dir,
                        'libexec',
                        'steam-runtime-tools-0',
                        os.path.basename(exe),
                    ),
                )

            for exe in (
                'pv-locale-gen',
            ):
                cls.copy2(
                    os.path.join(cls.top_srcdir, 'pressure-vessel', exe),
                    os.path.join(
                        cls.pv_dir,
                        'libexec',
                        'steam-runtime-tools-0',
                        os.path.basename(exe),
                    ),
                )

            for exe in (
                'pv-adverb',
                'pv-try-setlocale',
            ):
                in_containers_dir = os.path.join(
                    cls.containers_dir,
                    'pressure-vessel',
                    'libexec',
                    'steam-runtime-tools-0',
                    exe,
                )

                if os.path.exists(in_containers_dir):
                    # Asssume it's a close enough version that we can
                    # use it with the newer pressure-vessel-wrap.
                    # We don't necessarily want to use versions from
                    # the builddir because they can have dependencies
                    # that are newer than the container's libraries.
                    logger.info(
                        'Copying pre-existing %s from %s',
                        exe, in_containers_dir,
                    )
                    cls.copy2(
                        in_containers_dir,
                        os.path.join(
                            cls.pv_dir,
                            'libexec',
                            'steam-runtime-tools-0',
                            exe,
                        ),
                    )
                else:
                    logger.info(
                        'Copying just-built %s from %s/pressure-vessel',
                        exe, cls.top_builddir,
                    )
                    cls.copy2(
                        os.path.join(cls.top_builddir, 'pressure-vessel', exe),
                        os.path.join(
                            cls.pv_dir,
                            'libexec',
                            'steam-runtime-tools-0',
                            exe,
                        ),
                    )

            for d in (
                'subprojects',
            ):
                shutil.copytree(
                    os.path.join(cls.top_builddir, d),
                    os.path.join(cls.pv_dir, d),
                    symlinks=True,
                )

            # We need both i386 and x86_64 helper utilities
            for multiarch in ('i386-linux-gnu', 'x86_64-linux-gnu'):
                libdir = Path('/usr/lib/{}'.format(multiarch))

                if libdir.exists():
                    # We need at least one user-space graphics driver per
                    # architecture tested, otherwise some of our assumptions
                    # will be broken.
                    for driver in (
                        libdir / 'dri' / 'swrast_dri.so',
                        libdir / 'libGLX_mesa.so.0',
                        libdir / 'libGLX_nvidia.so.0',
                        libdir / 'libVkLayer_MESA_device_select.so',
                        libdir / 'libvulkan_lvp.so',
                    ):
                        if driver.exists():
                            break
                    else:
                        raise AssertionError(
                            'We need at least one {} graphics driver'.format(
                                multiarch,
                            )
                        )

                for tool in (
                    'capsule-capture-libs',
                    'detect-lib',
                    'detect-platform',
                    'exec',
                    'inspect-library',
                ):
                    exe = multiarch + '-' + tool
                    tool_path = os.path.join(
                        cls.pv_dir,
                        'libexec',
                        'steam-runtime-tools-0',
                        exe,
                    )
                    in_containers_dir = os.path.join(
                        cls.containers_dir,
                        'pressure-vessel',
                        'libexec',
                        'steam-runtime-tools-0',
                        exe,
                    )

                    if os.path.exists(in_containers_dir):
                        # Asssume it's a close enough version that we can
                        # use it with the newer pressure-vessel-wrap.
                        logger.info(
                            'Copying pre-existing %s from %s',
                            exe, in_containers_dir,
                        )
                        cls.copy2(
                            in_containers_dir,
                            tool_path,
                        )
                    else:
                        logger.info(
                            'Copying just-built %s from %s/pressure-vessel',
                            exe, cls.top_builddir,
                        )
                        cls.copy2(
                            os.path.join(
                                cls.top_builddir, 'helpers', exe,
                            ),
                            tool_path,
                        )

                dest_path = os.path.join(
                    cls.pv_dir,
                    'libexec',
                    'steam-runtime-tools-0',
                    multiarch,
                )
                in_containers_dir = os.path.join(
                    cls.containers_dir,
                    'pressure-vessel',
                    'libexec',
                    'steam-runtime-tools-0',
                    multiarch,
                )

                if os.path.exists(in_containers_dir):
                    # Asssume it's a close enough version that we can
                    # use it with the newer pressure-vessel-wrap.
                    logger.info(
                        'Copying pre-existing %s library stubs from %s',
                        multiarch, in_containers_dir,
                    )
                    cls.copytree(in_containers_dir, dest_path)
        else:
            cls.pv_dir = os.path.join(cls.containers_dir, 'pressure-vessel')

            if not os.path.isdir(cls.pv_dir):
                raise unittest.SkipTest('{} not found'.format(cls.pv_dir))

        bwrap = os.environ.get(
            'BWRAP',
            os.path.join(
                cls.pv_dir, 'libexec', 'steam-runtime-tools-0', 'srt-bwrap',
            ),
        )

        if run_subprocess(
            [bwrap, '--dev-bind', '/', '/', 'sh', '-c', 'true'],
            stdout=2,
            stderr=2,
        ).returncode != 0:
            # We can only do tests that just do setup and don't actually
            # try to run the container.
            cls.bwrap = None

            if cls.getenv_tristate('ASSERT_BWRAP_WORKS'):
                raise AssertionError(
                    'bwrap executable {!r} did not work'.format(bwrap),
                )
        else:
            cls.bwrap = bwrap

        cls.pv_wrap = os.path.join(cls.pv_dir, 'bin', 'pressure-vessel-wrap')

        host_srsi = os.getenv('STEAM_RUNTIME_SYSTEM_INFO')

        if host_srsi is None:
            rt = os.path.join(cls.containers_dir, 'steam-runtime')

            host_srsi = shutil.which(
                os.path.join(
                    rt, cls.deb_arch,
                    'usr', 'bin', 'steam-runtime-system-info',
                )
            )

        if host_srsi is None:
            pv = os.path.join(cls.containers_dir, 'pressure-vessel')

            host_srsi = shutil.which(
                os.path.join(
                    pv, 'bin', 'steam-runtime-system-info',
                )
            )

        if host_srsi is None:
            host_srsi = shutil.which('steam-runtime-system-info')

        cls.host_srsi = host_srsi

        os.makedirs(cls.artifacts, exist_ok=True)

        if host_srsi is not None:
            logger.info("We have the host srsi %s", host_srsi)

            with contextlib.ExitStack() as stack:
                writer = stack.enter_context(
                    open(
                        os.path.join(cls.artifacts, 'host-srsi.json'),
                        'w',
                    )
                )

                if not cls.artifacts_persist:
                    log = sys.stderr        # type: typing.TextIO
                else:
                    log_path = os.path.join(cls.artifacts, 'host-srsi.log')
                    logger.info(
                        'Writing host s-r-s-i diagnostics to %s',
                        log_path,
                    )
                    log = stack.enter_context(open(log_path, 'w'))

                run_subprocess(
                    [
                        'env',
                        'LD_BIND_NOW=1',
                        host_srsi,
                        '--verbose',
                    ],
                    cwd=cls.artifacts,
                    stdout=writer,
                    stderr=log,
                    universal_newlines=True,
                )

            os.environ['HOST_STEAM_RUNTIME_SYSTEM_INFO_JSON'] = os.path.join(
                cls.artifacts, 'host-srsi.json',
            )

            with open(
                os.path.join(cls.artifacts, 'host-srsi.json'),
                'r',
            ) as reader:
                cls.host_srsi_parsed = json.load(reader)
        else:
            logger.info("The host srsi is missing")
            os.environ.pop('HOST_STEAM_RUNTIME_SYSTEM_INFO_JSON', None)
            cls.host_srsi_parsed = {}

        try:
            os.environ['HOST_LD_LINUX_SO_REALPATH'] = os.path.realpath(
                '/lib/ld-linux.so.2'
            )
        except OSError:
            os.environ.pop('HOST_LD_LINUX_SO_REALPATH', None)

        try:
            os.environ['HOST_LD_LINUX_X86_64_SO_REALPATH'] = os.path.realpath(
                '/lib64/ld-linux-x86-64.so.2'
            )
        except OSError:
            os.environ.pop('HOST_LD_LINUX_X86_64_SO_REALPATH', None)

    def setUp(self) -> None:
        super().setUp()
        cls = self.__class__
        self.bwrap = cls.bwrap
        self.containers_dir = cls.containers_dir
        self.host_srsi = cls.host_srsi
        self.host_srsi_parsed = cls.host_srsi_parsed
        self.pv_dir = cls.pv_dir
        self.pv_wrap = cls.pv_wrap
        self.runtime_is_sdk = cls.runtime_is_sdk

        os.makedirs(os.path.join(cls.artifacts, 'tmp'), exist_ok=True)

        # The artifacts directory is going to be the current working
        # directory inside the container, so we copy things we will
        # need into that directory.
        for f in ('testutils.py', 'inside-runtime.py'):
            for d in (
                os.path.dirname(os.path.abspath(__file__)),
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            ):
                if os.path.exists(os.path.join(d, f)):
                    self.copy2(
                        os.path.join(d, f),
                        os.path.join(cls.artifacts, 'tmp', f),
                    )
                    break
            else:
                raise AssertionError('Cannot find %r' % f)

        # This parsing is sufficiently "cheap" that we repeat it for
        # each test-case rather than introducing more class variables.

        self.host_os_release = cls.host_srsi_parsed.get('os-release', {})

        if self.host_os_release.get('id') == 'debian':
            logger.info('Host OS is Debian')
            self.host_is_debian_derived = True
        elif 'debian' in self.host_os_release.get('id_like', []):
            logger.info('Host OS is Debian-derived')
            self.host_is_debian_derived = True
        else:
            logger.info('Host OS is not Debian-derived')
            self.host_is_debian_derived = False

    def tearDown(self) -> None:
        with contextlib.suppress(FileNotFoundError):
            shutil.rmtree(os.path.join(self.artifacts, 'tmp'))

        super().tearDown()

    @classmethod
    def tearDownClass(cls) -> None:
        super().tearDownClass()

    def run_subprocess(
        self,
        args,           # type: typing.Union[typing.List[str], str]
        check=False,
        input=None,     # type: typing.Optional[bytes]
        timeout=None,   # type: typing.Optional[int]
        **kwargs        # type: typing.Any
    ):
        logger.info('Running: %r', args)
        return run_subprocess(
            args, check=check, input=input, timeout=timeout, **kwargs
        )

    def _test_scout(
        self,
        test_name: str,
        runtime: str,
        *,
        copy: bool = False,
        fake_home: bool = False,
        gc: bool = True,
        locales: bool = False,
        only_prepare: bool = False,
        workarounds: typing.Iterable[str] = ()
    ) -> None:
        self._test_container(
            test_name,
            runtime,
            copy=copy,
            fake_home=fake_home,
            gc=gc,
            is_scout=True,
            locales=locales,
            only_prepare=only_prepare,
            workarounds=workarounds,
        )

    def _test_soldier(
        self,
        test_name: str,
        runtime: str,
        *,
        copy: bool = False,
        fake_home: bool = False,
        gc: bool = True,
        locales: bool = False,
        mock_emulator: str = '',
        only_prepare: bool = False,
        workarounds: typing.Iterable[str] = ()
    ) -> None:
        self._test_container(
            test_name,
            runtime,
            copy=copy,
            gc=gc,
            is_soldier=True,
            locales=locales,
            mock_emulator=mock_emulator,
            only_prepare=only_prepare,
            workarounds=workarounds,
        )

    def _test_container(
        self,
        test_name: str,
        runtime: str,
        *,
        copy: bool = False,
        fake_home: bool = False,
        gc: bool = True,
        is_scout: bool = False,
        is_soldier: bool = False,
        locales: bool = False,
        mock_emulator: str = '',
        only_prepare: bool = False,
        workarounds: typing.Iterable[str] = ()
    ) -> None:
        if self.bwrap is None and not only_prepare:
            self.skipTest('Unable to run bwrap (in a container?)')

        if not os.path.isdir(runtime):
            self.skipTest('{} not found'.format(runtime))

        is_minimized = Path(runtime, 'usr-mtree.txt.gz').exists()

        # The --no-copy-runtime code path is rather fragile, and won't
        # work reliably on older Ubuntu, which is one of the reasons we
        # stopped using it in production
        if (
            # In practice it works on e.g. Arch, modern Debian, or
            # Ubuntu 26.04 (see
            # https://bugs.launchpad.net/ubuntu/+source/glibc/+bug/2127856)
            # but not on older Ubuntu, because we can't bind-mount
            # /sbin/ldconfig.real onto a nonexistent mount point in a
            # read-only directory
            Path('/sbin/ldconfig.real').exists()
            # The --copy-runtime code path is immune to this problem.
            # We always use that code path if the runtime is "minimized"
            # (reconstitutes its content from a mtree manifest).
            and not (copy or is_minimized)
            # We don't need to skip this for scout sysroots, because scout
            # happens to contain a /sbin/ldconfig.real itself.
            and not is_scout
        ):
            self.skipTest('steamrt/tasks#934')

        start_time = time.time()
        logger.info('Testing: %s', test_name)

        is_sdk = self.runtime_is_sdk

        artifacts = os.path.join(
            self.artifacts,
            test_name,
        )
        os.makedirs(artifacts, exist_ok=True)

        final_argv_path = os.path.join(artifacts, 'final-argv')

        env = os.environ.copy()
        env['PV_TEST_SET_WHEN_EMULATING'] = 'set-me'
        env['PV_TEST_UNSET_WHEN_EMULATING'] = 'unset-me'
        env['PV_TEST_SET_IN_CONTAINER'] = 'set-me'
        env['PV_TEST_UNSET_IN_CONTAINER'] = 'unset-me'
        env['MOCK_EMULATOR_SERVER_STATE'] = artifacts

        if 'G_DEBUG' not in env:
            env['G_DEBUG'] = 'fatal-criticals'

        data_dirs = env.get('XDG_DATA_DIRS', '/usr/local/share:/usr/share')
        env['XDG_DATA_DIRS'] = ':'.join([
            os.path.join(self.G_TEST_SRCDIR, 'mock-drivers', 'share'),
            data_dirs,
        ])

        if mock_emulator:
            env['PRESSURE_VESSEL_EMULATOR'] = os.path.join(
                self.G_TEST_SRCDIR,
                'mock-emulators',
                mock_emulator,
            )

        if workarounds:
            if 'PRESSURE_VESSEL_WORKAROUNDS' in env:
                workarounds = [
                    env['PRESSURE_VESSEL_WORKAROUNDS'],
                ] + list(workarounds)

            env['PRESSURE_VESSEL_WORKAROUNDS'] = ' '.join(workarounds)

        argv = [
            self.pv_wrap,
            '--verbose',
            '--write-final-argv', final_argv_path,
            '--filesystem', self.artifacts,
            '--runtime', runtime,
        ]

        var_dir = os.path.join(self.containers_dir, 'var')
        os.makedirs(var_dir, exist_ok=True)

        if not locales:
            argv.append('--no-generate-locales')

        with contextlib.ExitStack() as stack:
            temp = stack.enter_context(
                tempfile.TemporaryDirectory(
                    prefix='test-', dir=var_dir
                ),
            )
            mock_base = stack.enter_context(
                tempfile.TemporaryDirectory(
                    prefix='test-mock-base-', dir=var_dir
                ),
            )
            fake_home_temp = stack.enter_context(
                tempfile.TemporaryDirectory(
                    prefix='test-fake-home-', dir=var_dir
                ),
            )

            argv.extend(['--runtime-base', mock_base])
            argv.extend(['--variable-dir', temp])

            if copy:
                argv.append('--copy-runtime')
            else:
                argv.append('--no-copy-runtime')

            if gc:
                argv.append('--gc-runtimes')
            else:
                argv.append('--no-gc-runtimes')

            if fake_home:
                argv.append('--home=' + fake_home_temp)
            else:
                argv.append('--share-home')

            if is_scout:
                python = 'python3.5'
            else:
                python = 'python3'

            if only_prepare:
                argv.append('--only-prepare')
            else:
                argv.extend([
                    '--',
                    'env',
                    'TEST_INSIDE_RUNTIME_ARTIFACTS=' + artifacts,
                    'TEST_INSIDE_RUNTIME_IS_COPY=' + ('1' if copy else ''),
                    'TEST_INSIDE_RUNTIME_IS_HOME_UNSHARED=' + (
                        '1' if fake_home else ''
                    ),
                    'TEST_INSIDE_RUNTIME_IS_SCOUT=' + (
                        '1' if is_scout else ''
                    ),
                    'TEST_INSIDE_RUNTIME_IS_SDK=' + (
                        '1' if is_sdk else ''
                    ),
                    'TEST_INSIDE_RUNTIME_IS_SOLDIER=' + (
                        '1' if is_soldier else ''
                    ),
                    'TEST_INSIDE_RUNTIME_LOCALES=' + ('1' if locales else ''),
                    python,
                    os.path.join(self.artifacts, 'tmp', 'inside-runtime.py'),
                ])

            # Create directories representing previous runs of
            # pressure-vessel-wrap, so that we can assert that they are
            # GC'd (or not) as desired.

            # Do not delete because its name does not start with tmp-
            os.makedirs(os.path.join(temp, 'donotdelete'), exist_ok=True)
            # Delete
            os.makedirs(os.path.join(temp, 'tmp-deleteme'), exist_ok=True)
            # Do not delete because it has ./keep
            os.makedirs(os.path.join(temp, 'tmp-keep', 'keep'), exist_ok=True)
            # Do not delete because we will read-lock .ref
            os.makedirs(os.path.join(temp, 'tmp-rlock'), exist_ok=True)
            # Do not delete because we will write-lock .ref
            os.makedirs(os.path.join(temp, 'tmp-wlock'), exist_ok=True)

            rlock_writer = stack.enter_context(
                open(os.path.join(temp, 'tmp-rlock', '.ref'), 'w+'),
            )
            wlock_writer = stack.enter_context(
                open(os.path.join(temp, 'tmp-wlock', '.ref'), 'w'),
            )

            if not self.artifacts_persist:
                log = sys.stderr        # type: typing.TextIO
            else:
                log_path = os.path.join(artifacts, 'pressure-vessel.log')
                logger.info('Writing pressure-vessel output to %s', log_path)
                log = stack.enter_context(open(log_path, 'w'))

            lockdata = struct.pack('hhlli', fcntl.F_RDLCK, 0, 0, 0, 0)
            fcntl.fcntl(rlock_writer.fileno(), fcntl.F_SETLKW, lockdata)
            lockdata = struct.pack('hhlli', fcntl.F_WRLCK, 0, 0, 0, 0)
            fcntl.fcntl(wlock_writer.fileno(), fcntl.F_SETLKW, lockdata)

            # Put this in a subtest so that if it fails, we still get
            # to inspect the copied sysroot
            with self.subTest('run', copy=copy, runtime=runtime):
                completed = self.run_subprocess(
                    argv,
                    cwd=self.artifacts,
                    env=env,
                    stdout=log,
                    stderr=log,
                    universal_newlines=True,
                )
                self.assertEqual(completed.returncode, 0)

            with open(final_argv_path, 'r') as reader:
                final_argv = reader.read()

            if locales:
                self.assertIn("\0--generate-locales\0", final_argv)
            else:
                self.assertNotIn("\0--generate-locales\0", final_argv)

            if only_prepare:
                for var in FILESYSTEM_ENV_VARS:
                    if var.plural:
                        paths = os.environ[var.name].split(':')
                    else:
                        paths = [os.environ[var.name]]

                    if var.read_only:
                        bind_mode = 'ro-bind'
                    else:
                        bind_mode = 'bind'

                    for path in paths:
                        self.assertIn(
                            "\0--{}\0{}\0{}".format(bind_mode, path, path),
                            final_argv,
                        )

                if mock_emulator:
                    path = os.path.realpath(
                        os.path.join(
                            self.G_TEST_SRCDIR,
                            'mock-emulators'
                        )
                    )

                    # In practice we usually expect this to be in $HOME
                    if not path.startswith(('/usr', '/lib', '/var', '/run')):
                        self.assertIn(
                            "\0--ro-bind\0{}\0{}".format(path, path),
                            final_argv,
                        )

                    self.assertIn('\0--emulator=', final_argv)
                    self.assertIn('overrides/emulator.json\0', final_argv)

                if mock_emulator == 'env.json':
                    self.assertTrue(
                        final_argv.endswith(
                            '\0/run/host/usr/bin/env\0'
                        ),
                        '{!r} should end with /run/host/usr/bin/env'.format(
                            final_argv,
                        )
                    )
                elif mock_emulator == 'sh.json':
                    self.assertTrue(
                        final_argv.endswith(
                            '/pressure-vessel/mock-emulators/wrapper.sh\0'
                            '--main\0'
                            '--\0'
                        ),
                        '{!r} should end with wrapper.sh --main --'.format(
                            final_argv,
                        )
                    )

            if fake_home:
                members = set(os.listdir(fake_home_temp))

                self.assertIn('.cache', members)
                self.assertIn('.config', members)
                self.assertIn('.local', members)

            if copy:
                members = set(os.listdir(temp))

                self.assertIn('.ref', members)

                self.assertIn('donotdelete', members)
                self.assertIn('tmp-keep', members)
                self.assertIn('tmp-rlock', members)
                self.assertIn('tmp-wlock', members)
                if gc:
                    self.assertNotIn('tmp-deleteme', members)
                else:
                    # These would have been deleted if not for --no-gc-runtimes
                    self.assertIn('tmp-deleteme', members)

                members.discard('.ref')
                members.discard('donotdelete')
                members.discard('tmp-deleteme')
                members.discard('tmp-keep')
                members.discard('tmp-rlock')
                members.discard('tmp-wlock')
                # After discarding those, there should be exactly one left:
                # the one we just created
                self.assertEqual(len(members), 1)
                tree = os.path.join(temp, members.pop())

                with self.subTest('mutable sysroot'):
                    self._assert_mutable_sysroot(
                        tree,
                        artifacts,
                        is_scout=is_scout,
                        is_soldier=is_soldier,
                    )

        logger.info(
            'Time elapsed in %s: %.1f',
            test_name, time.time() - start_time,
        )

    def _assert_mutable_sysroot(
        self,
        tree: str,
        artifacts: str,
        *,
        is_scout: bool = False,
        is_soldier: bool = False
    ) -> None:
        with open(
            os.path.join(artifacts, 'contents.txt'),
            'w',
        ) as writer:
            self.run_subprocess([
                'find',
                '.',
                '-ls',
            ], cwd=tree, stderr=2, stdout=writer)

        self.assertDirectory(os.path.join(tree, 'bin'))
        self.assertDirectory(os.path.join(tree, 'etc'))
        self.assertDirectory(os.path.join(tree, 'lib'))
        self.assertDirectory(os.path.join(tree, 'usr'))
        self.assertNoFile(os.path.join(tree, 'usr', 'usr'))
        self.assertDirectory(os.path.join(tree, 'sbin'))

        target = self.assertSymlink(os.path.join(tree, 'overrides'))
        self.assertEqual(target, 'usr/lib/pressure-vessel/overrides')
        self.assertDirectory(os.path.join(tree, 'overrides', 'lib'))
        self.assertFile(
            os.path.join(
                tree, 'usr', 'lib', 'pressure-vessel', 'from-host',
                'libexec', 'steam-runtime-tools-0', 'pv-adverb',
            )
        )
        self.assertDirectory(
            os.path.join(
                tree, 'usr', 'lib', 'pressure-vessel', 'overrides', 'lib',
            )
        )

        for multiarch, arch_info in self.host_srsi_parsed.get(
            'architectures', {}
        ).items():
            overrides_libdir = os.path.join(
                tree, 'overrides', 'lib', multiarch,
            )
            root_libdir = os.path.join(
                tree, 'lib', multiarch,
            )
            usr_libdir = os.path.join(
                tree, 'usr', 'lib', multiarch,
            )
            host_root_libdir = os.path.join(
                '/', 'lib', multiarch,
            )
            host_usr_libdir = os.path.join(
                '/', 'usr', 'lib', multiarch,
            )

            if multiarch == 'i386-linux-gnu':
                libqualdir = os.path.join(tree, 'lib32')
                usr_libqualdir = os.path.join(tree, 'usr', 'lib32')
            elif multiarch == 'x86_64-linux-gnu':
                libqualdir = os.path.join(tree, 'lib64')
                usr_libqualdir = os.path.join(tree, 'usr', 'lib64')
            else:
                libqualdir = ''
                usr_libqualdir = ''

            with self.subTest(arch=multiarch):

                self.assertDirectory(overrides_libdir)
                self.assertDirectory(root_libdir)
                self.assertDirectory(usr_libdir)

                if is_scout:
                    for soname in (
                        'libBrokenLocale.so.1',
                        'libanl.so.1',
                        'libc.so.6',
                        'libdl.so.2',
                        'libm.so.6',
                        'libnsl.so.1',
                        'libnss_dns.so.2',
                        'libnss_files.so.2',
                        'libpthread.so.0',
                        'libresolv.so.2',
                        'librt.so.1',
                        'libutil.so.1',
                    ):
                        # These are from glibc, which is depended on by
                        # Mesa, and is at least as new as scout's version
                        # in every supported version of the Steam Runtime.
                        with self.subTest(soname=soname):
                            target = self.assertSymlink(
                                os.path.join(overrides_libdir, soname)
                            )
                            self.assertRegex(target, r'^/run/host/')

                            devlib = soname.split('.so.', 1)[0] + '.so'

                            # It was deleted from /lib, if present...
                            self.assertNoFile(
                                os.path.join(root_libdir, soname),
                            )
                            # ... and /usr/lib, if present...
                            self.assertNoFile(
                                os.path.join(usr_libdir, soname),
                            )
                            # ... and /libQUAL and /usr/libQUAL, if present
                            if libqualdir:
                                self.assertNoFile(
                                    os.path.join(libqualdir, soname),
                                )
                                self.assertNoFile(
                                    os.path.join(usr_libqualdir, soname),
                                )

                            # In most cases we expect the development
                            # symlink to be removed, too - but some of
                            # them are actually linker scripts or other
                            # non-ELF things
                            if soname not in (
                                'libc.so.6',
                                'libpthread.so.0',
                            ):
                                self.assertNoFile(
                                    os.path.join(usr_libdir, devlib),
                                )
                                self.assertNoFile(
                                    os.path.join(root_libdir, devlib),
                                )

                    for soname in (
                        # These are some examples of libraries in the
                        # graphics stack that we don't upgrade, so we
                        # expect the host version to be newer (or possibly
                        # absent if the host graphics stack doesn't use
                        # them, for example static linking or something).
                        'libXau.so.6',
                        'libdrm.so.2',
                    ):
                        with self.subTest(soname=soname):
                            for host_path in (
                                os.path.join(host_usr_libdir, soname),
                                os.path.join(host_root_libdir, soname),
                            ):
                                if os.path.exists(host_path):
                                    break
                            else:
                                # We didn't find /{,usr/}lib/MULTIARCH/SONAME,
                                # but in general we can't know whether that's
                                # because the host doesn't have it, or
                                # because the host uses a different library
                                # directory like /usr/lib{,32,64}.
                                # Make the weaker assertion that the library
                                # exists either in the runtime's /usr,
                                # or captured from the host.
                                self.assertTrue(
                                    os.path.exists(
                                        os.path.join(usr_libdir, soname)
                                    )
                                    or os.path.exists(
                                        os.path.join(root_libdir, soname)
                                    )
                                    or os.path.islink(
                                        os.path.join(overrides_libdir, soname)
                                    ),
                                    '{} should exist in container'
                                    ' or overrides'.format(
                                        soname,
                                    )
                                )
                                continue

                            # On multiarch systems like Debian,
                            # we can be confident that any library that
                            # can be found in the multiarch library directory
                            # is the one that we'll want to be using.
                            logger.info(
                                '%s found in host $LIB or /usr/$LIB at %s',
                                soname, host_path,
                            )

                            devlib = soname.split('.so.', 1)[0] + '.so'
                            logger.info('devlib: %s', devlib)
                            pattern = soname + '.*'

                            target = self.assertSymlink(
                                os.path.join(overrides_libdir, soname),
                                '{} found at {} so it should have been '
                                ' added to {}'.format(
                                    soname,
                                    host_path,
                                    overrides_libdir,
                                )
                            )
                            self.assertRegex(target, r'^/run/host/')

                            for libdir in (
                                root_libdir,
                                usr_libdir,
                            ):
                                for base in (soname, devlib):
                                    path = os.path.join(libdir, base)
                                    self.assertNoFile(
                                        path,
                                        '{} found at {} so it should have been'
                                        ' deleted from {}'.format(
                                            soname,
                                            host_path,
                                            path,
                                        ),
                                    )

                                self.assertEqual(
                                    glob.glob(os.path.join(libdir, pattern)),
                                    [],
                                )

                    for soname in (
                        'libSDL-1.2.so.0',
                        'libfltk.so.1.1',
                    ):
                        with self.subTest(soname=soname):
                            self.assertNoFile(
                                os.path.join(overrides_libdir, soname),
                            )

                self.assertGraphicsModulesOverrides(
                    modules=arch_info.get('dri_drivers', ()),
                    module_type='dri',
                    multiarch=multiarch,
                    overrides_libdir=overrides_libdir,
                )

                self.assertGraphicsModulesOverrides(
                    modules=arch_info.get('gbm_backends', ()),
                    module_type='gbm',
                    multiarch=multiarch,
                    overrides_libdir=overrides_libdir,
                )

                if is_scout:
                    if self.host_is_debian_derived:
                        link = os.path.join(
                            tree, 'usr', 'lib', multiarch, 'gconv',
                        )
                        target = self.assertSymlink(link)
                        self.assertEqual(
                            target,
                            '/run/host/usr/lib/{}/gconv'.format(multiarch),
                        )

                    if os.path.isdir('/usr/share/libdrm'):
                        link = os.path.join(
                            tree, 'usr', 'share', 'libdrm',
                        )
                        target = self.assertSymlink(link)
                        self.assertEqual(target, '/run/host/usr/share/libdrm')

        if is_scout:
            if os.path.isdir('/usr/lib/locale'):
                link = os.path.join(tree, 'usr', 'lib', 'locale')
                target = self.assertSymlink(link)
                self.assertEqual(target, '/run/host/usr/lib/locale')

            if os.path.isdir('/usr/share/i18n'):
                link = os.path.join(tree, 'usr', 'share', 'i18n')
                target = self.assertSymlink(link)
                self.assertEqual(target, '/run/host/usr/share/i18n')

            link = os.path.join(tree, 'sbin', 'ldconfig')
            target = self.assertSymlink(link)
            # Might not be /sbin/ldconfig, for example on non-Debian hosts
            self.assertRegex(target, r'^/run/host/')

            if os.path.isfile('/usr/bin/locale'):
                link = os.path.join(tree, 'usr', 'bin', 'locale')
                target = self.assertSymlink(link)
                # Might be either /usr/bin/locale or /usr/sbin/locale
                self.assertRegex(target, r'^/run/host/usr/')

            if os.path.isfile('/usr/bin/localedef'):
                link = os.path.join(tree, 'usr', 'bin', 'localedef')
                target = self.assertSymlink(link)
                # Might be either /usr/bin/localedef or /usr/sbin/localedef
                self.assertRegex(target, r'^/run/host/usr/')

            for ldso, scout_impl in (
                (
                    '/lib/ld-linux.so.2',
                    '/lib/i386-linux-gnu/ld-2.15.so',
                ),
                (
                    '/lib64/ld-linux-x86-64.so.2',
                    '/lib/x86_64-linux-gnu/ld-2.15.so',
                ),
            ):
                try:
                    host_path = os.path.realpath(ldso)
                except OSError:
                    pass
                else:
                    link = os.path.join(tree, './' + ldso)
                    target = self.assertSymlink(link)
                    self.assertEqual(target, '/run/host' + host_path)
                    link = os.path.join(tree, './' + scout_impl)
                    target = self.assertSymlink(link)
                    self.assertEqual(target, '/run/host' + host_path)


if __name__ == '__main__':
    assert sys.version_info >= (3, 4), \
        'Python 3.4+ is required'

# vi: set sw=4 sts=4 et:
