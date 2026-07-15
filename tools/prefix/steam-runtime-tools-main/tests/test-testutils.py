#!/usr/bin/env python3
# Copyright 2026 Collabora Ltd.
# SPDX-License-Identifier: MIT

import logging
import tempfile
from pathlib import Path

from testutils import (
    BaseTest,
    test_main,
)


logger = logging.getLogger('test-testutils')


class TestTestUtils(BaseTest):
    def test_filesystem_assertions(self) -> None:
        self.assertFile('/usr/bin/env')
        self.assertFile(Path('/usr/bin/env'))

        with self.assertRaises(AssertionError) as catcher:
            self.assertDirectory('/usr/bin/env')

        logger.info(
            'After asserting file is directory: %s',
            catcher.exception,
        )

        with self.assertRaises(AssertionError) as catcher:
            self.assertNoFile('/usr/bin/env')

        logger.info(
            'After asserting file does not exist: %s',
            catcher.exception,
        )

        self.assertDirectory('/usr/bin')
        self.assertDirectory(Path('/usr/bin'))

        with self.assertRaises(AssertionError) as catcher:
            self.assertFile('/usr/bin')

        logger.info(
            'After asserting directory is file: %s',
            catcher.exception,
        )

        with self.assertRaises(AssertionError) as catcher:
            self.assertNoFile('/usr/bin')

        logger.info(
            'After asserting directory does not exist: %s',
            catcher.exception,
        )

        with tempfile.TemporaryDirectory() as tmp:
            symlink = Path(tmp) / 'null'
            symlink.symlink_to('/dev/null')

            self.assertSymlink(str(symlink))
            self.assertSymlink(symlink)

            with self.assertRaises(AssertionError) as catcher:
                self.assertNoFile(symlink)

            logger.info(
                'After asserting symlink does not exist: %s',
                catcher.exception,
            )

            nope = Path(tmp) / 'nope'

            self.assertNoFile(str(nope))
            self.assertNoFile(nope)

            with self.assertRaises(AssertionError) as catcher:
                self.assertFile(nope)

            logger.info(
                'After asserting nonexistent file is file: %s',
                catcher.exception,
            )

            with self.assertRaises(AssertionError) as catcher:
                self.assertDirectory(nope)

            logger.info(
                'After asserting nonexistent file is directory: %s',
                catcher.exception,
            )

            with self.assertRaises(AssertionError) as catcher:
                self.assertSymlink(nope)

            logger.info(
                'After asserting nonexistent file is symlink: %s',
                catcher.exception,
            )

            dangling = Path(tmp) / 'dangling'
            dangling.symlink_to('nope')

            self.assertSymlink(str(dangling))
            self.assertSymlink(dangling)

            with self.assertRaises(AssertionError) as catcher:
                self.assertNoFile(dangling)

            logger.info(
                'After asserting dangling symlink does not exist: %s',
                catcher.exception,
            )

            with self.assertRaises(AssertionError) as catcher:
                self.assertFile(dangling)

            logger.info(
                'After asserting dangling symlink is file: %s',
                catcher.exception,
            )

            with self.assertRaises(AssertionError) as catcher:
                self.assertDirectory(dangling)

            logger.info(
                'After asserting dangling symlink is directory: %s',
                catcher.exception,
            )


if __name__ == '__main__':
    test_main()

# vi: set sw=4 sts=4 et:
