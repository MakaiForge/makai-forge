#!/bin/sh
# Copyright 2022-2025 Collabora Ltd.
# SPDX-License-Identifier: MIT

set -eux

case "$RELOCATABLE_INSTALL_ARCHS" in
    (*,*)
        primary_arch="${RELOCATABLE_INSTALL_ARCHS%%,*}"
        secondary_archs="${RELOCATABLE_INSTALL_ARCHS#*,}"
        ;;

    (*)
        primary_arch="${RELOCATABLE_INSTALL_ARCHS}"
        secondary_archs=
        ;;
esac

dir="_build"

tuples="$(dpkg-architecture -a"$primary_arch" -qDEB_HOST_MULTIARCH)"
oldIFS="$IFS"
IFS=,
for arch in $secondary_archs; do
    tuples="$tuples,$(dpkg-architecture -a"$arch" -qDEB_HOST_MULTIARCH)"
done
IFS="$oldIFS"

# We need up-to-date packages for the relocatable install to
# be able to get its source code
apt-get -y dist-upgrade

# shellcheck source=/dev/null
suite="$(. /usr/lib/os-release; echo "${VERSION_CODENAME-${VERSION}}")"

case "$suite" in
    (scout)
        # The default g++ 4.6 is too old (see also debian/rules)
        export CC=gcc-4.8
        export CXX=g++-4.8
        PYTHON=python3.5
        ;;

    (*)
        PYTHON=python3
        ;;
esac

mkdir -p _build/cache
dcmd cp -al debian/tmp/artifacts/source/*.dsc _build/cache

set -- meson

oldIFS="$IFS"
IFS=,
for arch in "$primary_arch" $secondary_archs; do
    set -- "$@" "libelf-dev:$arch"
    set -- "$@" "libglib2.0-dev:$arch"
    set -- "$@" "libjson-glib-dev:$arch"
    set -- "$@" "libva-dev:$arch"
    set -- "$@" "libvdpau-dev:$arch"
    set -- "$@" "libvulkan-dev:$arch"
    set -- "$@" "libwaffle-dev:$arch"
    set -- "$@" "libx11-dev:$arch"
    set -- "$@" "libxau-dev:$arch"
    set -- "$@" "libxrandr-dev:$arch"

    case "$suite" in
        (scout)
            set -- "$@" "libgl1-mesa-dev:$arch"
            ;;
        (*)
            set -- "$@" "libgl-dev:$arch"
            ;;
    esac
done
IFS="$oldIFS"

apt-get -y --no-install-recommends install "$@"

set -- debian/tmp/artifacts/build/*_"$primary_arch".*deb
oldIFS="$IFS"
IFS=,
for arch in $secondary_archs; do
    set -- \
        debian/tmp/artifacts/build/libsteam-runtime-tools-0-0-dbgsym_*_"$arch".*deb \
        debian/tmp/artifacts/build/libsteam-runtime-tools-0-0_*_"$arch".deb \
        debian/tmp/artifacts/build/libsteam-runtime-tools-0-dev_*_"$arch".deb \
        debian/tmp/artifacts/build/libsteam-runtime-tools-0-helpers-dbgsym_*_"$arch".*deb \
        debian/tmp/artifacts/build/libsteam-runtime-tools-0-helpers_*_"$arch".deb \
        debian/tmp/artifacts/build/libsteam-runtime-tools-0-relocatable-libs_*_"$arch".deb \
        debian/tmp/artifacts/build/pressure-vessel-libs-"$arch"_*_"$arch".deb \
        "$@"

    case "$suite" in
        (scout)
            set -- \
                debian/tmp/artifacts/build/libsteam-runtime-shim-libcurl4_*_"$arch".deb \
                "$@"
            ;;
    esac
done
IFS="$oldIFS"

dpkg -i "$@"

rm -fr "$dir"/pressure-vessel-*.tar.gz
rm -fr "$dir/relocatable-install"
mkdir -p "$dir"

case "$RELOCATABLE_INSTALL_ARCHS" in
    (amd64,i386)
        # Defaults => pressure-vessel-bin.tar.gz
        set --
        tarball_suffix="bin"
        ;;

    (*)
        set -- \
        --architecture-name="$primary_arch${secondary_archs:+",$secondary_archs"}" \
        --architecture-multiarch="$tuples" \
        ${NULL+}
        tarball_suffix="$(echo "$primary_arch${secondary_archs:+",$secondary_archs"}" | tr , +)"
        ;;
esac

"$PYTHON" pressure-vessel/build-relocatable-install.py \
    --cache _build/cache \
    --output "$dir/relocatable-install" \
    --archive "$(pwd)/$dir" \
    --no-archive-versions \
    ${CI_ALLOW_MISSING_SOURCES:+--allow-missing-sources} \
    "$@"

set --

case "$primary_arch" in
    (amd64)
        ;;

    (*)
        set -- "$@" --multiarch-tuple="${tuples%%,*}"
        ;;
esac

PYTHONPATH="$(pwd)/tests" "$PYTHON" \
    ./tests/pressure-vessel/relocatable-install.py \
    "$@" \
    "$(pwd)/$dir/relocatable-install"

for tarball in \
    "pressure-vessel-${tarball_suffix}.tar.gz" \
    "pressure-vessel-${tarball_suffix}+src.tar.gz" \
; do
    rm -fr "$(pwd)/$dir/pressure-vessel"
    tar -C "$(pwd)/$dir" -xf "$(pwd)/$dir/$tarball"
    PYTHONPATH="$(pwd)/tests" "$PYTHON" \
        ./tests/pressure-vessel/relocatable-install.py \
        "$@" \
        "$(pwd)/$dir/pressure-vessel"
done

# Required during testing
pkgtestdir=/usr/libexec/installed-tests/steam-runtime-tools-0
install -d "$dir/installed-tests/"
cp -a "$pkgtestdir" "$dir/installed-tests/"
