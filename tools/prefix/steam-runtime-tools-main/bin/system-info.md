---
title: steam-runtime-system-info
section: 1
...

<!-- This document:
Copyright 2019-2023 Collabora Ltd.
SPDX-License-Identifier: MIT
-->

# NAME

steam-runtime-system-info - examine the Steam runtime environment and diagnose potential issues

# SYNOPSIS

**steam-runtime-system-info**
[**--expectations** *PATH*]
[**--verbose**]

# DESCRIPTION

# OPTIONS

<dl>
<dt>

**--expectations** *PATH*

</dt><dd>

Path to a directory containing details of the libraries that are
expected to be available. By default, _$STEAM_RUNTIME_**/usr/lib/steamrt**
or **/usr/lib/steamrt** is used.

</dd>
<dt>

**--no-graphics-tests**

</dt><dd>

Don't check that graphics drivers work.
This avoids needing an X11 display, and can also save time if that
information is not required.

</dd>
<dt>

**--no-libraries**

</dt><dd>

Don't check shared libraries against expectations.
This saves time if that information is not required,
particularly when using an emulation framework like FEX-Emu that
can make process startup more expensive.

</dd>
<dt>

**--verbose**

</dt><dd>

Show additional information. This currently adds details of all the
expected libraries that loaded successfully.

</dd>
</dl>

# OUTPUT

The output is a JSON *object* (mapping, dictionary) with the following
keys:

**steam-runtime-system-info**
:   An object describing the version of **steam-runtime-system-info** used,
    with these keys:

    **version**
    :   The version number as a string, or **null** if loading a
        previously-generated JSON report that did not specify a version

    **path**
    :   The filesystem path to the executable, or **null** if it cannot
        be determined

**can-write-uinput**
:   A boolean value indicating whether **/dev/uinput** can be opened for
    writing. If this is **false**, the Steam Controller will not be able
    to emulate a keyboard, a mouse or a different game controller.

**steam-installation**
:   An object describing the Steam installation. The keys are strings:

    **path**
    :   A string: the absolute path to the Steam installation, typically
        containing **steam.sh** and **ubuntu12_32** among others.
        This is usually the same as **data_path** but can differ under some
        circumstances.

    **data_path**
    :   A string: the absolute path to the Steam data directory, typically
        containing **appcache**, **steamapps** and **userdata** among others.
        This is usually the same as **path** but can differ under some
        circumstances.

    **bin32_path**
    :   A string: the absolute path to the Steam "ubuntu12_32" directory,
        typically containing **steam-runtime** among others.
        This is usually a direct subdirectory of **path** but can differ under
        some circumstances.

    **steamscript_path**
    :   A string: if **steam-runtime-system-info** was run by Steam,
        the absolute path to the "bootstrapper" script used to launch
        Steam, typically **/usr/bin/steam** or **/usr/games/steam**.
        Otherwise, or if unavailable, it is **null**.

    **steamscript_version**
    :   A string: if **steam-runtime-system-info** was run by Steam,
        the version of the "bootstrapper" script used to launch
        Steam, for example **1.0.0.66** or **1.0.0.66-2/Debian**.
        Otherwise, or if unavailable, it is **null**.

    **ok**
    :   If **true** no Steam-installation-related problems were found.
        No other value is allowed:
        if problems were found,
        `issues` will be emitted instead.

    **issues**
    :   An array of strings representing problems with the Steam
        installation.

        **unknown** (or **internal-error** in older reports)
        :   An error occurred while checking the Steam installation.

        **cannot-find**
        :   The Steam installation could not be found.

        **cannot-find-data**
        :   The Steam data directory could not be found.

        **dot-steam-root-not-directory**
        :   **~/.steam/root** is not a (symbolic link to a) directory.
            Steam will probably not work.

        **dot-steam-root-not-symlink**
        :   **~/.steam/root** is not a symbolic link to the installation
            directory. Steam will probably not work.

        **dot-steam-steam-not-directory**
        :   **~/.steam/steam** is not a (symbolic link to a) directory.
            Steam will probably not work.

        **dot-steam-steam-not-symlink**
        :   **~/.steam/steam** is not a symbolic link to the data directory,
            for example due to
            [Debian bug #916303](https://bugs.debian.org/916303).

        **installed-in-usr**
        :   The Steam installation is under `/usr` which is not recommended.
            It must be outside `/usr` for the container runtime to work
            as intended.

        **missing-steam-uri-handler**
        :   There isn't a default desktop application that
            can handle `steam:` URIs.

        **steamscript-not-in-environment**
        :   The environment variable `STEAMSCRIPT` is not set.
            This is likely to be harmless,
            but indicates that the user has not run Steam via either
            Valve's `/usr/bin/steam`
            or a third-party script that identifies itself to the
            diagnostic tool by setting `STEAMSCRIPT`.

        **unexpected-steam-uri-handler**
        :   The default Steam desktop application ID is not what we expected.

        **unexpected-steam-desktop-id**
        :   The default Steam desktop application ID is not what we expected.

        **unexpected-steam-compat-client-install-path**
        :   If the environment `STEAM_COMPAT_CLIENT_INSTALL_PATH` is set,
            its realpath() is not the equivalent of `~/.steam/root`.

**runtime**
:   An object describing the `LD_LIBRARY_PATH`-based Steam Runtime.
    The keys are strings:

    **path**
    :   A string: the absolute path to the Steam Runtime.

    **version**
    :   The version number of the Steam Runtime, for example
        `0.20190711.3`.

    **ok**
    :   If **true** no Steam-Runtime-related problems were found.
        No other value is allowed:
        if problems were found,
        `issues` will be emitted instead.

    **issues**
    :   An array of strings representing problems with the Steam
        Runtime.

        **unknown** (or **internal-error** in older reports)
        :   An error occurred while checking the Steam Runtime.

        **disabled**
        :   The Steam Runtime has been explicitly disabled. This is
            intended for use by game and Steam Runtime developers, and
            is not supported.

        **not-runtime**
        :   The **STEAM_RUNTIME** environment variable does not point
            to a directory that looks like a Steam Runtime.

        **unofficial**
        :   The **STEAM_RUNTIME** environment variable points to an
            unofficial Steam Runtime build.

        **unexpected-location**
        :   The **STEAM_RUNTIME** environment variable points to a Steam
            Runtime that is not in the expected location in the Steam
            installation.

        **unexpected-version**
        :   The **STEAM_RUNTIME** environment variable points to a Steam
            Runtime that was not the expected version.

        **not-in-ld-path**
        :   The Steam Runtime does not appear in the **LD_LIBRARY_PATH**.
            Libraries from the Steam Runtime will not be found correctly.

        **not-in-path**
        :   The Steam Runtime does not appear in the **PATH**.
            Executables from the Steam Runtime will not be found correctly.

        **not-in-environment**
        :   The **STEAM_RUNTIME** environment variable is not set.

        **not-using-newer-host-libraries**
        :   "Pinned" shared libraries from the host system are not in
            their intended places in the **LD_LIBRARY_PATH**. This is
            likely to break the use of libraries from the host system,
            in particular the Mesa graphics drivers.

        **on-network-filesystem**
        :   The Steam Runtime is stored on a networked filesystem,
            which might make metadata operations unexpectedly slow.

        **on-non-unix-filesystem**
        :   The Steam Runtime is stored on a non-Unix filesystem
            which might not preserve permissions, ownership and other metadata.

        **on-unknown-filesystem**
        :   The Steam Runtime is stored on a filesystem not known
            to the diagnostic tool, or a virtual filesystem
            such as FUSE or overlayfs which could be backed
            by an unknown underlying filesystem.

    **overrides**
    :   An object representing the libraries that have been
        overridden when the Steam Runtime is running in a
        `pressure-vessel` container.
        These libraries are taken from the host system, instead of being
        taken from the container like all other libraries.

        **list**
        :   A human-readable array of overridden libraries.
            It is currently in `find -ls` format.

        **messages**
        :   A human-readable array of errors and warning messages about
            the overridden libraries.
            It is currently the output on standard error of `find -ls`.

    **pinned_libs_32**
    :   An object representing the `i386-linux-gnu` libraries that have been
        "pinned" when the Steam Runtime is running in an
        `LD_LIBRARY_PATH`-based environment.
        These libraries are taken from the Steam Runtime, even if a library
        of the same SONAME exists on the host system.

        **list**
        :   A human-readable array of `i386-linux-gnu` "pinned" libraries.
            It is currently in `find -ls` format.

        **messages**
        :   A human-readable array of errors and warning messages about the
            `i386-linux-gnu` "pinned" libraries.
            It is currently the output on standard error of `find -ls`.

    **pinned_libs_64**
    :   An object representing the `x86_64-linux-gnu` libraries that have been
        "pinned" when the Steam Runtime is running in an
        `LD_LIBRARY_PATH`-based environment.
        The format is the same as for **pinned_libs_32**.

**os-release**
:   An object describing the operating system or container in which
    **steam-runtime-system-info** was run. The keys and values are
    strings, and any field that is not known is omitted.

    If **steam-runtime-system-info** is run under a user-space emulation
    framework such as FEX-Emu, then the information shown here will reflect
    the execution environment that is presented to programs of the same
    architecture as **steam-runtime-system-info**, which is not necessarily
    the same as the machine on which the emulator is running.
    Information about the real machine, if available, is shown in
    **virtualization** → **host** → **os-release**.

    **id**
    :   A short lower-case string identifying the operating system,
        for example **debian** or **arch**. In a Steam Runtime
        chroot or container this will be **steamrt**.

        This is the **ID** from **os-release**(5).
        If **os-release**(5) is not available, future versions of this
        library might derive a similar ID from **lsb_release**(1).

    **id_like**
    :   An array of short lower-case strings identifying operating systems
        that this one was derived from. For example, Steam Runtime 1 'scout'
        is derived from Ubuntu, which is itself derived from Debian, so
        in a scout chroot or container this will be **["ubuntu", "debian"]**.

        This is the **ID_LIKE** field from **os-release**(5), split
        at whitespace. It does not include the **id**.

        If **os-release**(5) is not available, future versions of this
        library might derive a similar array from **lsb_release**(1)
        or from hard-coded knowledge of particular operating systems.

    **name**
    :   A human-readable name for the operating system without its
        version, for example **Debian GNU/Linux** or **Arch Linux**.

        This is the **NAME** from **os-release**(5).
        If **os-release**(5) is not available, future versions of this
        library might derive a similar name from **lsb_release**(1).

    **pretty_name**
    :   A human-readable name for the operating system, including its
        version if applicable, for example
        **Debian GNU/Linux 10 (buster)** or **Arch Linux**. For rolling
        releases like Debian testing/unstable and Arch Linux, this
        might be the same as **name**.

        This is the **PRETTY_NAME** from **os-release**(5).
        If **os-release**(5) is not available, future versions of this
        library might derive a similar name from **lsb_release**(1).

    **version_id**
    :   A short machine-readable string identifying the operating system,
        for example **10** for Debian 10 'buster'. In a
        Steam Runtime 1 'scout' chroot or container this will be **1**.
        In rolling releases like Debian testing/unstable and Arch Linux,
        this is likely to be omitted. It is not guaranteed to be numeric.

        This is the **VERSION_ID** from **os-release**(5).
        If **os-release**(5) is not available, future versions of this
        library might derive a similar ID from **lsb_release**(1).

    **version_codename**
    :   A short string identifying the operating system release codename,
        for example **buster** for Debian 10 'buster'. In a
        Steam Runtime 1 'scout' chroot or container this will be **scout**
        if present.

        In rolling releases like Debian testing/unstable and Arch Linux,
        and in operating systems like Fedora that have codenames but do
        not use them in a machine-readable context, this is likely to be
        omitted.

        This is the **VERSION_CODENAME** from **os-release**(5).
        If **os-release**(5) is not available, future versions of this
        library might derive a similar ID from **lsb_release**(1).

    **build_id**
    :   A short machine-readable string identifying the image from which
        the operating system was installed (depending on the operating
        system, it might have been upgraded since then). In operating
        systems with only non-image-based installation methods this will
        usually be omitted.

        In a Steam Runtime 1 'scout' chroot or container, if present this
        identifies the Steam Runtime build on which the chroot or container
        is based, such as **0.20190926.0** for an official build or
        **tools-test-0.20190926.0** for an unofficial build (but, again, it
        might have been upgraded since then).

        This is the **BUILD_ID** from **os-release**(5).

    **variant_id**
    :   A short machine-readable string identifying the variant or edition
        of the operating system, such as **workstation**.

        In a Steam Runtime 1 'scout' chroot or container built from a
        Flatpak-style runtime, this will currently be something like
        **com.valvesoftware.steamruntime.platform-amd64_i386-scout**.

        This is the **VARIANT_ID** from **os-release**(5).

    **variant**
    :   A human-readable string identifying the variant or edition
        of the operating system, such as **Workstation Edition**.

        In a Steam Runtime 1 'scout' chroot or container built from a
        Flatpak-style runtime, this will usually be **Platform** or **SDK**.

        This is the **VARIANT** from **os-release**(5).

    **fields**
    :   Additional fields from **os-release**(5), only logged if
        **--verbose** was used.

    **source_path**
    :   The source of this information, usually **/etc/os-release**
        but potentially another filename such as **/usr/lib/os-release**.

    **source_path_resolved**
    :   The physical location of the *source_path*.

    **messages**
    :   A human-readable array of diagnostic messages.

**virtualization**
:   Details of the virtual machine or emulator we are running in, if any.
    The keys are strings:

    **type**
    :   A short machine-readable string identifying the container type,
        such as
        **acrn**,
        **amazon**,
        **bhyve**,
        **bochs**,
        **fex-emu**,
        **kvm**,
        **microsoft** (Hyper-V),
        **oracle** (VirtualBox),
        **parallels**,
        **qemu**,
        **qnx**,
        **vmware**,
        **xen**,
        **unknown** (if we appear to be in a virtual machine but the type is
        unknown), or **none** (if we do not appear to be in a virtual machine).

    **host-machine**
    :   A short lower-case machine-readable string resembling ELF's **EM_**
        constants, identifying the CPU architecture that is running an
        emulator, such as **386**, **x86-64**, **aarch64** or **unknown**.

    **host**
    :   An object with additional details of the host machine:

        **os-release**
        :   The same as the **os-release** described above, but describing
            the host system rather than the virtualized or
            emulated environment.

        **path**
        :   Absolute path to a directory where important files from the
            host system can be found, or absent or **null** if unavailable.
            In FEX-Emu, this will typically be **/proc/self/root**, which
            bypasses its path virtualization.

    **interpreter-root**
    :   Absolute path to a directory that acts as a pseudo-overlay over
        the real root filesystem for file access by emulated processes,
        for example the **$FEX_ROOTFS** for FEX-Emu.

**container**
:   Details of the container we are running in, if any.
    The keys are strings:

    **type**
    :   A short machine-readable string identifying the container type,
        such as **flatpak**, **pressure-vessel**, **docker**,
        **unknown** (if we appear to be in a container but the type is
        unknown), or **none** (if we do not appear to be in a container).

    **bubblewrap_ok**
    :   If **true** no bubblewrap-related problems were found.
        No other value is allowed:
        if problems were found,
        `bubblewrap_issues` will be emitted instead.

    **bubblewrap_issues**
    :   An array of flags describing potential problems with **bwrap**(1),
        such as not having the necessary system configuration to be able
        to create new user namespaces as an unprivileged user.
        This key is not provided if the container **type** is **flatpak**,
        because we do not expect to be able to run **bwrap**(1)
        successfully inside a Flatpak sandbox.

    **bubblewrap_path**
    :   The path to the **bwrap**(1) executable that was used.
        This key is not provided unless either **--verbose** was
        used, or a problem was detected.

    **bubblewrap_messages**
    :   Human-readable array of lines with diagnostic messages related
        to **bwrap**(1), if any.
        This key is not provided if the array would be empty.

    **flatpak_ok**
    :   If **true** no Flatpak-related problems were found.
        No other value is allowed:
        if problems were found,
        `flatpak_issues` will be emitted instead.

    **flatpak_issues**
    :   An array of flags describing potential problems with Flatpak,
        such as a version that is too old or cannot create subsandboxes.
        This key is not provided if the container **type** is not **flatpak**.

    **flatpak_version**
    :   The version string describing the Flatpak container. This key is
        optional and is not provided if it could not be determined or if the
        container **type** is not **flatpak**.

    **host**
    :   An object describing the host system. The keys are strings:

        **path**
        :   Absolute path to a directory where important files from the
            host system can be found, or **null** if unavailable.
            In Flatpak and pressure-vessel, this will be either **/run/host**
            or **null*.

        **os-release**
        :   The same as the **os-release** described above, but describing
            the host system rather than the container.

**driver_environment**
:   An array of strings, in the form "NAME=VALUE", with the well-known driver environment
    variables that are currently set.
    For example Mesa has `MESA_LOADER_DRIVER_OVERRIDE`, VA-API has
    `LIBVA_DRIVER_NAME` and so on.
    If empty, no environment variables related to driver selection have been found.

**architectures**
:   An object with architecture-specific information. The keys are
    Debian-style *multiarch tuples* describing ABIs, as returned by
    `gcc -print-multiarch`: the multiarch tuples normally used on x86 PCs
    are `x86_64-linux-gnu` for 64-bit binaries and `i386-linux-gnu` for
    32-bit binaries (the multiarch tuple contains i386 even if they were
    built for an i486, i586 or i686 baseline instruction set).

    The values are objects with the following keys:

    **can-run**
    :   A boolean value indicating whether a simple executable for this
        architecture was run successfully.

    **libdl-LIB**
    :   A string containing the dynamic linker expansion of the literal token
        `$LIB`/`${LIB}`. See `ld.so(8)` section "Dynamic string tokens" for
        more details. However if an error occurred while trying to determine
        the expansion value, **libdl-LIB** will instead contain an object with
        the following details of the error:

        **error-domain**
        :   A machine-readable string indicating a category of errors.

        **error-code**
        :   A small integer indicating a specific error. Its meaning depends
            on the **error-domain**.

        **error**
        :   A human-readable error message.

    **libdl-PLATFORM**
    :   The same as the **libdl-LIB** described above, but describing the
        literal token `$PLATFORM`/`${PLATFORM}`.

    **runtime-linker**
    :   If the multiarch tuple is a known one, an object with the
        following keys and values describing the runtime linker **ld.so**(8):

        **path**
        :   The path required to run Steam binaries on this architecture,
            for example `/lib64/ld-linux-x86-64.so.2` on x86_64

        **resolved**
        :   The result of resolving symbolic links in **path** if possible,
            for example `/lib/x86_64-linux-gnu/ld-2.28.so` on
            Debian 10 x86_64

        If the runtime linker is detected to be missing or unusable,
        details of the error appear here:

        **error-domain**
        :   A machine-readable string indicating a category of errors.

        **error-code**
        :   A small integer indicating a specific error. Its meaning depends
            on the **error-domain**.

        **error**
        :   A human-readable error message.

    **libraries-ok**
    :   If **true** no loadable-library-related problems were found.
        No other value is allowed:
        if problems were found,
        `library-issues-summary` will be emitted instead.

    **library-issues-summary**
    :   A summary of issues found when loading the expected libraries,
        as an array of strings.

        **unknown** (or **internal-error** in older reports)
        :   There was an internal error while checking libraries.

        **cannot-load**
        :   At least one of the expected libraries could not be loaded.

        **missing-symbols**
        :   At least one of the expected libraries did not contain all
            the symbols that were expected, indicating use of an
            incompatible version.

        **misversioned-symbols**
        :   At least one of the expected libraries did not contain all
            the symbol versioning that was expected, indicating use of an
            incompatible version.

        **unknown-expectations**
        :   Details of the expected libraries were not found.

        **timeout**
        :   Helper timed out when executing.

        **missing-versions**
        :   Some of the expected version definitions were not present.

        **unversioned**
        :   The library was expected to have at least one version definition,
            but has no version definitions at all.
            Implies **missing-versions**.

    **library-details**
    :   An object representing shared libraries. If the **--verbose**
        option was used, all known libraries are listed here; if not,
        only the libraries with problems are listed.

        The keys are library SONAMEs such as **libc.so.6**. The values
        are objects with these string keys:

        **path**
        :   The absolute path to the library.

        **soname**
        :   The real SONAME of the library, which might be different from
            the name that was requested if it is a compatibility alias,
            or **null** if it could not be determined.

        **issues**
        :   Problems with the library, as arrays of the same strings
            described in **library-issues-summary** above.
            Only printed if any issue has been found.

        **missing-symbols**
        :   If the library has missing symbols they are listed here.

        **misversioned-symbols**
        :   If the library has missing versioned symbols, but the same
            symbol exists with an unexpected version or no version, they
            are listed here.

        **messages**
        :   Human-readable array of diagnostic messages.

    **graphics-details**
    :   An object representing graphics stacks. The keys are strings
        such as **glx/gl**, **egl_x11/glesv2** or **x11/vulkan**
        representing the combination of a window system interface and a
        rendering interface.

        Known window system interfaces:

        **x11**
        :   The X11 windowing system for Vulkan

        **glx**
        :   GLX, the traditional OpenGL API for X11

        **egl_x11**
        :   EGL, a windowing system interface for either OpenGL or OpenGL ES,
            rendering to an X11 window

        Known rendering interfaces:

        **gl**
        :   "Desktop" OpenGL

        **glesv2**
        :   OpenGL ES v2

        **vulkan**
        :   Vulkan

        **vdpau**
        :   VDPAU

        **va-api**
        :   VA-API

        The values are objects with the following string keys:

        **renderer**
        :   The renderer string describing the graphics device and/or driver,
            or **null** if it could not be determined

        **version**
        :   The version string describing the graphics API and/or driver,
            or **null** if it could not be determined

        **issues**
        :   Problems with this graphics stack, represented as an array
            of strings. Only printed if any issue has been found.

            **unknown** (or **internal-error** in older reports)
            :   There was an internal error while checking graphics support.

            **cannot-draw**
            :   The test to see if drawing works for the given graphics mode
                had an error and was unable to draw.

            **cannot-load**
            :   The necessary libraries could not be loaded, or a rendering
                context could not be created

            **software-rendering**
            :   This graphics stack appears to be using unaccelerated
                software rendering.

            **timeout**
            :   The test to check the given graphics mode timed out.

        **messages**
        :   Human-readable array of diagnostic messages.

        **devices**
        :   An array of objects describing the available graphics devices.
            It is currently printed only when the rendering interface is
            **vulkan**. Every object has the following keys:

            **name**
            :   The name of this graphics device, or **null** if it could
                not be determined.

            **api-version**
            :   The API version used by this graphics device, or **null**
                if it could not be determined.

            **driver-version**
            :   The driver version used by this graphics device, or **null**
                if it could not be determined.

            **vendor-id**
            :   The vendor ID of this graphics device, or **null** if it
                could not be determined.

            **device-id**
            :   The device ID of this graphics device, or **null** if it
                could not be determined.

            **type**
            :   The type of this graphics device, typically one of
                `integrated-gpu`, `discrete-gpu`, `virtual-gpu`,
                or `cpu` (denoting software rendering such as llvmpipe).

            **messages**
            :   Human-readable array of diagnostic messages.

            **issues**
            :   Problems with this graphics device, represented as an array
                of strings. Only printed if any issue has been found.
                The possible values are the same as the ones in the **issues**
                of **graphics-details**.

    **dri_drivers**
    :   An array of objects describing the Mesa DRI driver modules that have been
        found. These drivers are used by Mesa and by older versions of Xorg.
        Every object can have the following keys:

        **library_path**
        :   Path to the driver module that has been found.

        **library_path_resolved**
        :   Absolute path to the driver module that has been found.
            This key is present only if **library_path** is relative.

        **is_extra**
        :   A boolean value indicating whether the driver module is in an
            "unusual" location, probably not in the canonical search path.
            This key is optional and if is not provided, the default `false`
            value should be assumed.

    **gbm_backends**
    :   An array of objects describing the Mesa GBM backend modules that have been
        found. These backends are used by Mesa and by older versions of Xorg.
        Every object can have the following keys:

        **library_path**
        :   Path to the driver module that has been found.

        **library_path_resolved**
        :   Absolute path to the driver module that has been found.
            This key is present only if **library_path** is relative.

        **is_extra**
        :   A boolean value indicating whether the driver module is in an
            "unusual" location, probably not in the canonical search path.
            This key is optional and if is not provided, the default `false`
            value should be assumed.

    **va-api_drivers**
    :   An array of objects describing the VA-API driver modules that have been
        found. These drivers are used by the VA-API, either `libva.so.2` (the
        current version) or `libva.so.1` (a legacy version).
        Every object can have the following keys:

        **library_path**
        :   Path to the driver module that has been found.

        **library_path_resolved**
        :   Absolute path to the driver module that has been found.
            This key is present only if **library_path** is relative.

        **version**
        :   A short machine-readable string identifying the libva version
            this DRI driver is compatible with. The current possible values are
            either **libva1** or **libva2**. This key is optional and is not
            provided if the libva version could not be determined.

        **is_extra**
        :   A boolean value indicating whether the driver module is in an
            "unusual" location, probably not in the canonical search path.
            This key is optional and if is not provided, the default `false`
            value should be assumed.

    **vdpau_drivers**
    :   An array of objects describing the VDPAU driver modules that have been
        found. These drivers are used by the VDPAU `libvdpau.so.1`.
        Every object can have the following keys:

        **library_path**
        :   Path to the driver module that has been found.

        **library_path_resolved**
        :   Absolute path to the driver module that has been found.
            This key is present only if **library_path** is relative.

        **library_link**
        :   Content of the **library_path** symbolic link. This key is optional
            and if is not provided, it should be assumed that **library_path**
            was a regular file and not a symbolic link.

        **is_extra**
        :   A boolean value indicating whether the driver module is in an
            "unusual" location, probably not in the canonical search path.
            This key is optional and if is not provided, the default `false`
            value should be assumed.

    **glx_drivers**
    :   An array of objects describing the GLX ICD modules that have been
        found. These drivers provide the OpenGL API for the X Window System,
        and are used by the `libGL.so.1` or `libGLX.so.0` loaders provided by
        [GLVND](https://github.com/NVIDIA/libglvnd).
        Every object can have the following keys:

        **library_soname**
        :   SONAME of the ICD module that has been found.

        **library_path**
        :   Absolute path to the library that imlements the **library_soname**.

    **openxr-1-runtime**
    :   Details of the active OpenXR runtime for this architecture.
        Omitted from the report if there is no active OpenXR runtime.
        If present, it is an object with the following keys:

        **json_path**
        :   Path to the JSON manifest describing the runtime,
            for example `/usr/share/openxr/1/openxr_monado.json`

        **json_origin**
        :   Path at which the JSON manifest was discovered,
            for example `/etc/xdg/openxr/1/active_runtime.json`.
            Omitted if it would be the same as the **json_path**.

       **ok**
       :   If **true** no openxr-1-runtime problems were found.
           No other value is allowed:
           if problems were found,
           `issues` will be emitted instead.

        **issues**
        :   An array of strings representing problems with the ICD,
            in the same representation documented for EGL ICDs.

        and additionally the following keys and values if the metadata was
        loaded successfully:

        **library_path**, **dlopen**
        :   The same as documented for EGL ICDs.

        or the following keys and values if the metadata failed to load:

        **error-domain**, **error-code**, **error**
        :   The same as documented for EGL ICDs.

**locales-ok**
:   If **true** no locale-related problems were found.
    No other value is allowed:
    if problems were found,
    `locale-issues` will be emitted instead.

**locale-issues**
:   An array of strings indicating locale-related issues.

    **unknown** (or **internal-error** in older reports)
    :   There was an internal error while checking locale support.

    **default-missing**
    :   The system's configured locale is not available.

    **default-not-utf8**
    :   The system's configured locale is not a UTF-8 locale such as
        `en_US.UTF-8` or `de_DE.UTF-8`. This may cause problems in games
        and frameworks that assume that all strings are UTF-8, or that
        assume that all Unicode characters can be output.

    **c-utf8-missing**
    :   The special `C.UTF-8` locale provided by Debian and Fedora
        derivatives is not available. This may cause problems in games
        and frameworks that assume it is always present.

    **en-us-utf8-missing**
    :   The `en_US.UTF-8` locale is not available. This may cause
        problems in games and frameworks that assume it is always present.

    **i18n-supported-missing**
    :   The **SUPPORTED** file listing supported locales was not found
        in the expected location.
        This indicates that either locale data is not installed, or this
        operating system does not put it in the expected location.
        The Steam Runtime might be unable to generate extra locales if needed.

    **i18n-locales-en-us-missing**
    :   The **locales/en_US** file describing the USA English locale was
        not found in the expected location. This indicates that either
        locale data is not installed, or this operating system does not
        put it in the expected location, or only a partial set of locale
        source data is available. The Steam Runtime will be unable to
        generate extra locales if needed.

**locales**
:   An object describing locales. The keys are either **<default>** or
    a locale name. The values are objects containing either details of
    a locale:

    **resulting-name**
    :   The canonical name of the locale, which might differ from the
        name that was requested.

    **charset**
    :   The character set used by the locale, for example **UTF-8**.

    **is_utf8**
    :   Whether the locale appears to be UTF-8.

    or details of the error encountered when attempting to set a locale:

    **error-domain**
    :   A machine-readable string indicating a category of errors.

    **error-code**
    :   A small integer indicating a specific error. Its meaning depends
        on the **error-domain**.

    **error**
    :   A human-readable error message.

**egl**
:   An object describing EGL support. Currently the keys are
    **icds** and **external_platforms**.
    Their value is an array of objects describing ICDs
    such as `libEGL_mesa.so.0` or external platforms
    such as `libnvidia-egl-wayland.so.1`
    with the following keys and values:

    **json_path**
    :   Absolute path to the JSON file describing the ICD

    **ok**
    :   If **true** no egl problems were found.
        No other value is allowed:
        if problems were found,
        `issues` will be emitted instead.

    **issues**
    :   An array of strings representing problems with the ICD.

        **unknown**
        :   There was an unknown, or internal, error while checking the ICD.

        **unsupported**
        :   The API version of the ICD is not supported yet.

        **cannot-load**
        :   Unable to correctly load the ICD.

        **duplicated**
        :   This ICD, and another one, have a **library_path** that points to
            the same library.

        **api-subset**
        :   This driver is not fully compliant with the API spec,
            like for example a portability driver.

    and additionally the following keys and values if the metadata was
    loaded successfully:

    **library_path**
    :   The library as described in the JSON file: either an absolute
        path, a path relative to the JSON file containing at least one **/**,
        or a bare library name to be loaded from the system default library
        search path.

    **dlopen**
    :   The name to pass to **dlopen**(3), if it differs from
        **library_path**. This key/value pair is omitted if it would
        be the same as **library_path**. Currently, it is only shown
        if the **library_path** is relative, in which case **dlopen**
        is an absolute path formed by prefixing the directory part
        of **json_path** to **library_path**.

    or the following keys and values if the metadata failed to load:

    **error-domain**
    :   A machine-readable string indicating a category of errors.

    **error-code**
    :   A small integer indicating a specific error. Its meaning depends
        on the **error-domain**.

    **error**
    :   A human-readable error message.

**vulkan**
:   An object describing Vulkan support. Currently the keys are **icds**,
    **explicit_layers** and **implicit_layers**. For **icds**, its value is an
    array of objects describing ICDs, with the same keys and values as for EGL
    ICDs, plus the following extra keys:

    **api_version**
    :   Vulkan API version implemented by this ICD as a dotted-decimal
        string, for example **1.1.90**

    **library_arch**
    :   Optional key that specifies the architecture of the library
        associated with this ICD. The Vulkan specification only allows
        values **32** and **64**, but the reference Vulkan-Loader does
        not validate strictly, so other values here are possible.
        If this entry was not provided by the ICD, **library_arch** will be
        omitted.

    Instead, the value of **explicit_layers**, and **implicit_layers**, is an
    array of objects, where the former describes explicit Vulkan layers and
    the latter describes implicit Vulkan layers. They have the same keys and
    values as for Vulkan ICDs, with the differences that **library_path**
    might be omitted, if it is not present, and the **duplicated** issues
    signals that two layers not only have a **library_path** that points to
    the same library, but also that their **name** is the same.
    And finally they also have the following extra keys:

    **name**
    :   The name that uniquely identifies this layer to applications

    **description**
    :   Brief description of the layer

    **type**
    :   The type of the layer, expected to be either "GLOBAL" or "INSTANCE"

    **implementation_version**
    :   Version of the implemented layer

    **component_layer**
    :   An array of strings that identifies the component layer names that
        are part of a meta-layer. This will be omitted if **library_path**
        is used instead.

**openxr-1**
:   An object containing non-architecture-specific details of OpenXR 1
    runtimes and layers.
    It has the following keys:

    **active-fallback**
    :   The runtime that is active for unknown architectures,
        if any.
        Omitted from the report if there is no fallback.
        If present,
        the value is an object with the same keys and values as the
        per-architecture **openxr-1-runtime**.

    **inactive**
    :   A list of additional OpenXR runtimes that were not already shown
        as the active runtime in the per-architecture **openxr-1-runtime**
        or the non-architecture-specific **active-fallback**.
        Each item in the list is an object with the same keys and values
        as the per-architecture **openxr-1-runtime**.

    **explicit_layers**
    :   A list of OpenXR 1 explicit layers.
        Each item is an object with these members:

        **json_path**, **json_origin**
        :   The same as for OpenXR runtimes

        If the manifest was loaded successfully,
        the object has the following additional members:

        **name**
        :   The name that uniquely identifies this layer to applications,
            as a string

        **description**
        :   A brief description of the layer as a string

        **api_version**
        :   The major.minor version of the OpenXR 1 API that is implemented,
            as a string

        **implementation_version**
        :   The version of the layer implementation as a string

        If the manifest was not loaded successfully,
        instead it has **error-domain**, **error-code** and **error** members
        in the same encoding documented above for EGL ICDs.

    **implicit_layers**
    :   A list of OpenXR 1 implicit layers.
        Each item is an object with the same members documented above
        for **explicit_layers**.

**desktop-entries**
:   An array of objects describing the Steam related desktop entries
    that have been found.
    Every object can have the following keys:

    **id**
    :   A string with the ID of the application entry, such as `steam.desktop`.

    **commandline**
    :   A string with which the application will be started, such as
        `/usr/bin/steam %U`.

    **filename**
    :   Absolute path to the desktop entry file.

    **default_steam_uri_handler**
    :   A boolean value indicating whether this entry is the default used
        to open `steam:` URIs.

    **steam_uri_handler**
    :   A boolean value indicating whether this entry can open `steam:` URIs.

**display**
:   An object describing the display server that is currently in use.
    The keys are the strings:

    **environment**
    :   Environment variables that are usually responsible to affect the
        display server, represented as an array of strings in the form of
        "VARIABLE=VALUE".

    **wayland-session**
    :   A boolean value indicating whether the current session is using
        Wayland.

    **wayland-ok**
    :   If **true** no wayland-related problems were found.
        No other value is allowed:
        if problems were found,
        `wayland-issues` will be emitted instead.

    **wayland-issues**
    :   An array of strings representing problems with the Wayland session.

        **unknown**
        :   There was an unknown, or internal, error while checking Wayland
            status.

        **missing-socket**
        :   The Wayland socket from "WAYLAND_DISPLAY" or the default fallback
            "wayland-0", if unset, was not available in the filesystem.

    **x11-type**
    :   The type of the X11 server.

        **unknown**
        :   There was an unknown, or internal, error while checking the X11
            server.

        **missing**
        :   There wasn't an X11 server. This is likely a pure Wayland
            environment.

        **native**
        :   The server is a native X11 server.

        **xwayland**
        :   The X11 server is an XWayland server.

    **x11-messages**
    :   Human-readable array of lines with error messages about the X11
        display server. This element will not be printed if there aren't any
        error messages.

**xdg-portals**
:   An object describing the XDG portal support. Whether `xdg-desktop-portal`
    is installed, and working, and which portal backend implementations are
    available. The keys are the strings:

    **details**
    :   An object describing in details which XDG portals have been checked.
        The keys are the strings:

        **interfaces**
        :   An object describing XDG portal interfaces. The keys are the
            interface name. The values are objects containing details of
            of an interface:

            **available**
            :   A boolean value indicating whether this interface is available.

            **version**
            :   An integer representing the version property of this interface.

        **backends**
        :   An object describing XDG portal backends. The keys are the
            backend name. The values are objects containing details of
            of an interface:

            **available**
            :   A boolean value indicating whether this backend is available.

    **ok**
    :   If **true** no XDG-portal-related problems were found.
        No other value is allowed:
        if problems were found,
        `issues` will be emitted instead.

    **issues**
    :   Problems with the XDG portal support, represented as an array
        of strings.

        **unknown**
        :   There was an unknown error while checking XDG portal support.

        **timeout**
        :   The test to check the XDG portal support timed out.

        **missing-interface**
        :   At least one of the required XDG portal interfaces is missing.

        **no-implementation**
        :   There isn't a working XDG portal implementation.

    **messages**
    :   Human-readable array of lines with error messages about the XDG portal
        support. This element will not be printed if there aren't any error
        messages.

**cpu-features**
:   An object decribing some of the features that the CPU in use supports.
    Currently it has the following string keys, each with a boolean
    value indicating whether the CPU feature is present or absent:

    **x86-64**
    :   Whether the CPU supports the "Long mode", i.e. x86-64 architecture
        (listed as `lm` in `/proc/cpuinfo`).

    **sse3**
    :   Whether the CPU supports the SSE3 extension (Streaming SIMD Extensions
        3, listed as `pni` (Prescott New Instructions) in `/proc/cpuinfo`).

    **cmpxchg16b**
    :   Whether the CPU supports the CMPXCHG16B instruction
        (listed as `cx16` in `/proc/cpuinfo`).

# EXIT STATUS

0
:   **steam-runtime-system-info** ran successfully. Note that this does
    not mean that Steam games will run successfully: inspect the JSON
    output to see whether there are problems.

Nonzero
:   An error occurred.

# EXAMPLES

To examine the Steam Runtime:

    $ ~/.local/share/Steam/ubuntu12_32/steam-runtime/setup.sh
    Pins up-to-date!
    $ env \
    PATH="$(~/.local/share/Steam/ubuntu12_32/steam-runtime/setup.sh --print-bin-path):$PATH" \
    ~/.local/share/Steam/ubuntu12_32/steam-runtime/run.sh \
    steam-runtime-system-info

Or change the launch options for a Steam game to:

    xterm & %command%

then launch the game, and in the resulting **xterm**, run

    $ steam-runtime-system-info

(Note that Steam will not consider the game to have exited until the
**xterm** is closed.)

<!-- vim:set sw=4 sts=4 et: -->
