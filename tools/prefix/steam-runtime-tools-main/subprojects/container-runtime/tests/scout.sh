#!/bin/bash
# Copyright © 2021 Collabora Ltd.
# SPDX-License-Identifier: MIT

set -eu

if [ -n "${TESTS_ONLY-}" ]; then
    echo "1..0 # SKIP This distro is too old to run populate-depot.py"
    exit 0
fi

app_id=1070560
depot_id=1070561
populate_depot_args=(
    "--steam-app-id=$app_id" \
    "--steam-depot-id=$depot_id" \
)

if [ -n "${IMAGES_DOWNLOAD_CREDENTIAL-}" ]; then
    populate_depot_args=( \
        "${populate_depot_args[@]}" \
        --credential-env IMAGES_DOWNLOAD_CREDENTIAL \
    )
fi

if [ -n "${IMAGES_DOWNLOAD_URL-}" ] && [ -n "${IMAGES_DOWNLOAD_CREDENTIAL-}" ]; then
    populate_depot_args=( \
        "${populate_depot_args[@]}" \
        --images-uri "${IMAGES_DOWNLOAD_URL}"/steamrt-SUITE/snapshots \
    )
elif [ -n "${IMAGES_SSH_HOST-}" ] && [ -n "${IMAGES_SSH_PATH-}" ]; then
    populate_depot_args=( \
        "${populate_depot_args[@]}" \
        --ssh-host "${IMAGES_SSH_HOST}" \
        --ssh-path "${IMAGES_SSH_PATH}" \
    )
else
    populate_depot_args=( \
        "${populate_depot_args[@]}" \
        --version latest-steam-client-public-beta \
    )
fi

pressure_vessel_args=()

if [ -n "${PRESSURE_VESSEL_SSH_HOST-"${IMAGES_SSH_HOST-}"}" ] && [ -n "${PRESSURE_VESSEL_SSH_PATH-}" ]; then
    pressure_vessel_args=( \
        "${pressure_vessel_args[@]}" \
        --ssh-host="${PRESSURE_VESSEL_SSH_HOST-"${IMAGES_SSH_HOST}"}" \
        --ssh-path="${PRESSURE_VESSEL_SSH_PATH}" \
    )
elif [ -n "${PRESSURE_VESSEL_DOWNLOAD_URL-}" ]; then
    pressure_vessel_args=( \
        "${pressure_vessel_args[@]}" \
        --uri="${PRESSURE_VESSEL_DOWNLOAD_URL}" \
    )
fi

echo "1..4"

mkdir -p .cache
python3 ./download-pressure-vessel.py "${pressure_vessel_args[@]}" .cache

rm -fr depots/test-scout-layered
mkdir -p depots/test-scout-layered
python3 ./populate-depot.py \
    --depot=depots/test-scout-layered \
    --layered \
    "${populate_depot_args[@]}" \
    --toolmanifest \
    --version= \
    scout \
    ${NULL+}
find depots/test-scout-layered -ls > depots/test-scout-layered.txt
test -e depots/test-scout-layered/README.md
test -e depots/test-scout-layered/VERSIONS.txt
test -e depots/test-scout-layered/toolmanifest.vdf
test -x depots/test-scout-layered/scout-on-soldier-entry-point-v2
test ! -e depots/test-scout-layered/_v2-entry-point
test ! -e depots/test-scout-layered/steam-runtime

if ! grep $'^LD_LIBRARY_PATH\t-\tscout\t-\t#' depots/test-scout-layered/VERSIONS.txt >/dev/null; then
    echo "Bail out! LD_LIBRARY_PATH runtime's (lack of) version number not found"
    exit 1
fi

echo "ok 1 - scout, layered on soldier, reusing standard LDLP runtime"

rm -fr depots/test-scout-layered-ga
mkdir -p depots/test-scout-layered-ga
python3 ./populate-depot.py \
    --depot=depots/test-scout-layered-ga \
    --depot-version="test test" \
    --layered \
    "${populate_depot_args[@]}" \
    --version=latest-steam-client-general-availability \
    scout \
    ${NULL+}
find depots/test-scout-layered-ga -ls > depots/test-scout-layered-ga.txt
test -e depots/test-scout-layered-ga/README.md
test -e depots/test-scout-layered-ga/VERSIONS.txt
test -e depots/test-scout-layered-ga/toolmanifest.vdf
test -x depots/test-scout-layered-ga/scout-on-soldier-entry-point-v2
test ! -e depots/test-scout-layered-ga/_v2-entry-point
test -e depots/test-scout-layered-ga/steam-runtime/version.txt
test -d depots/test-scout-layered-ga/steam-runtime/usr/

