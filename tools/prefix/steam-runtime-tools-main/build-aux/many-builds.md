# NAME

build-aux/many-builds.py - build steam-runtime-tools and pressure-vessel

# SYNOPSIS

**build-aux/many-builds.py** [*OPTIONS*] **deps**

**build-aux/many-builds.py** [*OPTIONS*] **setup** [*MESON SETUP OPTIONS*]

**build-aux/many-builds.py** [*OPTIONS*] **build** [*NINJA OPTIONS*]

**build-aux/many-builds.py** [*OPTIONS*] **install** [*NINJA OPTIONS*]

**build-aux/many-builds.py** [*OPTIONS*] **lint** [*MESON TEST OPTIONS*]

**build-aux/many-builds.py** [*OPTIONS*] **test** [*MESON TEST OPTIONS*]

**build-aux/many-builds.py** [*OPTIONS*] **clean** [*NINJA OPTIONS*]

# DESCRIPTION

`build-aux/many-builds.py` partially automates developer setup and
testing for steam-runtime-tools and pressure-vessel.

# REQUIREMENTS

You'll need about 25G of space available in your home directory
for container images and so on
(assuming **--podman**;
avoid using that option if you are space-constrained).
On a filesystem with transparent compression,
such as btrfs with `compress=zstd`,
this can be reduced to about 15G.

On x86, 32-bit support is required.
On Debian and derivatives,
this means i386 as a foreign architecture:

    sudo dpkg --add-architecture i386
    sudo apt update

Using **build-aux/many-builds.py** requires these Debian packages,
or their closest equivalents on other distributions:

* bubblewrap
* clang
* dbus-daemon
* docker.io (if using **--docker**)
* git
* glslang-tools
* gobject-introspection
* gtk-doc-tools
* libc6:i386
* libcap-dev (not to be confused with libcap-ng)
* libelf-dev (from elfutils, not to be confused with the older libelfg0-dev)
* libgl-dev
* libglib2.0-dev
* libglx-mesa0:i386 (or mesa-vulkan-drivers:i386, or libglx-nvidia0:i386)
* libjson-glib-dev
* libva-dev
* libvulkan-dev
* libwaffle-dev
* libx11-dev
* libxau-dev
* libxcb1-dev
* libxrandr-dev
* meson
* pandoc
* pkgconf (or pkg-config in older releases)
* podman (if using **--podman**)
* python3
* python3-vdf

For 32-bit builds on x86,
also install:

* lib32gcc-$(gcc -dumpversion)-dev

If **podman**(1) is available in the `PATH`,
the default is to use Podman containers and the Steam Runtime SDK
for all builds.
This mode can also be explicitly requested with **--podman**,
and is expected to be the most convenient for users of **podman**(1),
**toolbox**(1) and **distrobox**(1).

If `podman` is not in the `PATH`,
the default is to use bubblewrap containers.
This mode can be explicitly requested with **--bwrap**.

It is also possible to use Docker containers for the Steam Runtime SDK
via the **--docker** option,
although this is not recommended,
because it normally requires root-equivalent privileges.

