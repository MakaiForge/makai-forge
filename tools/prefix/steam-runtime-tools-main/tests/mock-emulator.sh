#!/bin/sh
# Copyright © 2025 Collabora Ltd.
# SPDX-License-Identifier: MIT

set -eu

printf '%s\n' "argv[0]=$0"
n=0

while [ "$#" -gt 0 ]; do
    n=$(( n + 1 ))
    printf '%s\n' "argv[$n]=$1"
    shift
done

printf '$%s=%s\n' SET "${SET-unset}"
printf '$%s=%s\n' UNSET "${UNSET-unset}"

printf 'not really running it\n'
exit 0
