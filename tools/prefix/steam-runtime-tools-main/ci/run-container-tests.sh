#!/bin/sh
# Copyright 2019-2026 Collabora Ltd.
# SPDX-License-Identifier: MIT

# Run tests based on tests/pressure-vessel/containers.py, which are
# listed in _build/containers-tests.txt (copied from
# /usr/libexec/installed-tests/steam-runtime-tools-0/pressure-vessel/containers-tests.txt
# during build).

set -eux

cwd="$(pwd)"
export ASSERT_BWRAP_WORKS=1
export AUTOPKGTEST_ARTIFACTS="$cwd/_build/artifacts"
export PRESSURE_VESSEL_TEST_CONTAINERS="$cwd/_build/depot"
pkgtestdir="$(pwd)/_build/installed-tests/steam-runtime-tools-0"
export PYTHONPATH="$pkgtestdir"

: > _build/tests-ok.txt
: > _build/tests-failed.txt

tail -v -n+0 "$pkgtestdir/pressure-vessel/containers-tests.txt"

while read -r line; do
    # Delete comments, filter blank lines
    line="${line%%"#"*}"

    if [ -n "$line" ]; then
        if python3 "$pkgtestdir/pressure-vessel/$line" >&2; then
            echo "$line" >> _build/tests-ok.txt
        else
            echo "$line" >> _build/tests-failed.txt
        fi
    fi
done < "$pkgtestdir/pressure-vessel/containers-tests.txt"

tail -v -n+0 _build/tests-*.txt

if [ -s _build/tests-failed.txt ] || ! [ -s _build/tests-ok.txt ]; then
    exit 1
fi