if ! grep -E $'^LD_LIBRARY_PATH\t[0-9.]+\tscout\t[0-9.]+\t#' depots/test-scout-layered-ga/VERSIONS.txt >/dev/null; then
    echo "Bail out! LD_LIBRARY_PATH runtime's version number not found"
    exit 1
fi

if ! grep -E $'^depot\ttest test\t\t\t#' depots/test-scout-layered-ga/VERSIONS.txt >/dev/null; then
    echo "Bail out! Overall depot version number not found"
    exit 1
fi

if ! [ -e "depots/test-scout-layered-ga/steampipe/app_build_$app_id.vdf" ]; then
    echo "Bail out! app_build_1628350.vdf not found"
    exit 1
fi

if ! [ -e "depots/test-scout-layered-ga/steampipe/depot_build_$depot_id.vdf" ]; then
    echo "Bail out! depot_build_$depot_id.vdf not found"
    exit 1
fi

for path in \
    README.md \
    VERSIONS.txt \
    run-in-scout-on-soldier \
    scout-on-soldier-entry-point-v2 \
    steam-runtime/ \
    toolmanifest.vdf \
; do
    if [ -e "depots/test-scout-layered-ga/${path}" ]; then
        echo "# $depot_id has $path on-disk"
    else
        echo "Bail out! Depot $depot_id lacks $path"
        exit 1
    fi

    if [ "${path%/}" = "${path}" ]; then
        path_suffix=''

        if [ -d "depots/test-scout-layered-ga/${path}" ]; then
            echo "Bail out! $path should not be a directory"
            exit 1
        fi
    else
        path_suffix='*'

        if ! [ -d "depots/test-scout-layered-ga/${path}" ]; then
            echo "Bail out! $path should be a directory"
            exit 1
        fi
    fi

    if grep -q -F "\"LocalPath\" \"../${path}${path_suffix}\"" \
        "depots/test-scout-layered-ga/steampipe/depot_build_$depot_id.vdf"
    then
        echo "# $depot_id VDF has ${path}${path_suffix}"
    else
        echo "Bail out! depot_build_$depot_id.vdf lacks $path"
        exit 1
    fi
done

echo "ok 2 - scout, layered on soldier, with own copy of GA LDLP runtime"

rm -fr depots/test-scout-layered-ga-again
mkdir -p depots/test-scout-layered-ga-again
python3 ./populate-depot.py \
    --depot=depots/test-scout-layered-ga-again \
    --depot-version="test test" \
    --layered \
    "${populate_depot_args[@]}" \
    'scout={"path": ".cache", "version": "local"}' \
    ${NULL+}
find depots/test-scout-layered-ga -ls > depots/test-scout-layered-ga-again.txt

echo "ok 3 - scout, layered on soldier, with local copy of GA LDLP runtime"

rm -fr depots/test-scout-layered-beta
mkdir -p depots/test-scout-layered-beta
python3 ./populate-depot.py \
    --depot=depots/test-scout-layered-beta \
    --layered \
    "${populate_depot_args[@]}" \
    --version=latest-steam-client-public-beta \
    scout \
    ${NULL+}
find depots/test-scout-layered-beta -ls > depots/test-scout-layered-beta.txt
test -e depots/test-scout-layered-beta/README.md
test -e depots/test-scout-layered-beta/VERSIONS.txt
test -e depots/test-scout-layered-beta/toolmanifest.vdf
test -x depots/test-scout-layered-beta/scout-on-soldier-entry-point-v2
test ! -e depots/test-scout-layered-beta/_v2-entry-point
test -e depots/test-scout-layered-beta/steam-runtime/version.txt
test -d depots/test-scout-layered-beta/steam-runtime/usr/

if ! grep -E $'^LD_LIBRARY_PATH\t[0-9.]+\tscout\t[0-9.]+\t#' depots/test-scout-layered-beta/VERSIONS.txt >/dev/null; then
    echo "Bail out! LD_LIBRARY_PATH runtime's version number not found"
    exit 1
fi

echo "ok 4 - scout, layered on soldier, with own copy of beta LDLP runtime"

# vim:set sw=4 sts=4 et:
