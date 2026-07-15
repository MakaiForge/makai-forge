#!/bin/sh
# Copyright 2022-2025 Collabora Ltd.
# SPDX-License-Identifier: MIT

set -eux

apt-get install -y --no-install-recommends \
    build-essential \
    debhelper \
    devscripts \
    dpkg-dev \
    rsync \
    ${HOST_ARCH:+"libsdl2-ttf-dev:$HOST_ARCH"} \
    "$@"

# shellcheck source=/dev/null
case "$(. /usr/lib/os-release; echo "${VERSION_CODENAME-${VERSION}}")" in
    (scout)
        apt-get -y install pkg-create-dbgsym
        ;;
esac

mkdir -p debian/tmp/artifacts/build
cd debian/tmp/artifacts/build
dpkg-source -x ../source/*.dsc
cd ./*/

set --

case "$STEAM_CI_DEB_BUILD" in
    (all)
        set -- -A
        ;;

    (any)
        set -- -B
        ;;

    (full)
        ;;

    (binary)
        set -- -b
        ;;
esac

if [ -n "${HOST_ARCH-}" ]; then
    eval "$(dpkg-architecture -f --print-set -a"$HOST_ARCH")"

    export AR="${DEB_HOST_GNU_TYPE}-ar"
    export AS="${DEB_HOST_GNU_TYPE}-as"
    export CC="${DEB_HOST_GNU_TYPE}-gcc"
    export CPP="${DEB_HOST_GNU_TYPE}-cpp"
    export CXX="${DEB_HOST_GNU_TYPE}-g++"
    export LD="${DEB_HOST_GNU_TYPE}-ld"
    export PKG_CONFIG="${DEB_HOST_GNU_TYPE}-pkg-config"
    export STRIP="${DEB_HOST_GNU_TYPE}-strip"

    set -- "$@" -a"$DEB_HOST_ARCH" -Pcheck,cross,nodoc
fi

dpkg-buildpackage -us -uc "$@"
cd ..
rm -fr ./*/
