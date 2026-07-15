#!/bin/sh
# Copyright 2025 Collabora Ltd.
# SPDX-License-Identifier: MIT

# Yes the documentation for PRESSURE_VESSEL_EMULATOR says the emulator
# can't be a script, but that doesn't apply when nothing is really being
# emulated.
set -e

context="$1"

case "$1" in
    (--container | --main)
        shift
        ;;
esac

if [ "$1" != '--' ]; then
    echo "expected '--' in argv" >&2
    exit 1
fi

shift

if [ ! -d "$MOCK_EMULATOR_SERVER_STATE/server-flag" ]; then
    echo "Expected $MOCK_EMULATOR_SERVER_STATE/server-flag to have been created" >&2
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

if [ -d /run/pressure-vessel ]; then
    case "$context" in
        (--container | --main)
            ;;
        (*)
            echo "expected --container or --main in argv inside container" >&2
            exit 1
            ;;
    esac

    case "$1" in
        # In the tests that use this mock emulator, we happen to know that
        # the command we are running is env(1), either wrapped in
        # x86_64-linux-gnu-exec or directly.
        (*-exec | /usr/bin/env)
            if [ "$context" != '--main' ]; then
                echo "did not expect $context when running main command" >&2
                exit 1
            fi
            ;;

        (*)
            # e.g. x86_64-linux-gnu-detect-lib
            if [ "$context" != '--container' ]; then
                echo "did not expect $context when running setup command" >&2
                exit 1
            fi
            ;;
    esac

    if [ "$PV_TEST_SET_IN_CONTAINER" != set ]; then
        echo "PV_TEST_SET_IN_CONTAINER should be 'set' but is: $PV_TEST_SET_IN_CONTAINER" >&2
        exit 1
    fi
    if [ "${PV_TEST_UNSET_IN_CONTAINER+set}" = set ]; then
        echo "PV_TEST_UNSET_IN_CONTAINER should be unset but is: $PV_TEST_UNSET_IN_CONTAINER" >&2
        exit 1
    fi
else
    case "$context" in
        (--)
            ;;
        (*)
            echo "did not expect $context in argv inside container" >&2
            exit 1
            ;;
    esac

    if [ "$PV_TEST_SET_IN_CONTAINER" = set ]; then
        echo "PV_TEST_SET_IN_CONTAINER should not apply when not in PV" >&2
        exit 1
    fi
fi

exec "$@"
