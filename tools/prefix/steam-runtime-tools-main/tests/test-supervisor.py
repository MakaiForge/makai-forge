#!/usr/bin/env python3
# Copyright 2020-2024 Collabora Ltd.
#
# SPDX-License-Identifier: MIT

import logging
import os
import shlex
import signal
import subprocess
import sys
import tempfile
import time


try:
    import typing
    typing      # placate pyflakes
except ImportError:
    pass

from testutils import (
    BaseTest,
    run_subprocess,
    test_main,
)


logger = logging.getLogger('test-supervisor')


LAUNCH_EX_FAILED = 125
LAUNCH_EX_USAGE = 125
LAUNCH_EX_CANNOT_INVOKE = 126
LAUNCH_EX_NOT_FOUND = 127
STDIN_FILENO = 0
STDOUT_FILENO = 1
STDERR_FILENO = 2


class TestSupervisor(BaseTest):
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

    def setUp(self) -> None:
        super().setUp()
        self.uname = os.uname()

        if 'SRT_TEST_UNINSTALLED' in os.environ:
            self.supervisor = self.command_prefix + [
                'env',
                os.path.join(
                    self.top_builddir,
                    'bin',
                    'steam-runtime-supervisor'
                ),
            ]
            self.needs_supervision = os.path.join(
                self.top_builddir,
                'tests',
                'needs-supervision',
            )
        else:
            self.skipTest('Not available as an installed-test')

    def test_enoent(self) -> None:
        proc = subprocess.Popen(
            self.supervisor + ['--', '/nonexistent'],
            stdout=STDERR_FILENO,
            stderr=STDERR_FILENO,
        )
        proc.wait()
        self.assertEqual(proc.returncode, LAUNCH_EX_NOT_FOUND)

    def test_enoexec(self) -> None:
        proc = subprocess.Popen(
            self.supervisor + ['--', '/dev/null'],
            stdout=STDERR_FILENO,
            stderr=STDERR_FILENO,
        )
        proc.wait()
        self.assertEqual(proc.returncode, LAUNCH_EX_CANNOT_INVOKE)

    def test_env(self) -> None:
        '''
        Exercise --env, --unset-env, --inherit-env[-matching], --verbose
        '''
        proc = subprocess.Popen(
            [
                'env',
                '-u', 'FOO',
                'BAR=wrong',
                'UNSET=wrong',
                'INHERIT=inherit',
                'WILDCARD=wildcard',
            ] + self.supervisor + [
                '--env=FOO=',
                '--env=BAR=bar',
                '--env=INHERIT=wrong',
                '--env=WILDCARD=wrong',
                '--inherit-env=INHERIT',
                '--inherit-env-matching=WILD*',
                '--unset-env=UNSET',
                '--verbose',
                '--',
                'sh', '-euc',
                '''
                echo FOO="${FOO-unset}"
                echo BAR="${BAR-unset}"
                echo INHERIT="${INHERIT-unset}"
                echo WILDCARD="${WILDCARD-unset}"
                echo UNSET="${UNSET-unset}"
                ''',
            ],
            stdout=subprocess.PIPE,
            stderr=STDERR_FILENO,
        )

        try:
            stdout = proc.stdout
            assert stdout is not None

            with stdout:
                self.assertEqual(
                    stdout.read().decode('utf-8'),
                    'FOO=\n'
                    'BAR=bar\n'
                    'INHERIT=inherit\n'
                    'WILDCARD=wildcard\n'
                    'UNSET=unset\n'
                )
        finally:
            proc.wait()
            self.assertEqual(proc.returncode, 0)

    def test_env_fd(self) -> None:
        '''Exercise --clear-env, --env-fd, -vv'''
        proc = subprocess.Popen(
            [
                'env',
                'FOO=wrong',
                'BAR=wrong',
                'UNSET=wrong',
                'INHERIT=inherit',
                'WILDCARD=wildcard',
            ] + self.supervisor + [
                '--clear-env',
                '--env-fd=%d' % STDIN_FILENO,
                '--inherit-env=INHERIT',
                '--inherit-env-matching=WILD*',
                '-v',
                '-v',
                '--',
                '/bin/sh', '-euc',
                '''
                echo FOO="${FOO-unset}"
                echo BAR="${BAR-unset}"
                echo INHERIT="${INHERIT-unset}"
                echo WILDCARD="${WILDCARD-unset}"
                echo UNSET="${UNSET-unset}"
                ''',
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=STDERR_FILENO,
        )

        try:
            stdin = proc.stdin
            assert stdin is not None

            with stdin:
                stdin.write(b'FOO=\0')
                stdin.write(b'BAR=bar\0')

            stdout = proc.stdout
            assert stdout is not None

            with stdout:
                self.assertEqual(
                    stdout.read().decode('utf-8'),
                    'FOO=\n'
                    'BAR=bar\n'
                    # --clear-env makes --inherit-env effectively equivalent
                    # to --unset-env, as documented
                    'INHERIT=unset\n'
                    'WILDCARD=unset\n'
                    'UNSET=unset\n'
                )
        finally:
            proc.wait()
            self.assertEqual(proc.returncode, 0)

    def test_fd_assign(self) -> None:
        for target in (STDOUT_FILENO, 9):
            read_end, write_end = os.pipe2(os.O_CLOEXEC)

            proc = subprocess.Popen(
                self.supervisor + [
                    '--assign-fd=%d=%d' % (target, write_end),
                    '--',
                    'sh', '-euc', 'echo hello >&%d' % target,
                ],
                pass_fds=[write_end],
                stdout=STDERR_FILENO,
                stderr=STDERR_FILENO,
            )

            try:
                os.close(write_end)

                with os.fdopen(read_end, 'rb') as reader:
                    self.assertEqual(reader.read(), b'hello\n')
            finally:
                proc.wait()
                self.assertEqual(proc.returncode, 0)

    def test_fd_hold(self) -> None:
        lock_fd, lock_name = tempfile.mkstemp()

        proc = subprocess.Popen(
            self.supervisor + [
                '--lock-fd=%d' % lock_fd,
                '--',
                'sh', '-euc',
                # The echo is to assert that the --lock-fd is not inherited
                # by the process being supervised
                'echo this will fail >&%d || true; cat' % lock_fd,
            ],
            pass_fds=[lock_fd],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=STDERR_FILENO,
        )

        try:
            os.close(lock_fd)

            # Until we let it terminate by closing stdin, the supervisor
            # process is still holding the lock open
            path = os.readlink('/proc/%d/fd/%d' % (proc.pid, lock_fd))
            self.assertEqual(
                os.path.realpath(path),
                os.path.realpath(lock_name),
            )

            stdin = proc.stdin
            assert stdin is not None
            stdin.write(b'from stdin')
            stdin.close()

            stdout = proc.stdout
            assert stdout is not None
            self.assertEqual(stdout.read(), b'from stdin')
            stdout.close()
        finally:
            proc.wait()
            self.assertEqual(proc.returncode, 0)

        with open(lock_name, 'rb') as reader:
            # The "echo hello" didn't write to the lock file
            self.assertEqual(reader.read(), b'')

        os.unlink(lock_name)

    def test_fd_passthrough_explicit(self) -> None:
        read_end, write_end = os.pipe2(os.O_CLOEXEC)
        read_end2, write_end2 = os.pipe2(os.O_CLOEXEC)

        proc = subprocess.Popen(
            self.supervisor + [
                '--close-fds',
                '--pass-fd=%d' % write_end,
                '--',
                'sh', '-euc',
                'echo cannot >&%d || true; echo hello >&%d' % (
                    write_end2, write_end,
                ),
            ],
            pass_fds=[write_end, write_end2],
            stdout=STDERR_FILENO,
            stderr=STDERR_FILENO,
        )

        try:
            os.close(write_end)
            os.close(write_end2)

            with os.fdopen(read_end, 'rb') as reader:
                self.assertEqual(reader.read(), b'hello\n')

            # write_end2 was not passed through the supervisor to the
            # shell, so 'cannot' was not written successfully
            with os.fdopen(read_end2, 'rb') as reader:
                self.assertEqual(reader.read(), b'')
        finally:
            proc.wait()
            self.assertEqual(proc.returncode, 0)

    def test_fd_passthrough_implicit(self) -> None:
        read_end, write_end = os.pipe2(os.O_CLOEXEC)

        proc = subprocess.Popen(
            self.supervisor + [
                '--',
                'sh', '-euc',
                'echo hello >&%d' % write_end,
            ],
            pass_fds=[write_end],
            stdout=STDERR_FILENO,
            stderr=STDERR_FILENO,
        )

        try:
            os.close(write_end)

            with os.fdopen(read_end, 'rb') as reader:
                self.assertEqual(reader.read(), b'hello\n')
        finally:
            proc.wait()
            self.assertEqual(proc.returncode, 0)

    def test_lock_file(self, verbose=False) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            read_end, write_end = os.pipe2(os.O_CLOEXEC)

            proc = subprocess.Popen(
                self.supervisor + [
                    '--lock-create',
                    '--lock-exclusive',
                    '--lock-file=%s/.ref' % tmpdir,
                    '--',
                    'sh', '-euc',
                    'exec >/dev/null; echo hello > %s/.ref' % (
                        shlex.quote(tmpdir),
                    ),
                ],
                stdin=read_end,
                stdout=subprocess.PIPE,
                stderr=STDERR_FILENO,
            )

            try:
                os.close(read_end)

                # By the time sh runs, pv-adverb should have taken the lock.
                # The sh process signals that it is running by closing stdout.
                stdout = proc.stdout
                assert stdout is not None
                self.assertEqual(stdout.read(), b'')
                stdout.close()

                extra_options = []

                if verbose:
                    extra_options.append('--lock-verbose')

                proc2 = subprocess.Popen(
                    self.supervisor + extra_options + [
                        '--lock-create',
                        '--lock-wait',
                        '--lock-exclusive',
                        '--lock-file=%s/.ref' % tmpdir,
                        '--',
                        'sh', '-euc',
                        'cat %s/.ref' % shlex.quote(tmpdir),
                    ],
                    stdout=subprocess.PIPE,
                    stderr=STDERR_FILENO,
                )

                # proc2 doesn't exit until proc releases the lock,
                # by which time .ref contains "hello\n"

                os.close(write_end)
                proc2.wait()
                self.assertEqual(proc2.returncode, 0)
                stdout = proc2.stdout
                assert stdout is not None
                self.assertEqual(stdout.read(), b'hello\n')
                stdout.close()
            finally:
                proc.wait()
                self.assertEqual(proc.returncode, 0)

    def test_lock_file_verbose(self) -> None:
        self.test_lock_file(verbose=True)

    def test_stdio_passthrough(self) -> None:
        proc = subprocess.Popen(
            self.supervisor + [
                '--',
                'sh', '-euc',
                '''
                if [ "$(cat)" != "hello, world!" ]; then
                    exit 1
                fi

                echo $$
                exec >/dev/null
                exec sleep infinity
                ''',
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=2,
        )
        pid = 0

        try:
            stdin = proc.stdin
            assert stdin is not None
            stdin.write(b'hello, world!')
            stdin.close()

            stdout = proc.stdout
            assert stdout is not None
            pid = int(stdout.read().decode('ascii').strip())
            stdout.close()
        finally:
            if pid:
                os.kill(pid, signal.SIGTERM)
            else:
                proc.terminate()

            self.assertIn(
                proc.wait(),
                (128 + signal.SIGTERM, -signal.SIGTERM),
            )

    def _test_terminate_when_signaled(
        self,
        options,                        # type: typing.List[str]
        send_signal,                    # type: int
        expect_sigterm=True,            # type: bool
        is_subreaper=None,              # type: typing.Optional[bool]
        kills_child=True,               # type: bool
        parent_exits_first=False,       # type: bool
        parent_ignores_sigterm=False,   # type: bool
        parent_killed_by=0,             # type: int
    ) -> None:
        '''
        Assert that with the given options,
        sending a terminating signal to the supervisor
        results in killing all other descendant processes
        and waiting for them to exit;
        or if kills_child is false, assert that this is not done.
        '''
        if parent_killed_by == 0:
            parent_killed_by = send_signal

        read_child_ready, write_child_ready = os.pipe2(os.O_CLOEXEC)
        read_child_sigterm, write_child_sigterm = os.pipe2(os.O_CLOEXEC)
        read_child_stdin, write_child_stdin = os.pipe2(os.O_CLOEXEC)
        read_child_stdout, write_child_stdout = os.pipe2(os.O_CLOEXEC)
        read_parent_ready, write_parent_ready = os.pipe2(os.O_CLOEXEC)
        read_parent_sigterm, write_parent_sigterm = os.pipe2(os.O_CLOEXEC)

        if parent_ignores_sigterm:
            helper_options = ['--parent-ignore-sigterm']
        else:
            helper_options = []

        proc = subprocess.Popen(
            self.supervisor + options + [
                '--pass-fd=%d' % read_child_stdin,
                '--pass-fd=%d' % write_child_ready,
                '--pass-fd=%d' % write_child_sigterm,
                '--pass-fd=%d' % write_child_stdout,
                '--pass-fd=%d' % write_parent_ready,
                '--pass-fd=%d' % write_parent_sigterm,
                '--',
                self.needs_supervision,
                '--child-report-ready=%d' % write_child_ready,
                '--child-report-sigterm=%d' % write_child_sigterm,
                '--child-stdin=%d' % read_child_stdin,
                '--child-stdout=%d' % write_child_stdout,
                '--parent-report-ready=%d' % write_parent_ready,
                '--parent-report-sigterm=%d' % write_parent_sigterm,
            ] + helper_options,
            pass_fds=[
                read_child_stdin,
                write_child_ready,
                write_child_sigterm,
                write_child_stdout,
                write_parent_ready,
                write_parent_sigterm,
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=2,
        )

        with proc:
            # Close the ends of the pipes that the child inherited
            os.close(read_child_stdin)
            os.close(write_child_ready)
            os.close(write_child_sigterm)
            os.close(write_child_stdout)
            os.close(write_parent_ready)
            os.close(write_parent_sigterm)

            # Wait for both parent and child to set up their SIGTERM
            # handlers.
            with open(read_child_ready, 'rb') as reader:
                self.assertEqual(b'Child ready\n', reader.read())

            with open(read_parent_ready, 'rb') as reader:
                self.assertEqual(b'Parent ready\n', reader.read())

            # If desired in this test scenario, close the parent process's
            # stdin, allowing it to exit
            if parent_exits_first:
                parent_stdin = proc.stdin
                assert parent_stdin is not None
                parent_stdin.close()

                # Wait for EOF on stdout, which is how the helper executable
                # tells us that its child is ready for testing.
                parent_stdout = proc.stdout
                assert parent_stdout is not None

                with parent_stdout as reader:
                    self.assertEqual(b'', reader.read())

            # If parent_exits_first, the parent has now exited,
            # but we can't be 100% sure whether the supervisor will have
            # detected that before we send the signal to the supervisor.
            # Wait a moment to maximize the supervisor's chance to win
            # the race, so that we're testing what we intend to test.
            time.sleep(0.1)

            # Send SIGINT or SIGTERM to the supervisor
            proc.send_signal(send_signal)

            with open(read_parent_sigterm, 'rb') as reader:
                out = reader.read()

            if expect_sigterm:
                if parent_exits_first:
                    self.assertEqual(b'', out)
                else:
                    self.assertEqual(b'Parent received SIGTERM\n', out)
            else:
                self.assertEqual(b'', out)

            if kills_child:
                # The supervisor exits after both the parent and child
                # have exited.
                proc.wait(timeout=10)

                # The child process also gets SIGTERM, unless our settings
                # make us only send SIGKILL.
                with open(read_child_sigterm, 'rb') as reader:
                    out = reader.read()

                if expect_sigterm:
                    self.assertEqual(b'Child received SIGTERM\n', out)
                else:
                    self.assertEqual(b'', out)

                # Because the child was killed, its stdout reaches EOF,
                # even before we close its stdin.
                with open(read_child_stdout, 'rb') as reader:
                    self.assertEqual(b'', reader.read())

                os.close(write_child_stdin)
            else:
                # If the supervisor is known not to be a subreaper,
                # then the supervisor will exit already,
                # even though the child is still running
                if is_subreaper is not None and not is_subreaper:
                    proc.wait(timeout=10)

                # The child process is still running afterwards,
                # and did not receive SIGTERM. We can prove this
                # by communicating with it.

                with open(write_child_stdin, 'wb') as writer:
                    writer.write(b'hello, world!\n')

                with open(read_child_stdout, 'rb') as reader:
                    output = reader.read()

                self.assertEqual(output, b'hello, world!\n')

                with open(read_child_sigterm, 'rb') as reader:
                    self.assertEqual(b'', reader.read())

                # If the supervisor is a subreaper, it will only exit
                # after we have allowed the child to exit
                if is_subreaper or is_subreaper is None:
                    proc.wait(timeout=10)

            # Now that all code paths have reached a point where the
            # supervisor should have exited, we can check its exit status
            self.assertIsNotNone(proc.returncode)

            if parent_killed_by == signal.SIGTERM:
                if parent_exits_first:
                    # We can't be 100% sure of the order of events here:
                    # the supervisor's exit status might reflect the
                    # parent's exit status, or the supervisor might, itself,
                    # get killed by SIGTERM after the parent already exited.
                    self.assertIn(
                        proc.returncode,
                        (0, -signal.SIGTERM),
                    )
                else:
                    # The parent received SIGTERM, and responds by exiting
                    # with exit status equal to SIGTERM.
                    # The supervisor should have detected this
                    # and should report it.
                    self.assertEqual(proc.returncode, signal.SIGTERM)
            else:
                if parent_exits_first:
                    # Logic similar to above: the supervisor's exit status
                    # might reflect the parent's exit status, or the
                    # supervisor might be killed by e.g. SIGINT after the
                    # parent already exited.
                    self.assertIn(
                        proc.returncode,
                        (0, -parent_killed_by),
                    )
                else:
                    # The supervisor's exit status should reflect a
                    # shell-style encoding of the signal that it saw
                    # the parent terminated by.
                    self.assertEqual(proc.returncode, 128 + parent_killed_by)

    def test_terminate_when_signaled(self) -> None:
        self._test_terminate_when_signaled(
            ['--terminate-when-signaled'],
            signal.SIGTERM,
            expect_sigterm=True,
            is_subreaper=True,
            kills_child=True,
        )
        # SIGINT to supervisor sends SIGTERM to main process,
        # because --terminate-when-signaled takes precedence over
        # --forward-signals
        self._test_terminate_when_signaled(
            ['--terminate-when-signaled'],
            signal.SIGINT,
            expect_sigterm=True,
            is_subreaper=True,
            kills_child=True,
            parent_killed_by=signal.SIGTERM,
        )
        # We send SIGKILL immediately, if told to do so
        self._test_terminate_when_signaled(
            ['--terminate-when-signaled', '--terminate-timeout=0.0'],
            signal.SIGTERM,
            expect_sigterm=False,
            is_subreaper=True,
            kills_child=True,
            parent_killed_by=signal.SIGKILL,
        )
        # If the parent already exited, we still send the signals to its
        # child processes.
        # Allow 100ms for the parent to exit, so that we're reasonably
        # likely to be testing the code path that we intend to be,
        # but without delaying testing too much.
        self._test_terminate_when_signaled(
            ['--terminate-when-signaled', '--terminate-idle-timeout=0.1'],
            signal.SIGINT,
            expect_sigterm=True,
            is_subreaper=True,
            kills_child=True,
            parent_exits_first=True,
            parent_killed_by=signal.SIGTERM,
        )
        # If we use --terminate-with-main then there are two reasons why
        # terminating the parent would terminate the child
        self._test_terminate_when_signaled(
            ['--terminate-when-signaled', '--terminate-with-main'],
            signal.SIGTERM,
            expect_sigterm=True,
            is_subreaper=True,
            kills_child=True,
        )
        # SIGHUP to supervisor sends SIGHUP to main process,
        # but this isn't forwarded to child processes.
        # SIGUSR1, SIGUSR2 are the same (not tested here)
        self._test_terminate_when_signaled(
            ['--terminate-when-signaled'],
            signal.SIGHUP,
            expect_sigterm=False,
            kills_child=False,
            is_subreaper=True,
        )

    def test_no_terminate_when_signaled_by_default(self) -> None:
        # SIGINT to supervisor sends SIGINT to main process,
        # but by default no signals are sent to its child processes
        self._test_terminate_when_signaled(
            [],
            signal.SIGINT,
            expect_sigterm=False,
            is_subreaper=False,
            kills_child=False,
        )
        # SIGTERM to supervisor sends SIGTERM to main process,
        # but is otherwise the same
        self._test_terminate_when_signaled(
            [],
            signal.SIGTERM,
            expect_sigterm=True,
            is_subreaper=False,
            kills_child=False,
        )
        # If we're a subreaper, the only difference is that we wait for
        # the child to exit, too
        self._test_terminate_when_signaled(
            ['--subreaper'],
            signal.SIGTERM,
            expect_sigterm=True,
            is_subreaper=True,
            kills_child=False,
        )
        # If the parent exited first, we still don't send the signal to
        # its children
        self._test_terminate_when_signaled(
            ['--subreaper'],
            signal.SIGINT,
            expect_sigterm=False,
            is_subreaper=True,
            kills_child=False,
            parent_exits_first=True,
        )
        # If we use --terminate-with-main then terminating the parent
        # indirectly causes termination of the child
        self._test_terminate_when_signaled(
            ['--terminate-with-main'],
            signal.SIGTERM,
            expect_sigterm=True,
            is_subreaper=True,
            kills_child=True,
        )

    def test_no_terminate_when_signaled_explicitly(self) -> None:
        self._test_terminate_when_signaled(
            ['--no-terminate-when-signaled', '--subreaper'],
            signal.SIGINT,
            expect_sigterm=False,
            is_subreaper=True,
            kills_child=False,
        )
        self._test_terminate_when_signaled(
            ['--no-terminate-when-signaled'],
            signal.SIGTERM,
            expect_sigterm=True,
            is_subreaper=False,
            kills_child=False,
        )
        self._test_terminate_when_signaled(
            ['--no-terminate-when-signaled', '--subreaper'],
            signal.SIGTERM,
            expect_sigterm=True,
            is_subreaper=True,
            kills_child=False,
        )
        self._test_terminate_when_signaled(
            ['--no-terminate-when-signaled', '--subreaper'],
            signal.SIGTERM,
            expect_sigterm=True,
            is_subreaper=True,
            kills_child=False,
            parent_exits_first=True,
        )
        # If we use --terminate-with-main then terminating the parent
        # indirectly causes termination of the child
        self._test_terminate_when_signaled(
            ['--no-terminate-when-signaled', '--terminate-with-main'],
            signal.SIGTERM,
            expect_sigterm=True,
            is_subreaper=True,
            kills_child=True,
        )

    def _test_terminate_with_main(
        self,
        options=[],             # type: typing.List[str]
        is_subreaper=None,      # type: typing.Optional[bool]
        kills_child=False,      # type: bool
    ) -> None:
        '''
        Assert that with the given options,
        the death of the main process (the immediate child of the supervisor)
        does or does not result in killing all other descendant processes
        and waiting for them to exit.
        '''
        read_child_stdin, write_child_stdin = os.pipe2(os.O_CLOEXEC)
        read_child_stdout, write_child_stdout = os.pipe2(os.O_CLOEXEC)
        read_child_ready, write_child_ready = os.pipe2(os.O_CLOEXEC)
        read_child_sigterm, write_child_sigterm = os.pipe2(os.O_CLOEXEC)
        read_parent_ready, write_parent_ready = os.pipe2(os.O_CLOEXEC)

        proc = subprocess.Popen(
            self.supervisor + options + [
                '--pass-fd=%d' % read_child_stdin,
                '--pass-fd=%d' % write_child_ready,
                '--pass-fd=%d' % write_child_sigterm,
                '--pass-fd=%d' % write_child_stdout,
                '--pass-fd=%d' % write_parent_ready,
                '--',
                self.needs_supervision,
                '--child-report-ready=%d' % write_child_ready,
                '--child-report-sigterm=%d' % write_child_sigterm,
                '--child-stdin=%d' % read_child_stdin,
                '--child-stdout=%d' % write_child_stdout,
                '--parent-report-ready=%d' % write_parent_ready,
            ],
            pass_fds=[
                read_child_stdin,
                write_child_ready,
                write_child_sigterm,
                write_child_stdout,
                write_parent_ready,
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=2,
        )

        with proc:
            # Close the ends of the pipes that the child inherited
            os.close(read_child_stdin)
            os.close(write_child_ready)
            os.close(write_child_sigterm)
            os.close(write_child_stdout)
            os.close(write_parent_ready)

            # Wait for both parent and child to set up their SIGTERM
            # handlers.
            with open(read_child_ready, 'rb') as reader:
                self.assertEqual(b'Child ready\n', reader.read())

            with open(read_parent_ready, 'rb') as reader:
                self.assertEqual(b'Parent ready\n', reader.read())

            # Close the parent process's stdin, allowing it to exit
            stdin = proc.stdin
            assert stdin is not None
            stdin.close()

            # The parent process closes stdout and exits
            stdout = proc.stdout
            assert stdout is not None
            output = stdout.read()
            self.assertEqual(output, b'')

            # If the supervisor is known not to be a subreaper,
            # then the supervisor will exit already
            if (
                kills_child
                or (is_subreaper is not None and not is_subreaper)
            ):
                self.assertEqual(proc.wait(), 0)

            if kills_child:
                # The helper's child process gets signalled after the
                # parent dies.
                with open(read_child_sigterm, 'rb') as reader:
                    self.assertEqual(
                        b'Child received SIGTERM\n',
                        reader.read(),
                    )

                with open(read_child_stdout, 'rb') as reader:
                    self.assertEqual(b'', reader.read())

                os.close(write_child_stdin)
            else:
                # The child process is still running afterwards,
                # and we can prove it by continuing to communicate with it.
                with open(write_child_stdin, 'wb') as writer:
                    writer.write(b'hello, world!\n')

                with open(read_child_stdout, 'rb') as reader:
                    output = reader.read()

                self.assertEqual(output, b'hello, world!\n')

                # If the supervisor is a subreaper, it will only exit
                # after we have allowed the child to exit
                if is_subreaper or is_subreaper is None:
                    self.assertEqual(proc.wait(), 0)

                # The child didn't receive SIGTERM
                with open(read_child_sigterm, 'rb') as reader:
                    self.assertEqual(b'', reader.read())

    def test_terminate_timeout_implicitly_with_main(self):
        # In older versions, --terminate-timeout implied that we want to
        # clean up any strays after the main process has exited.
        # This is now deprecated.
        self._test_terminate_with_main(
            ['--terminate-timeout=2.0'],
            is_subreaper=True,
            kills_child=True,
        )

    def test_terminate_with_main(self):
        self._test_terminate_with_main(
            ['--terminate-with-main'],
            is_subreaper=True,
            kills_child=True,
        )
        self._test_terminate_with_main(
            [
                '--terminate-with-main',
                '--terminate-timeout=2.0',
            ],
            is_subreaper=True,
            kills_child=True,
        )

    def test_no_terminate_with_main_by_default(self):
        self._test_terminate_with_main(
            [],
            is_subreaper=False,
            kills_child=False,
        )
        self._test_terminate_with_main(
            ['--subreaper'],
            is_subreaper=True,
            kills_child=False,
        )

    def test_no_terminate_with_main_explicitly(self):
        self._test_terminate_with_main(
            ['--no-terminate-with-main'],
            is_subreaper=False,
            kills_child=False,
        )
        self._test_terminate_with_main(
            ['--no-terminate-with-main', '--subreaper'],
            is_subreaper=True,
            kills_child=False,
        )
        # --terminate-timeout doesn't imply --terminate-with-main
        # if --no-terminate-with-main is explicitly used
        self._test_terminate_with_main(
            [
                '--no-terminate-with-main',
                '--terminate-timeout=2.0',
            ],
            is_subreaper=False,
            kills_child=False,
        )
        self._test_terminate_with_main(
            [
                '--no-terminate-with-main',
                '--subreaper',
                '--terminate-timeout=2.0',
            ],
            is_subreaper=True,
            kills_child=False,
        )

    def test_wrong_options(self) -> None:
        for option in (
            '--an-unknown-option',
            '--env=FOO',
            '--env==bar',
            '--env-fd=-1',
            '--env-fd=23',
            '--lock-fd=-1',
            '--lock-fd=23',
            '--lock-fd=nope',
            '--pass-fd=-1',
            '--pass-fd=23',
            '--pass-fd=nope',
            '--assign-fd=-1',
            '--assign-fd=nope',
            '--assign-fd=2',
            '--assign-fd=2=-1',
            '--assign-fd=2=23',
        ):
            proc = subprocess.Popen(
                self.supervisor + [
                    option,
                    '--',
                    'sh', '-euc', 'exit 42',
                ],
                stdout=STDERR_FILENO,
                stderr=STDERR_FILENO,
            )
            proc.wait()
            self.assertEqual(LAUNCH_EX_USAGE, LAUNCH_EX_FAILED)
            self.assertEqual(proc.returncode, LAUNCH_EX_FAILED)

    def tearDown(self) -> None:
        super().tearDown()


if __name__ == '__main__':
    assert sys.version_info >= (3, 4), \
        'Python 3.4+ is required'

    test_main()

# vi: set sw=4 sts=4 et:
