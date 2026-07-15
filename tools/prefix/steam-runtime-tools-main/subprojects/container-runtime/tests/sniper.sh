#!/bin/bash
# Copyright © 2021 Collabora Ltd.
# SPDX-License-Identifier: MIT

set -eu

if [ -n "${TESTS_ONLY-}" ]; then
    echo "1..0 # SKIP This distro is too old to run populate-depot.py"
    exit 0
fi

mode="${1-unpacked}"

populate_depot_args=( \
    "--scripts-version=test test" \
    "--steam-app-id=1628350" \
    "--steam-depot-id=1628351" \
)

if [ "$mode" = "arch-per-depot" ]; then
    # The depot ID 123456 is a placeholder: we don't yet have a depot ID
    # for separating out the x86-on-arm64 emulation support.
    x86_on_arm64_depot=123456
    populate_depot_args=( \
        "${populate_depot_args[@]}" \
        --emulation-depot-id="arm64=${x86_on_arm64_depot}" \
    )
fi

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
        --version latest-container-runtime-public-beta \
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

echo "1..1"

mkdir -p .cache
python3 ./download-pressure-vessel.py \
    --write-version-to=pv-version.txt \
    "${pressure_vessel_args[@]}" \
    .cache
python3 ./download-pressure-vessel.py \
    --architecture=arm64,amd64,i386 \
    "${pressure_vessel_args[@]}" \
    --pv-version="$(< .cache/pv-version.txt)" \
    .cache

rm -fr "depots/test-sniper-$mode"
mkdir -p "depots/test-sniper-$mode"
python3 ./populate-depot.py \
    --depot="depots/test-sniper-$mode" \
    --depot-archive=depots/SteamLinuxRuntime_sniper.tar.xz \
    --fast \
    --no-include-archives \
    --pressure-vessel-archive=.cache/pressure-vessel-bin.tar.gz \
    --pressure-vessel-foreign="arm64=.cache/pressure-vessel-arm64+amd64+i386.tar.gz" \
    --add-bin-directory \
    --toolmanifest \
    --unpack-runtime \
    --versioned-directories \
    "${populate_depot_args[@]}" \
    sniper \
    ${NULL+}

find "depots/test-sniper-$mode" -ls > "depots/test-sniper-$mode.txt"

if ! [ -e "depots/test-sniper-$mode/steampipe/app_build_1628350.vdf" ]; then
    echo "Bail out! app_build_1628350.vdf not found"
    exit 1
fi

depot_ids=(1628351)

if [ "$mode" = "arch-per-depot" ]; then
    depot_ids=("${depot_ids[@]}" "${x86_on_arm64_depot}")
fi

for depot_id in "${depot_ids[@]}"; do
    case "$depot_id" in
        (1628351)
            path_prefix=""
            ;;
        ("$x86_on_arm64_depot")
            path_prefix="depot-${x86_on_arm64_depot}-arm64/"
            ;;
    esac

    if ! [ -e "depots/test-sniper-$mode/steampipe/depot_build_$depot_id.vdf" ]; then
        echo "Bail out! depot_build_$depot_id.vdf not found"
        exit 1
    fi

    expected_paths=( \
        README.md \
        VERSIONS.txt \
        _v2-entry-point \
        mtree.txt.gz \
        run \
        run-in-sniper \
        toolmanifest.vdf \
    )

    if [ "$mode" = "arch-per-depot" ]; then
        case "$depot_id" in
            ("$x86_on_arm64_depot")
                expected_paths=( \
                    "${expected_paths[@]}" \
                    pressure-vessel-arm64 \
                )
                ;;

            (*)
                expected_paths=( \
                    "${expected_paths[@]}" \
                    bin \
                    pressure-vessel \
                )
                ;;
        esac
    else
        expected_paths=( \
            "${expected_paths[@]}" \
            bin \
            pressure-vessel \
            pressure-vessel-arm64 \
        )
    fi

    for path in "${expected_paths[@]}"; do
        if [ -e "depots/test-sniper-$mode/${path_prefix}${path}" ]; then
            echo "# $depot_id has $path on-disk"
        else
            echo "Bail out! Depot $depot_id lacks $path"
            exit 1
        fi

        if [ -d "depots/test-sniper-$mode/${path_prefix}${path}" ]; then
            path_suffix='/*'
        else
            path_suffix=''
        fi

        if grep -q -F "\"LocalPath\" \"../${path_prefix}${path}${path_suffix}\"" \
            "depots/test-sniper-$mode/steampipe/depot_build_$depot_id.vdf"
        then
            echo "# $depot_id VDF has $path"
        else
            echo "Bail out! depot_build_$depot_id.vdf lacks $path"
            exit 1
        fi
    done

    rm -fr "depots/test-sniper-${mode}-merged"
    cp -al "depots/test-sniper-$mode" "depots/test-sniper-${mode}-merged"

    if [ -n "$path_prefix" ]; then
        # This makes "depots/test-sniper-${mode}-merged"/ the result of installing
        # the main depot, then installing the per-architecture depot
        # over the top.
        cp -a "depots/test-sniper-$mode/$path_prefix"/* "depots/test-sniper-${mode}-merged/"
    fi

    rm -fr "depots/test-sniper-${mode}-merged"/depot-*/

    for path in \
        pressure-vessel/bin/pressure-vessel-wrap \
        pressure-vessel/libexec/steam-runtime-tools-0/i386-linux-gnu-exec \
        pressure-vessel/libexec/steam-runtime-tools-0/x86_64-linux-gnu-exec \
        pressure-vessel-arm64/bin/pressure-vessel-wrap \
        pressure-vessel-arm64/libexec/steam-runtime-tools-0/aarch64-linux-gnu-exec \
        pressure-vessel-arm64/libexec/steam-runtime-tools-0/i386-linux-gnu-exec \
        pressure-vessel-arm64/libexec/steam-runtime-tools-0/x86_64-linux-gnu-exec \
    ; do
        if ! [ -e "depots/test-sniper-${mode}-merged/${path%%/*}" ]; then
            # Depots that don't have pressure-vessel/ are not expected
            # to have its contents! We checked whether each depot
            # had the expected pressure-vessel*/ subdirectories already
            echo "# Merged depot with $depot_id doesn't have ${path%%/*}"
        elif [ -e "depots/test-sniper-${mode}-merged/${path}" ]; then
            echo "# Merged depot with $depot_id has $path on-disk"
        else
            echo "Bail out! Merged depot with $depot_id lacks $path"
            exit 1
        fi
    done

    pv_verify=

    case "$(uname -m)" in
        (x86_64)
            pv_verify="depots/test-sniper-$mode/pressure-vessel/bin/pv-verify"
            ;;
        # In principle we could run a different copy of pv-verify on non-x86,
        # but our CI runners and development systems are x86 so this is
        # good enough
    esac

    if [ -n "$pv_verify" ]; then
        if ! "$pv_verify" "depots/test-sniper-${mode}-merged"; then
            echo "Bail out! Merged depot with $depot_id verification failed"
            exit 1
        fi
    fi
done

echo "ok 1 - sniper, running from unpacked directory ($mode)"

# vim:set sw=4 sts=4 et:
