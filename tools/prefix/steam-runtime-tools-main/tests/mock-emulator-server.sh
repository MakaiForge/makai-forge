#!/bin/sh
# Copyright 2025 Collabora Ltd.
# SPDX-License-Identifier: MIT

set -eu

if [ "$*" != '--argument' ]; then
    echo "expected '--argument' in argv" >&2
    exit 1
fi

if [ -n "${G_TEST_BUILDDIR-}" ]; then
    exec "${G_TEST_BUILDDIR}/mock-emulator-server"
else
    me="$(realpath "$0")"
    here="${me%/*}"
    exec "${here}/mock-emulator-server"
fi
