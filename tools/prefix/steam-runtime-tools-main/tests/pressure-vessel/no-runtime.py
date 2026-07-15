#!/usr/bin/env python3
# Copyright 2020-2026 Collabora Ltd.
# SPDX-License-Identifier: MIT

"""
See tests/pressure-vessel/containers.py
"""

import contextlib
import logging
import os
import sys

try:
    import typing
    typing      # placate pyflakes
except ImportError:
    pass

from containers import BaseContainersTest
from testutils import test_main


logger = logging.getLogger('test-no-runtime')


class TestNoRuntime(BaseContainersTest):
    def test_no_runtime(self) -> None:
        if self.bwrap is None:
            self.skipTest('Unable to run bwrap (in a container?)')

        artifacts = os.path.join(
            self.artifacts,
            'no-runtime',
        )
        os.makedirs(artifacts, exist_ok=True)

        final_argv_path = os.path.join(
            self.artifacts,
            'no-runtime',
            'final-argv',
        )

        argv = [
            self.pv_wrap,
            '--verbose',
            '--write-final-argv', final_argv_path,
        ]

        var = os.path.join(self.containers_dir, 'var')
        os.makedirs(var, exist_ok=True)

        with contextlib.ExitStack() as stack:
            writer = stack.enter_context(
                open(os.path.join(artifacts, 'srsi.json'), 'w'),
            )

            if not self.artifacts_persist:
                log = sys.stderr        # type: typing.TextIO
            else:
                log_path = os.path.join(artifacts, 'srsi.log')
                logger.info('Writing s-r-s-i diagnostics to %s', log_path)
                log = stack.enter_context(open(log_path, 'w'))

            completed = self.run_subprocess(
                argv + [
                    '--',
                    'env',
                    'LD_BIND_NOW=1',
                    self.host_srsi or 'true',
                    '--verbose',
                ],
                cwd=artifacts,
                stdout=writer,
                stderr=log,
                universal_newlines=True,
            )

        self.assertEqual(completed.returncode, 0)


if __name__ == '__main__':
    assert sys.version_info >= (3, 4), \
        'Python 3.4+ is required'

    test_main()

# vi: set sw=4 sts=4 et:
