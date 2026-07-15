#!/bin/sh
# Copyright 2025 Collabora Ltd.
# SPDX-License-Identifier: MIT

set -eu

if [ "$*" != '--argument' ]; then
    echo "expected '--argument' in argv" >&2
    exit 1
fi

if [ "$PV_TEST_SET_WHEN_EMULATING" != set ]; then
    echo "PV_TEST_SET_WHEN_EMULATING should be 'set' but is: $PV_TEST_SET_WHEN_EMULATING" >&2
    exit 1
fi

if [ "${PV_TEST_UNSET_WHEN_EMULATING+set}" = set ]; then
    echo "PV_TEST_UNSET_WHEN_EMULATING should be unset but is: $PV_TEST_UNSET_WHEN_EMULATING" >&2
    exit 1
fi

if [ -n "${G_TEST_BUILDDIR-}" ]; then
    # $G_TEST_BUILDDIR is tests/pressure-vessel/ so go up 1 level
    exec "${G_TEST_BUILDDIR}/../mock-emulator-server"
else
    me="$(realpath "$0")"
    here="${me%/*}"
    # $here is tests/pressure-vessel/mock-emulators so go up 2 levels
    exec "${here}/../../mock-emulator-server"
fi
