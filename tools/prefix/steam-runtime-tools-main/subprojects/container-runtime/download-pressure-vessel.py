#!/usr/bin/env python3
# Copyright © 2019-2026 Collabora Ltd.
# SPDX-License-Identifier: MIT

"""
Download a chosen pressure-vessel version.
"""

import argparse
import logging
import os
import shlex
import shutil
import subprocess
import urllib
import urllib.error
import urllib.parse
import urllib.request
from pathlib import (Path, PurePosixPath)
from typing import (Any, Sequence)


logger = logging.getLogger('download-pressure-vessel')


DEFAULT_PRESSURE_VESSEL_URI = (
    'https://repo.steampowered.com/pressure-vessel/snapshots'
)


class InvocationError(Exception):
    pass


class PressureVesselRelease:
    @staticmethod
    def check_valid_version(v: str) -> None:
        # This is the same rule used to validate Steam Runtime version numbers
        if not v or not v[0].isdigit():
            raise ValueError(
                f'PV version {v!r} does not start with a digit'
            )

        for c in v:
            if c != '.' and not c.isalnum():
                raise ValueError(
                    f'PV version {v!r} contains non-dot, non-alnum'
                )

            if ord(c) >= 128:
                raise ValueError(f'PV version {v!r} contains non-ASCII')

    @staticmethod
    def check_valid_alias(a: str) -> None:
        # This is the same rule used to validate Steam Runtime aliases,
        # although in practice we're unlikely to create aliases other
        # than 'latest' for pressure-vessel
        if not a or not a[0].isalpha():
            raise ValueError(
                f'PV alias {a!r} does not start with a letter'
            )

        for c in a:
            if c != '-' and not c.isalnum():
                raise ValueError(
                    f'PV alias {a!r} contains non-dash, non-alnum'
                )

            if ord(c) >= 128:
                raise ValueError(f'PV alias {a!r} contains non-ASCII')

    def __init__(
        self,
        *,
        cache: str | os.PathLike = '',
        ssh_host: str = '',
        ssh_path: str | os.PathLike = '',
        uri: str = DEFAULT_PRESSURE_VESSEL_URI,
        version: str = ''
    ) -> None:
        self.cache = Path(cache)
        self.pinned_version: str | None = None
        self.ssh_host = ssh_host
        self.ssh_path: PurePosixPath | None = None
        self.uri = uri

        if version:
            if version[0].isdigit():
                self.check_valid_version(version)
            else:
                self.check_valid_alias(version)

        self.version = version

        if ssh_path:
            self.ssh_path = PurePosixPath(ssh_path)

    def get_uri(
        self,
        filename: str,
        suffix: str = '',
        version: str | None = None,
    ) -> str:
        uri = self.uri
        v = version or self.pinned_version or self.version or 'latest'

        if filename:
            return f'{uri}/{v}/{filename}{suffix}'
        else:
            return f'{uri}/{v}{suffix}'

    def get_ssh_path(
        self,
        filename: str,
        suffix: str = '',
        version: str | None = None,
    ) -> str:
        ssh_host = self.ssh_host
        ssh_path = self.ssh_path
        v = version or self.pinned_version or self.version or 'latest'

        if not ssh_host or ssh_path is None:
            raise RuntimeError('ssh host/path not configured')

        if filename:
            return f'{ssh_path}/{v}/{filename}{suffix}'
        else:
            return f'{ssh_path}/{v}{suffix}'

    def fetch(
        self,
        filename: str,
        opener: urllib.request.OpenerDirector,
        dest: Path | None = None,
        version: str | None = None,
    ) -> Path:
        assert filename

        if dest is None:
            dest = self.cache / filename

        if self.ssh_host and self.ssh_path is not None:
            path = self.get_ssh_path(filename)
            logger.info('Downloading %r...', path)
            subprocess.run(
                [
                    'rsync',
                    '--archive',
                    '--partial',
                    '--progress',
                    f'{self.ssh_host}:{path}',
                    str(dest),
                ],
                check=True,
            )
        else:
            uri = self.get_uri(filename)
            logger.info('Downloading %r...', uri)
            new = Path(str(dest) + '.new')

            with opener.open(uri) as response:
                with open(new, 'wb') as writer:
                    shutil.copyfileobj(response, writer)

                new.replace(dest)

        return dest

    def pin_version(
        self,
        opener: urllib.request.OpenerDirector,
    ) -> str:
        pinned = self.pinned_version

        if pinned is None:
            v = self.version or 'latest'

            if v[0].isdigit():
                # We already have a concrete version number, use it as-is
                self.check_valid_version(v)
                self.pinned_version = v
                return v

            try:
                # First try e.g. pressure-vessel/snapshots/latest.txt
                pinned = self.__pin_version_internal(
                    suffix='.txt',
                    opener=opener,
                )
            except (
                urllib.error.URLError,
                subprocess.CalledProcessError,
            ):
                # Fall back to e.g.
                # pressure-vessel/snapshots/latest/VERSION.txt
                logger.warning(
                    "Couldn't pin version number the new way, falling back...",
                    exc_info=True,
                )
                pinned = self.__pin_version_internal(
                    filename='VERSION.txt',
                    opener=opener,
                )

            self.check_valid_version(pinned)
            self.pinned_version = pinned

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


class Main:
    def __init__(
        self,
        architecture: str = 'amd64,i386',
        cache: str = '.cache',
        credential_envs: Sequence[str] = (),
        credential_hosts: Sequence[str] = (),
        dest: str = '.cache',
        ssh_host: str = '',
        ssh_path: str = '',
        uri: str = DEFAULT_PRESSURE_VESSEL_URI,
        version: str = 'latest',
        write_version_to: str = '',
        **kwargs: dict[str, Any],
    ) -> None:
        self.architecture = architecture
        self.cache = Path(cache)
        self.dest = Path(dest)
        self.ssh_host = ssh_host
        self.ssh_path = ssh_path
        self.uri = uri
        self.version = version
        self.write_version_to = write_version_to

        openers: list[urllib.request.BaseHandler] = []

        if not credential_hosts:
            credential_hosts = []
            host = urllib.parse.urlparse(uri).hostname

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

    def run(self):
        logger.info('Downloading standalone pressure-vessel release')

        if self.architecture == 'amd64,i386':
            arch = 'bin'
        else:
            arch = self.architecture.replace(',', '+')

        pv = PressureVesselRelease(
            cache=self.cache,
            ssh_host=self.ssh_host,
            ssh_path=self.ssh_path,
            uri=self.uri,
            version=self.version,
        )
        pinned = pv.pin_version(self.opener)

        if self.write_version_to:
            logger.info(
                'Saving pressure-vessel version "%s" to %s',
                pinned,
                self.dest / self.write_version_to,
            )
            self.dest.mkdir(parents=True, exist_ok=True)

            with open(self.dest / self.write_version_to, 'w') as writer:
                writer.write(f'{pinned}\n')

        filename = f'pressure-vessel-{arch}.tar.gz'
        return pv.fetch(
            filename,
            self.opener,
            dest=self.dest / filename,
            version=pinned,
        )


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
            'Use --credential-env when downloading from the given HOST '
            '(default: hostname of --uri)'
        ),
    )
    parser.add_argument(
        '--pv-version', dest='version', default='latest',
        help='Download this version of pressure-vessel: "latest" or 0.x.y',
    )
    parser.add_argument(
        '--ssh-host', default='', metavar='HOST',
        help='Use ssh and rsync to download pressure-vessel from HOST',
    )
    parser.add_argument(
        '--ssh-path', default='', metavar='PATH',
        help=(
            'Use ssh and rsync to download pressure-vessel from a versioned '
            'subdirectory of PATH on HOST'
        ),
    )
    parser.add_argument(
        '--uri',
        default=DEFAULT_PRESSURE_VESSEL_URI,
        metavar='URI',
        help=(
            'Download pressure-vessel from a versioned subdirectory of URI'
        ),
    )
    parser.add_argument(
        '--write-version-to',
        default='',
        metavar='FILENAME',
        help='Save "pinned" version number in DEST/FILENAME',
    )
    parser.add_argument(
        'dest', metavar='DEST',
        help='Download to DEST/FILENAME',
    )

    args = parser.parse_args()
    print(Main(**vars(args)).run())


if __name__ == '__main__':
    main()
