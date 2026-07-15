#!/bin/bash
# Copyright © 2021-2026 Collabora Ltd.
# SPDX-License-Identifier: MIT

set -eu

if [ -n "${TESTS_ONLY-}" ]; then
    echo "1..0 # SKIP This distro is too old to run populate-depot.py"
    exit 0
fi

echo "1..1"

python3 ./populate-depot.py --self-test --verbose
echo "ok 1"