Running tests for pressure-vessel requires running bubblewrap,
even if the build was done in a Podman or Docker container.
Any configuration that involves running bubblewrap has
[the same user namespace requirements as Flatpak](https://github.com/flatpak/flatpak/wiki/User-namespace-requirements).
The configuration with unprivileged (non-setuid) bubblewrap is strongly
recommended.

## Optional packages

These packages add functionality but are not strictly required:

* gcovr and/or lcov
* libdbus-1-dev
* libfontconfig-dev
* libsdl2-dev
* libsdl2-ttf-dev

## Cross-compiling

For aarch64 builds (optional),
also run:

    sudo dpkg --add-architecture arm64
    sudo apt update

and install:

* gcc-aarch64-linux-gnu

plus arm64 versions of:

* libcap-dev
* libelf-dev
* libgl-dev
* libglib2.0-dev
* libjson-glib-dev
* libva-dev
* libvulkan-dev
* libwaffle-dev
* libx11-dev
* libxau-dev
* libxcb1-dev
* libxrandr-dev
* pkgconf

Then re-run `build-aux/many-builds.py [OPTIONS] setup`.

This will enable building `_build/arm64`.

Similarly,
for `_build/i386` install i386 versions of the packages above.
`_build/i386` uses `-m32`,
so you do not strictly need `gcc-i686-linux-gnu`.

# OPTIONS

**--srcdir** *PATH*
:   Relative or absolute path to the `steam-runtime-tools` source
    directory. The default is the current working directory.

**--builddir-parent** *PATH*
:   Relative or absolute path to the parent directory for all builds.
    The default is `_build`. Individual builds and additional required
    files will appear in subdirectories such as `_build/host` and
    `_build/containers`.

    Instead of using this option, it is usually more convenient to make
    a symbolic link such as `_build -> ../builds/steam-runtime-tools`
    if a separate build location is desired, and then use the default.

**--cross**
:   Install additional cross-architecture things.
    Currently this controls whether relocatable pressure-vessel bundles
    for arm64 are created:
    this needs to run several extra `ninja install` steps,
    and needs to download and install `qemu-user`,
    so by default it is not done to speed up iteration on
    non-architecture-specific features and bug fixes.

**--bwrap**
:   Use **bwrap**(1) to do builds.
    This is the default if Podman is not found in the `PATH`.

**--docker**
:   Use **docker**(1) to do builds.
    Building with Docker requires that the invoking user is either in
    the `docker` Unix group or able to run **sudo**(8), either of which
    is equivalent to full root privileges, so this mode cannot be used on
    machines where gaining full root privileges would be unacceptable.

**--podman**
:   Use **podman**(1) to do builds.
    This is the default if Podman is found in the `PATH`.
    Building with Podman requires newuidmap, newgidmap and a uid range
    configured for the current user in /etc/subuid and /etc/subgid:
    see [Troubleshooting](https://github.com/containers/podman/blob/main/troubleshooting.md)
    for details.

# STEPS

## deps

The **deps** step downloads
the necessary Steam Linux Runtime container runtime images to be able
to test **pressure-vessel-wrap**, and the necessary SDK image to be
able to compile for Steam Runtime 1 'scout'.

In the **--podman** or **--docker** mode,
only the SDK sysroot tarballs that will be used for testing are downloaded,
and the SDKs used for compilation are in the form of official
Steam Runtime OCI images for Podman or Docker.
In the **--bwrap** mode,
the necessary sysroot tarballs for compilation are also downloaded.

## setup

The **setup** step is similar to **meson setup**.

## build

The **build** step is similar to **meson compile**, but it only builds
a subset of the configurations from the **setup** step.

More specialized configurations such as *${builddir\_parent}*/**coverage**
can be compiled in the usual way with commands like
`meson compile -C _build/coverage` or `ninja -C _build/coverage`.

## install

The **install** step builds a complete relocatable version of the
Steam Runtime 1 'scout' builds of pressure-vessel. This can be
found in `_build/scout-relocatable`, and is also copied into
`_build/containers/pressure-vessel` for testing.

The other builds are not installed.

## lint

The **lint** step runs lint checks such as **pyflakes**(1)
and **shellcheck**(1).

Unlike the **test** step,
in this mode any failing lint check is configured to be treated as an error,
and detailed results are shown (**meson test -v** is used).

## test

The **test** step runs unit tests, with as comprehensive a test coverage
as possible. This will take a while.

Lint checks such as **pyflakes**(1) and **shellcheck**(1) are run if
available,
but by default any lint failures are treated as an "expected failure"
which does not cause the overall test step to fail.
This is because lint tools often produce new false-positives when upgraded,
which should not usually be treated as urgent to fix.
To have lint failures reported as errors,
either use the **lint** step (`build-aux/many-builds.py lint`),
or set environment variable **LINT_WARNINGS_ARE_ERRORS=1**.

## clean

The **clean** step is similar to **ninja -C ... clean**.

<!-- vim:set sw=4 sts=4 et: -->
