# Copyright 2020-2026 Collabora Ltd.
#
# SPDX-License-Identifier: MIT

import contextlib
import logging
import os
import stat
import subprocess
import sys
import tempfile
import unittest
import warnings

try:
    import typing
    from pathlib import Path
except ImportError:
    pass
else:
    Path        # placate pyflakes
    typing      # placate pyflakes

logger = logging.getLogger('testutils')


class MyCompletedProcess:
    """
    A minimal reimplementation of subprocess.CompletedProcess from
    Python 3.5+, so that some tests can be run on the Python 3.4
    interpreter in Debian 8 'jessie', SteamOS 2 'brewmaster' and
    Ubuntu 14.04 'trusty'.
    """

    def __init__(
        self,
        args='',                # type: typing.Union[typing.List[str], str]
        returncode=-1,          # type: int
        stdout=None,            # type: typing.Optional[bytes]
        stderr=None             # type: typing.Optional[bytes]
    ) -> None:
        self.args = args
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr

    def check_returncode(self) -> None:
        if self.returncode != 0:
            raise subprocess.CalledProcessError(
                self.returncode,
                str(self.args),
                output=self.stdout,
            )


def run_subprocess(
    args,           # type: typing.Union[typing.List[str], str]
    check=False,
    input=None,     # type: typing.Optional[bytes]
    timeout=None,   # type: typing.Optional[int]
    **kwargs        # type: typing.Any
):
    """
    This is basically a reimplementation of subprocess.run()
    from Python 3.5+, so that some tests can be run on the Python
    3.4 interpreter in Debian 8 'jessie', SteamOS 2 'brewmaster'
    and Ubuntu 14.04 'trusty'.
    """

    popen = subprocess.Popen(args, **kwargs)    # type: ignore

    with popen:
        out, err = popen.communicate(input=input, timeout=timeout)
        completed = MyCompletedProcess(
            args=args,
            returncode=popen.returncode,
            stdout=out,
            stderr=err,
        )

        if check:
            completed.check_returncode()

        return completed


