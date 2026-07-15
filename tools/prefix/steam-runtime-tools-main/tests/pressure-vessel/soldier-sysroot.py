#!/usr/bin/env python3
# Copyright 2020-2026 Collabora Ltd.
# SPDX-License-Identifier: MIT

"""
See tests/pressure-vessel/containers.py
"""

import logging
import os
import sys

from containers import BaseContainersTest
from testutils import test_main


logger = logging.getLogger('test-soldier-sysroot')


class TestSoldierSysroot(BaseContainersTest):
    runtime_is_sdk = True

    def test_soldier_sysroot(self) -> None:
        soldier = os.path.join(self.containers_dir, 'soldier_sysroot')

        with self.subTest('only-prepare'):
            self._test_soldier(
                'only-prepare', soldier,
                copy=True, only_prepare=True,
            )

        with self.subTest('copy'):
            self._test_soldier(
                'copy', soldier, copy=True, gc=False,
            )

        with self.subTest('transient'):
            self._test_soldier('transient', soldier, locales=True)


if __name__ == '__main__':
    assert sys.version_info >= (3, 4), \
        'Python 3.4+ is required'

    test_main()

# vi: set sw=4 sts=4 et:
