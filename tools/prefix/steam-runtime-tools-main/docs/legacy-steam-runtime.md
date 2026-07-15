# Legacy Steam Runtime compatibility tool

<!-- This document:
Copyright 2022-2026 Collabora Ltd.
SPDX-License-Identifier: MIT
-->

The Legacy Steam Runtime compatibility tool provides the
[legacy `LD_LIBRARY_PATH` runtime][ldlp]
packaged as a Steam compatibility tool.

It can be used to run older Steam games that were compiled to target
Steam Runtime 1 'scout' (compatible with Ubuntu 12.04)
or older operating system versions,
even in newer versions of Steam where the Steam Client itself does not
run in that environment.

It's also intended to be used to run legacy versions of Proton
(Proton 5.0 and older)
in those newer Steam Client versions.

## How it works

The Legacy Steam Runtime is a Steam compatibility tool,
distributed via the Steampipe system
(app ID 4690330).
It can be installed into any Steam Library directory:
typically it will be
`~/.local/share/Steam/steamapps/common/LegacySteamRuntime`
or the `steamapps/common/LegacySteamRuntime` subdirectory of a
user-configured Steam Library.

It is installed automatically when a Steam user selects
*Legacy Steam Runtime* in the Compatibility tab of a compatible game's
Properties.
It can also be installed manually,
for example by running `steam steam://install/4690330`.

The runtime infrastructure sets up an `LD_LIBRARY_PATH` environment
variable which combines two sources of libraries:

 1. Whatever version is included in the host system,
    if any.
    These libraries are typically found below `/usr/`.
 2. Whatever version is included in the legacy runtime,
    specifically a copy of Steam Runtime 1 'scout' in the
    `steamapps/common/LegacySteamRuntime/steam-runtime/` directory.
    Most of these libraries were originally taken from Ubuntu 12.04,
    with selected key libraries such as SDL and Vulkan-Loader
    backported from newer Ubuntu and Debian releases.

Documentation in the `steamrt` "metapackage" provides
[more information about scout][scout].

Each library required by a game or application is chosen like this:

  * If the library is not provided by the Steam Runtime, then the version
    from the operating system or user configuration is used.

      * The C runtime library (`glibc`) cannot be provided by the
        Steam Runtime for technical reasons involving cross-distribution
        compatibility.
        Steam has to rely on the operating system to provide 32- and 64-bit
        `glibc`.
      * Graphics drivers are also not provided by the Steam Runtime,
        because this would prevent Steam from working correctly on the
        latest GPUs.

  * In general, if there is a version of the library provided by the
    operating system or user configuration, with:

      * the same word size that is required (32-bit or 64-bit)
      * the same `SONAME`, indicating drop-in compatibility with the
        version in `scout`
      * a version equal to or greater than the version of the equivalent
        library in `scout`

    then that library will be used.

  * If the library in `scout` is *newer* than the library provided by the
    operating system, then the library from `scout` must be used.
    This is because games that were compiled against `scout` might be
    relying on newer features that are not available in the operating
    system's version of the library.

  * Otherwise, the library from `scout` is used.
    This ensures that games compiled against older libraries like
    `libpng12.so.12` can run successfully, even if the operating system
    no longer provides a compatible library.

  * A small number of libraries that are known to have suffered from
    compatibility breaks in the past are always taken from `scout`,
    even if the operating system provides a version that claims to be
    compatible.
    This ensures that games that use these libraries will see a
    compatible version.
    For example, `libcurl` has special treatment.
    These libraries are said to have been "pinned", by adding symbolic
    links in the `pinned_libs_32` and/or `pinned_libs_64` directories.

The logic to implement this can be found in the
`steamapps/common/LegacySteamRuntime/steam-runtime/setup.sh` and
`steamapps/common/LegacySteamRuntime/steam-runtime/run.sh` scripts,
which make use of tools from the [steam-runtime-tools][] project.

## Why this runtime is deprecated

When a game runs in the Legacy Steam Runtime,
it can technically use any library from the host operating system,
even if the library is a SONAME that is not guaranteed to be provided
by the Steam Runtime,
and it is easy for this situation to happen accidentally if the developer
is not careful.
This means that the game will work as expected on some host operating
systems
(the ones that happen to provide the required library)
but will not work on different host OSs
(those that do not provide the required library),
or on older or newer versions of the same host OS,
or even on different installations of the same host OS version
(for example if a different desktop environment was chosen during
installation).

It has also been necessary to patch several of the libraries in the
Legacy Steam Runtime to be able to load plugins from within the scout
environment,
instead of attempting to load plugins from the host system's `/usr`
as they would normally do,
which increases the complexity of backporting newer versions or fixing bugs.

More technical background on the Steam Runtime,
and the limitations of the `LD_LIBRARY_PATH` approach,
can be found in a talk recorded at FOSDEM 2020: [Containers and Steam][].

### What to use instead

It is preferable for Steam games on Linux to use a [container runtime][]
from the Steam Linux Runtime series,
which remains as consistent as possible over time.
This increases the chance that if a game works as intended on the developer's
chosen OS today,
then it will also work similarly on all of the other available Linux-based OSs,
and will continue to work on newer versions of all of those OSs,
5 years into the future.
The [*Steam Linux Runtime 1.0 (scout)*][scout-on-soldier]
compatibility tool is the closest equivalent of the Legacy Steam Runtime
that uses this container technology.

Developers of actively-maintained games can upgrade from one major
version of the Steam Linux Runtime to the next at their own pace,
to benefit from improvements in newer runtime releases.
For example,
if a developer's game is currently at version 6.x,
based on SDL 2 and running on Steam Linux Runtime 3.0,
while working on a version 7.0 major update the developer
might choose to either stay on SDL 2 and SLR 3.0,
or upgrade to SDL 3 and SLR 4.0.

## Reporting issues

Bugs and issues in the Legacy Steam Runtime should be reported to the
[steam-runtime project on Github][Steam Runtime issues].

Because of the way the Legacy Steam Runtime works,
many bugs and issues will not be possible to fix,
and behaviour changes in the host operating system will often break games
that have been configured to run in the Legacy Steam Runtime.
Using the [*Steam Linux Runtime 1.0 (scout)*][scout-on-soldier]
compatibility tool instead is recommended.

## Acknowledgements

The libraries included in the container runtimes are derived
from [Debian][] and [Ubuntu][] packages,
and indirectly from various upstream projects.
See the copyright information included in the Steam Runtime for details.

<!-- References -->

[Containers and Steam]: https://archive.fosdem.org/2020/schedule/event/containers_steam/
[Debian]: https://www.debian.org/
[Steam Runtime issues]: https://github.com/ValveSoftware/steam-runtime/issues
[Ubuntu]: https://ubuntu.com/
[container runtime]: container-runtime.md
[ldlp]: ld-library-path-runtime.md
[scout]: https://gitlab.steamos.cloud/steamrt/steamrt/-/blob/steamrt/scout/README.md
[scout-on-soldier]: container-runtime.md#scout-on-soldier
[steam-runtime-tools]: https://gitlab.steamos.cloud/steamrt/steam-runtime-tools
