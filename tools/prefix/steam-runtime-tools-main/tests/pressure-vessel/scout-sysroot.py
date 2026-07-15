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


logger = logging.getLogger('test-scout-sysroot')


class TestScoutSysroot(BaseContainersTest):
    runtime_is_sdk = True

    def test_scout_sysroot(self) -> None:
        scout = os.path.join(self.containers_dir, 'scout_sysroot')

        with self.subTest('only-prepare'):
            self._test_scout(
                'only-prepare', scout,
                copy=True, only_prepare=True,
            )

        with self.subTest('copy'):
            self._test_scout('copy', scout, copy=True, gc=False)

        with self.subTest('fake-home'):
            self._test_scout('fake-home', scout, copy=True, fake_home=True)

        with self.subTest('transient'):
            self._test_scout('transient', scout, locales=True)

    def test_scout_sysroot_usrmerge(self) -> None:
        scout = os.path.join(self.containers_dir, 'scout_sysroot_usrmerge')

        with self.subTest('only-prepare'):
            self._test_scout(
                'usrmerge-only-prepare', scout,
                copy=True, only_prepare=True,
            )

        with self.subTest('copy'):
            self._test_scout(
                'usrmerge-copy', scout,
                copy=True, gc=False,
            )

        with self.subTest('fake-home'):
            self._test_scout(
                'usrmerge-fake-home', scout, copy=True, fake_home=True,
            )

        with self.subTest('transient'):
            self._test_scout('usrmerge-transient', scout, locales=True)


if __name__ == '__main__':
    assert sys.version_info >= (3, 4), \
        'Python 3.4+ is required'

    test_main()

# vi: set sw=4 sts=4 et:
