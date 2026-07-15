---
title: steam-runtime-graphics-provider.json
section: 5
...

<!-- This document:
Copyright © 2020-2025 Collabora Ltd.
SPDX-License-Identifier: MIT
-->

# NAME

steam-runtime graphics-provider.json - manifest describing a graphics stack

# SYNOPSIS


# DESCRIPTION

A **graphics-provider.json** file configures a sysroot-like tree in which
**pressure-vessel-wrap**(1) can find user-space graphics drivers
and their dependencies,
including glibc.

If the graphics provider manifest specified in configuration involves
any symbolic links,
then it is resolved to a physical path as if via **realpath**(3)
before using it as a basis for relative paths.

## FORMAT VERSION 0

Version 0 of the file format uses a **graphics_provider_v0** key in the
top-level object.
The corresponding value must be another object.
Known fields in this object are:

### `architectures` (object or array of strings)

The architectures supported by this graphics provider.
This field is required.

If the value is an object,
then the keys are [multiarch tuples][] and the values are objects.
Each architecture object may contain the keys and values specified
in **PER-ARCHITECTURE FIELDS**,
below.

If the value is an array of strings,
then they are [multiarch tuples][].
This is exactly equivalent to providing an object where the keys are
the same multiarch tuples,
and the values are all empty objects,
`{}`.

### `locales` (boolean)

If `false`,
compatibility tools may assume that glibc locale data in this graphics
provider is missing or incomplete,
and therefore locale data should be taken from elsewhere
(for example the root directory).
The default is `true`.

### `root` (string)

Path to a directory to use as if it was the root filesystem.
If relative,
it is interpreted as being relative to the graphics provider manifest.

This field is optional.
If not specified,
the default is `./`,
meaning that the parent of the `realpath()` of the graphics provider manifest
is the directory to use.
For example, it might have this layout:

    /opt/gfx/
        graphics-provider.json
        bin -> usr/bin
        etc/
            ld.so.cache (etc.)
        lib -> usr/lib
        lib64 -> usr/lib64
        sbin -> usr/sbin
        usr/
            bin/
                localedef (etc.)
            lib/
                ld-linux.so.2
                libc.so.6
                (etc.)
            lib64/
                ld-linux-x86-64.so.2
                libc.so.6
                (etc.)
            sbin/
                ldconfig (etc.)

The `root` must have the layout of a root filesystem,
as though it was going to be used as a chroot or container,
or with `cc -sysroot`.
A "merged-`/usr`" directory is recommended.

The `root` must contain at least `etc/ld.so.cache`,
`usr/lib*`,
`sbin/ldconfig`,
the architectures' interoperable dynamic linkers
(`/lib64/ld-linux-x86-64.so.2`, `/lib/ld-linux.so.2` and so on),
the graphics drivers to be used
(OpenGL, EGL, Vulkan and so on),
and their recursive dependencies (all the way down to glibc).

For the `root` to work correctly,
any functionally-significant symbolic links in the `root` must be relative.
For example,
the `bin` compatibility symlink should point to `usr/bin`,
not `/usr/bin`.

### `va_api` (boolean)

If `false`,
compatibility tools may assume that VA-API is not useful on this system
and therefore the necessary setup steps for VA-API drivers can be skipped.
The default is `true`.

### `vdpau` (boolean)

If `false`,
compatibility tools may assume that VDPAU is not useful on this system
and therefore the necessary setup steps for VDPAU drivers can be skipped.
The default is `true`.

## PER-ARCHITECTURE FIELDS

Known fields in the per-architecture objects are:

### `dri` (string)

An absolute path (starting with `/`).
If present,
compatibility tools may assume that Mesa DRI drivers in this graphics provider
are files named `*_dri.so` in the given directory inside the `root`,
and VA-API drivers are files named `*_drv_video.so` in the same directory.

Relative paths as values for this field are not allowed
(they are reserved for possible future use).

If not specified,
the default is to auto-detect it,
which may incur a startup time cost
(especially when running under CPU emulation).

### `gbm` (string)

An absolute path (starting with `/`).
If present,
compatibility tools may assume that Mesa GBM backends in this graphics provider
are files named `*_gbm.so` in the given directory inside the `root`.

Relative paths as values for this field are not allowed
(they are reserved for possible future use).

If not specified,
the default is to auto-detect it,
which may incur a startup time cost
(especially when running under CPU emulation).

### `fallback_library_paths` (array of strings)

If present,
compatibility tools may assume that glibc will search these paths as a
last resort if a library cannot be found in `/etc/ld.so.cache`,
replacing any defaults known to the compatibility tool.

For example,
32-bit glibc on Arch Linux systems could use `["/usr/lib32"]`.

If not specified,
compatibility tools should assume a default value such as
`["/lib", "/usr/lib"]`.

### `gconv` (string)

An absolute path (starting with `/`).
If present,
compatibility tools may assume that glibc character set conversion modules
in this graphics provider are found in the given directory inside the `root`.

Relative paths as values for this field are not allowed
(they are reserved for possible future use).

If not specified,
the default is to auto-detect it,
which may incur a startup time cost
(especially when running under CPU emulation).

### `locales` (not allowed)

This field cannot be present at the per-architecture level.

### `va_api` (boolean)

If present,
this overrides the field of the same name in the `emulator_v0` object,
but only for this architecture.

### `vdpau` (boolean)

If present,
this overrides the field of the same name in the `emulator_v0` object,
but only for this architecture.

## COMPATIBILITY

If a new version of **pressure-vessel-wrap**(1) or other Steam compatibility
infrastructure requires file format changes,
then it should introduce a new top-level item such as `graphics_provider_v1`.

Consumers of this file format should accept and ignore object members
that they do not understand,
allowing for backward-compatibility.
In particular,
if the file contains both `graphics_provider_v0` and `graphics_provider_v1`,
then older versions of the compatibility infrastructure may continue to
parse and use `graphics_provider_v0`,
ignoring `graphics_provider_v1`.

If there is an incompatible semantic break that causes older compatibility
infrastructure to be incompatible with a new graphics provider,
then the `graphics_provider_v0` top-level item should be removed,
leaving only `graphics_provider_v1`.
Older consumers of the file format should treat the absence of
`graphics_provider_v0` as a fatal error and refuse to parse the file.

If a consumer of this file format encounters an object member that it
understands,
with an invalid type or value
(for example `environment` set to an array rather than an object,
or a `null` entry in `argv`),
then it should treat that as a fatal error and refuse to parse the file.

# EXAMPLE

A minimal manifest describing i386 graphics drivers in `/srv/chroots/i386`
might look like this:

    {
      "graphics_provider_v0": {
        "root": "/srv/chroots/i386",
        "architectures": ["i386-linux-gnu"]
      }
    }

A manifest describing x86\_64 and i386 graphics drivers derived from
an Arch Linux derivative such as SteamOS,
on a platform that does not use VA-API or VDPAU,
might look like this:

    {
      "graphics_provider_v0": {
        "root": "./",
        "locales": false,
        "va_api": false,
        "vdpau": false,
        "architectures": {
          "x86_64-linux-gnu": {
            "dri": "/usr/lib/dri",
            "gbm": "/usr/lib/gbm",
            "gconv": "/usr/lib/gconv"
          },
          "i386-linux-gnu": {
            "dri": "/usr/lib32/dri",
            "gbm": "/usr/lib32/gbm",
            "fallback_library_paths": ["/usr/lib32"],
            "gconv": "/usr/lib32/gconv"
          }
        }
      }
    }

# SEE ALSO

* **pressure-vessel-wrap**(1)
* `PvGraphicsProvider` in [steam-runtime-tools][] source code

[multiarch tuples]: https://wiki.debian.org/Multiarch/Tuples
[steam-runtime-tools]: https://gitlab.steamos.cloud/steamrt/steam-runtime-tools

<!-- vim:set sw=4 sts=4 et: -->