class BaseTest(unittest.TestCase):
    """
    Base class with some useful test setup.
    """

    G_TEST_BUILDDIR = ''
    G_TEST_SRCDIR = ''
    artifacts_persist = False
    artifacts = ''
    tmpdir = None       # type: typing.Optional[tempfile.TemporaryDirectory]
    top_builddir = ''
    top_srcdir = ''
    deb_arch = ''
    is_aarch64 = False
    is_i386 = False
    is_x86 = False
    is_x86_64 = False

    #: If `run_inside_runtime` is true, we assume the tests are running
    #  inside a SLR container, with the host filesystem described by
    #  `modules` mounted in /run/host rather than at the root.
    #: If it's false, the tests are running on the host system.
    #: If it's None, we don't know yet.
    run_inside_runtime = None   # type: typing.Optional[bool]

    @staticmethod
    def getenv_tristate(
        variable,
    ):
        # type: (str) -> typing.Optional[bool]
        '''
        Interpret an environment variable as a tristate,
        returning a boolean if set, None if unset or empty.
        Unrecognised values are treated as unset, with a warning.
        '''

        value = os.getenv(variable, '')

        if value == '0':
            return False

        if value == '1':
            return True

        if value == '':
            return None

        warnings.warn(
            '${} should be unset, empty, 0 or 1, not {!r}'.format(
                variable, value,
            )
        )
        return None

    @classmethod
    def setUpClass(cls) -> None:
        cls.G_TEST_SRCDIR = os.getenv(
            'G_TEST_SRCDIR',
            os.path.abspath(os.path.dirname(__file__)),
        )
        cls.top_srcdir = os.getenv(
            'SRT_TEST_TOP_SRCDIR',
            os.path.abspath(os.path.dirname(os.path.dirname(__file__))),
        )
        cls.G_TEST_BUILDDIR = os.getenv(
            'G_TEST_BUILDDIR',
            os.path.abspath(
                os.path.join(os.path.dirname(__file__)),
            ),
        )
        cls.top_builddir = os.getenv(
            'SRT_TEST_TOP_BUILDDIR',
            os.path.abspath(os.path.dirname(os.path.dirname(__file__))),
        )

        cls.tmpdir = tempfile.TemporaryDirectory()

        artifacts = os.getenv('AUTOPKGTEST_ARTIFACTS')

        if artifacts is not None:
            cls.artifacts_persist = True
            cls.artifacts = os.path.join(
                os.path.abspath(artifacts),
                cls.__name__,
            )
        else:
            cls.artifacts_persist = False
            cls.artifacts = cls.tmpdir.name

        cpu = os.uname().machine

        if cpu == 'x86_64':
            cls.is_x86_64 = cls.is_x86 = True
            cls.deb_arch = 'amd64'
        elif cpu.startswith('i') and len(cpu) == 4 and cpu.endswith('86'):
            cls.is_i386 = cls.is_x86 = True
            cls.deb_arch = 'i386'
        elif cpu == 'aarch64':
            cls.is_aarch64 = True
            cls.deb_arch = 'arm64'
        else:
            # close enough
            cls.deb_arch = cpu

    def setUp(self) -> None:
        cls = self.__class__
        self.G_TEST_BUILDDIR = cls.G_TEST_BUILDDIR
        self.G_TEST_SRCDIR = cls.G_TEST_SRCDIR
        self.artifacts_persist = cls.artifacts_persist
        self.artifacts = cls.artifacts
        self.top_builddir = cls.top_builddir
        self.top_srcdir = cls.top_srcdir

        # host_is_debian_derived will be assigned by subclasses.
        #
        #: If true, the host is known to be a Debian-derived OS.
        #: If false, it isn't.
        #: If None, we don't know yet.
        self.host_is_debian_derived = None  # type: typing.Optional[bool]

        # Class and each test get separate temp directories
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)

        if 'PRESSURE_VESSEL_TEST_MEMCHECK' in os.environ:
            self.command_prefix = [
                'valgrind',
                '--child-silent-after-fork=yes',
                '--gen-suppressions=all',
                '--leak-check=full',
                '--leak-resolution=high',
                '--num-callers=20',
                '--tool=memcheck',
                '--verbose',
            ]

            for supp in (
                os.path.join(
                    self.top_srcdir, 'tests', 'pressure-vessel',
                    'pressure-vessel.supp',
                ),
                '/usr/share/glib-2.0/valgrind/glib.supp',
            ):
                if os.path.isfile(supp):
                    self.command_prefix.append(
                        '--suppressions=' + supp,
                    )
        else:
            self.command_prefix = []

    def assertFile(
        self,
        path,
        msg=None,
    ):
        # type: (typing.Union[Path, str], typing.Optional[str]) -> None
        '''
        Assert that `path` is a regular file, or a symlink to one.
        '''

        try:
            st_buf = os.stat(str(path))
        except OSError as e:
            # Fall through to raising an exception outside try/except,
            # to make the traceback shown by Python less verbose
            result = e      # type: typing.Any
        else:
            if stat.S_ISREG(st_buf.st_mode):
                # As expected it's a regular file, or a symlink to one
                return
            elif stat.S_ISDIR(st_buf.st_mode):
                result = 'Found a directory'
            else:
                # A fifo or device or something
                result = 'Found an unexpected type 0o%o' % st_buf.st_mode

        if isinstance(result, FileNotFoundError):
            # Could be either nonexistent or a dangling symlink
            try:
                result = 'Found a dangling symlink to {}'.format(
                    os.readlink(str(path))
                )
            except OSError:
                pass

        if not msg:
            msg = '{} should have been a regular file'.format(path)

        raise AssertionError('{}, but: {}'.format(msg, result))

    def assertDirectory(
        self,
        path,
        msg=None,
    ):
        # type: (typing.Union[Path, str], typing.Optional[str]) -> None
        '''
        Assert that `path` is a directory, or a symlink to one.
        '''

        try:
            st_buf = os.stat(str(path))
        except OSError as e:
            # Fall through to raising an exception outside try/except,
            # to make the traceback shown by Python less verbose
            result = e      # type: typing.Any
        else:
            if stat.S_ISDIR(st_buf.st_mode):
                # As expected it's a directory, or a symlink to directory
                return
            elif stat.S_ISREG(st_buf.st_mode):
                result = 'Found a regular file'
            else:
                # A fifo or device or something
                result = 'Found an unexpected type 0o%o' % st_buf.st_mode

        if isinstance(result, FileNotFoundError):
            # Could be either nonexistent or a dangling symlink
            try:
                result = 'Found a dangling symlink to {}'.format(
                    os.readlink(str(path))
                )
            except OSError:
                pass

        if not msg:
            msg = '{} should have been a directory'.format(path)

        raise AssertionError('{}, but: {}'.format(msg, result))

    def assertSymlink(
        self,
        path,
        msg=None,
    ):
        # type: (typing.Union[Path, str], typing.Optional[str]) -> str
        '''
        Assert that `path` is a symlink, returning its target.
        '''

        try:
            return os.readlink(str(path))
        except OSError as e:
            # Fall through to raising an exception outside try/except,
            # to make the traceback shown by Python less verbose
            result = e

        if not msg:
            msg = '{} should have been a symlink'.format(path)

        raise AssertionError('{}, but: {}'.format(msg, result))

    def assertNoFile(
        self,
        path,
        msg=None,
    ):
        # type: (typing.Union[Path, str], typing.Optional[str]) -> None
        '''
        Assert that `path` does not exist.
        If it does exist, the assertion message mentions the symlink
        target, if any.
        '''

        try:
            st_buf = os.lstat(str(path))
        except FileNotFoundError:
            # Good: it doesn't exist, as expected
            return
        except OSError as e:
            # Fall through to raising an exception outside try/except,
            # to make the traceback shown by Python less verbose
            result = e      # type: typing.Any
        else:
            if stat.S_ISDIR(st_buf.st_mode):
                result = 'Found a directory'
            elif stat.S_ISREG(st_buf.st_mode):
                result = 'Found a regular file'
            elif stat.S_ISLNK(st_buf.st_mode):
                # It's a symlink, try to report where it points
                try:
                    result = 'Found a symlink to {}'.format(
                        os.readlink(str(path)),
                    )
                except OSError as e:
                    result = e
            else:
                # It's a fifo or device or something (unexpected)
                result = 'Found an unexpected type 0o%o' % st_buf.st_mode

        if not msg:
            msg = '{} should not have existed'.format(path)

        raise AssertionError('{}, but: {}'.format(msg, result))

    def assertGraphicsModulesOverrides(
        self,
        modules,            # type: typing.Iterable[typing.Dict[str, str]]
        module_type,        # type: str
        multiarch,          # type: str
        overrides_libdir,   # type: str
    ):
        # type: (...) -> None
        '''
        Assert that the graphics modules `modules` of type `module_type`
        are represented as as expected as symlinks
        in the runtime `overrides` dir.

        `modules` is part of the steam-runtime-system-info report
        from the host system, a list of dicts with at least a
        library_path member.
        '''
        cls = self.__class__

        # Keys are the basename of a graphics module.
        # Values are lists of paths to graphics modules of that name
        # on the host. We assert that for each name, an arbitrary
        # one of the graphics modules of that name appears in the
        # container.
        expect_symlinks = {
        }    # type: typing.Dict[str, typing.List[str]]
        for module in modules:
            path = module['library_path']

            if path.startswith((    # any of:
                '/usr/lib/{}/'.format(module_type),
                '/usr/lib32/{}/'.format(module_type),
                '/usr/lib64/{}/'.format(module_type),
                '/usr/lib/{}/{}/'.format(multiarch, module_type),
            )) and not module.get('is_extra', False):
                # We don't make any assertion about the search
                # order here.

                if cls.run_inside_runtime:
                    host_path = '/run/host/' + path
                else:
                    host_path = path

                # Take the realpath() because `path` might be a symlink
                # itself, and it will be followed when creating links
                # in the `overrides/` dir inside the container.
                host_path = os.path.realpath(host_path)

                expect_symlinks.setdefault(
                    os.path.basename(host_path), []
                ).append(host_path)

        for k, vs in expect_symlinks.items():
            with self.subTest(modules_symlink=k):
                link = os.path.join(overrides_libdir, module_type, k)

                logger.info('Target of %s should be in %s', link, vs)
                target = self.assertSymlink(link)

                if not cls.run_inside_runtime:
                    self.assertEqual(target[:10], '/run/host/')
                    target = target[9:]     # includes the / after host/

                # Take the realpath() on non-Debian-derived hosts,
                # because on Arch Linux, we find modules in
                # /usr/lib64 that are physically in /usr/lib.
                # Be more strict on Debian because we know more
                # about the canonical paths there.
                if not self.host_is_debian_derived:
                    with contextlib.suppress(OSError):
                        target = os.path.realpath(target)

                self.assertIn(target, vs)

    def tearDown(self) -> None:
        pass

    @classmethod
    def tearDownClass(cls) -> None:
        assert cls.tmpdir is not None    # initialized in setUpClass
        cls.tmpdir.cleanup()


def tee_file_and_stderr(path: str) -> subprocess.Popen:
    """
    Return a context manager with a stdin attribute.
    Anything written to its stdin will be written to `path`
    and also to stderr.
    """
    return subprocess.Popen(
        ['tee', '--', path],
        stdin=subprocess.PIPE,
        stdout=2,
        stderr=2,
    )


def test_main():
    logging.basicConfig(level=logging.DEBUG)

    try:
        from tap.runner import TAPTestRunner
    except ImportError:
        TAPTestRunner = None    # type: ignore

    if TAPTestRunner is not None:
        runner = TAPTestRunner()
        runner.set_stream(True)
        unittest.main(testRunner=runner)
    else:
        print('1..1')
        program = unittest.main(exit=False)
        if program.result.wasSuccessful():
            print(
                'ok 1 - %r (tap module not available)'
                % program.result
            )
        else:
            print(
                'not ok 1 - %r (tap module not available)'
                % program.result
            )
            sys.exit(1)

# vi: set sw=4 sts=4 et:
