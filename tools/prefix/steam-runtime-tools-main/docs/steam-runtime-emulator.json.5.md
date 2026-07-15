---
title: steam-runtime-emulator.json
section: 5
...

<!-- This document:
Copyright © 2020-2025 Collabora Ltd.
SPDX-License-Identifier: MIT
-->

# NAME

steam-runtime emulator.json - manifest describing a CPU emulator

# SYNOPSIS

    {
      "emulator_v0": {
        "argv": ["./bin/emulator", "--quick", "--"],
        "container_argv": ["./bin/emulator", "--sysroot=/", "--"],
        "main_argv": ["./bin/emulator-wrapper", "--sysroot=/", "--"],
        "environment": { "MY_EMULATOR_RUNNING_UNDER_SLR": null },
        "container_environment": { "MY_EMULATOR_RUNNING_UNDER_SLR": "1" },
        "emulated_architectures": ["x86_64-linux-gnu", "i386-linux-gnu"],
        "required_architectures": ["aarch64-linux-gnu"],
        "required_libraries": ["libc.so.6", "libstdc++.so.6"],
        "server_argv": ["./bin/emulator-server", "--poll-stdin"]
      }
    }

# DESCRIPTION

An **emulator.json** file configures non-transparent CPU emulation,
without needing `binfmt_misc`.

Steam activates this feature by setting the environment variable
`STEAM_COMPAT_EMULATOR` when it launches a game of a foreign architecture
inside a container runtime.

This emulator is assumed to be appropriate for the *COMMAND*
that will be passed to **pressure-vessel-wrap**(1).

The emulator will be used to run programs of the `emulated_architectures`,
which will be appended to the `argv` command-line.
Programs of any architecture not listed there will be run directly.

If the emulator is not in `/usr`,
then the parent directory of the manifest must contain all of its dependencies,
other than what is provided by the runtime or the graphics stack.
That parent directory will automatically be shared with the container.

For example,
if the environment variable is
`STEAM_COMPAT_EMULATOR=/.../steamapps/common/MyEmulator/emulator.json`,
then that directory might look like this,
with `bin/emulator` linked using `-Wl,-rpath,${ORIGIN}/../lib`
so that it can find `libdependency.so.0`:

    .../steamapps/common/MyEmulator/
        emulator.json
        bin/
            emulator
        lib/
            libdependency.so.0

In this example,
**pressure-vessel-wrap**(1) will automatically share
`.../steamapps/common/MyEmulator` with the container,
but the rest of `.../steamapps/common` is not guaranteed to be available.

If the emulator manifest path specified in configuration involves any
symbolic links,
then it is resolved to a physical path as if via **realpath**(3)
before using it as a basis for relative paths.

The file contains a single JSON value as defined in RFC 7159,
which must be an *object*
(often represented in language bindings by a map or dictionary).

## FORMAT VERSION 0

Version 0 of the file format uses an **emulator_v0** key in the
top-level object.
The corresponding value must be another object.

### `argv` (string or array of strings)

The command-line to run the emulator.
This field is required.

The `argv` command-line may be either an array or a string.
If it is an array,
it must contain strings,
which are interpreted literally (no special parsing).

If it is a string,
it is split into items using a subset of shell syntax,
the same as `Exec` in the the Desktop Entry Specification.
See the documentation of GLib's `g_shell_parse_argv()` for details.
(For those who are more familiar with Python,
the restrictions are similar to `shlex.split` in the standard library.)

The first item of the command-line must either be an absolute path
such as `/usr/bin/qemu-arm`,
or a relative path containing `/`,
taken to be relative to the parent directory of the emulator manifest.
If there is no `/`,
parsing will fail.
The emulator itself must be an ELF executable:
it cannot be a shell script or another script starting with `#!`.

The remaining words of the command-line must be valid both outside and
inside the pressure-vessel container;
in particular,
they cannot usefully be filenames in `/usr` or in `/run/host`.
If necessary, the emulator executable can be a wrapper program that
locates itself with logic similar to `_srt_find_myself()`,
and then uses paths relative to its own location to find resources and
`execve()` the actual emulator.

### `container_argv` (string or array of strings)

The `container_argv` are encoded in the same way as `argv`,
but are used when running setup commands such as `ldconfig`
inside the container.
For example,
on an aarch64 system,
they might use a special executable that has its `DT_RPATH` set to search
`/usr/lib/pressure-vessel/overrides/aarch64-linux-gnu` for libraries.

This field is optional.
If not specified,
the default is to copy the `argv`.
The first argument (the executable) will have its path adjusted to reflect
its location inside the container if necessary,
for example replacing `/usr` with `/run/host/usr`.

### `container_environment` (object with string or null values)

Environment variables specified in `container_environment` are similar
to `environment` (below),
but they are only set or unset when the emulator is run inside the
pressure-vessel container.
If the same environment variable appears in both objects,
`container_environment` takes precedence.

This field is optional.
The default is an empty object.

### `emulated_architectures` (array of strings)

The architectures or ABIs that can be emulated by this emulator,
represented as [multiarch tuples][].
This field is required,
and must list at least one architecture.

For example,
[FEX][] can emulate `x86_64-linux-gnu` and `i386-linux-gnu`.

### `environment` (object with string or null values)

Environment variables to set or unset.

Environment variables specified in `environment` are set as if via
**setenv**(3) whenever the emulator is invoked,
either outside or inside the pressure-vessel container.

The values must either be JSON strings,
or the special JSON literal `null` to unset the variable
(remove it from the environment) instead,
as if via **unsetenv**(3).

Other JSON values
(numbers, arrays, objects, `true` or `false`)
are an error and will cause parsing of the file to fail.

This field is optional.
The default is an empty object.

### `main_argv` (string or array of strings)

The `main_argv` are similar to the `container_argv`,
but are only used when running the main *COMMAND*
passed to **pressure-vessel-wrap**(1)
(the application, game or compatibility tool)
inside the container.
For example,
they might use a wrapper executable that applies game-specific configuration
before starting the actual emulator.
If not specified,
the default is to copy the `container_argv` or the `argv`.

### `required_architectures` (array of strings)

The [multiarch tuples][] representing the architectures that this
emulator requires to be provided inside the container.
**pressure-vessel-wrap**(1) uses this information to arrange for an
appropriate **ld.so**(8) and libraries to be available.

This field is optional.
If not specified,
the default is to assume that the emulator does not need any architectures
(for example it might be a statically-linked ELF executable,
which does not require **ld.so**(8)).

### `required_libraries` (array of strings)

The ELF `DT_SONAME` of each shared library that this emulator requires
to be provided for the `required_architectures` inside the container.

This field is optional.
If not specified,
the default is to assume that the emulator does not need any shared
libraries (for example it might be statically-linked).

### `server_argv` (string or array of strings)

The `server_argv` are encoded in the same way as `argv`.
Instead of being prepended to a command to execute,
they are used to start a server associated with a particular game
instance running under the emulator.
For example,
[FEX][] uses `FEXServer` to cache translated code,
amortizing the cost of translation across multiple processes,
and centralize logging.

This field is optional.
If not specified,
no server is started.

The server will receive the write end of a pipe as its standard output.
When it has carried out any setup that is necessary
(for example listening on a socket)
and is ready for the `argv`,
`container_argv` and/or
`main_argv`
to be started,
it should write "READY=1" followed by a newline (8 bytes) to the pipe,
then close the pipe,
causing end-of-file to be detected by the reader.
Any other output lines before this string are reserved for future use,
and output lines after this string are an error.
The compatibility tool that launched the server should not run other
emulator processes until after it detects end-of-file on the read end
of this pipe.

The server will receive the read end of a pipe as its standard input.
It should poll the pipe's status
using an event loop or a suitable syscall such as **poll**(2),
read anything that becomes available,
and exit gracefully when end-of-file is reached.
The compatibility tool that launched the server should close the write
end of the pipe when the server is no longer needed.

The server may write unstructured human-readable diagnostic messages
to standard error.
The compatibility tool that launched the server should arrange for these
messages to go to a reasonable destination:
for example,
this might be the same place that game output is sent.

## COMPATIBILITY

If a new version of **pressure-vessel-wrap**(1) or other Steam compatibility
infrastructure requires file format changes,
then it should introduce a new top-level item such as `emulator_v1`.

Consumers of this file format should accept and ignore object members
that they do not understand,
allowing for backward-compatibility.
In particular,
if the file contains both `emulator_v0` and `emulator_v1`,
then older versions of the compatibility infrastructure may continue to
parse and use `emulator_v0`,
ignoring `emulator_v1`.

If there is an incompatible semantic break that causes older compatibility
infrastructure to be incompatible with a new emulator,
then the `emulator_v0` top-level item should be removed,
leaving only `emulator_v1`.
Older consumers of the file format should treat the absence of
`emulator_v0` as a fatal error and refuse to parse the file.

If a consumer of this file format encounters an object member that it
understands,
with an invalid type or value
(for example `environment` set to an array rather than an object,
or a `null` entry in `argv`),
then it should treat that as a fatal error and refuse to parse the file.

# EXAMPLE

A manifest describing [FEX][] might look like this:

    {
      "emulator_v0": {
        "argv": "usr/bin/FEXInterpreter",
        "environment": { "FEX_PORTABLE": "1" },
        "container_environment": { "FEX_ROOTFS": "" },
        "main_argv": "./fex-compat-tool-bin --",
        "emulated_architectures": ["x86_64-linux-gnu", "i386-linux-gnu"],
        "required_architectures": ["aarch64-linux-gnu"],
        "required_libraries": ["libc.so.6", "libstdc++.so.6"]
      }
    }

When launching an x86 game on an aarch64 system inside a
pressure-vessel-based container,
Steam could activate this emulator by doing the equivalent of:

    export STEAM_COMPAT_EMULATOR=…/FEX-Emu/emulator.json
    # see steam-runtime-graphics-provider.json(5)
    export STEAM_COMPAT_GRAPHICS_PROVIDER=…/graphics-provider.json

and then using an exec chain that is similar to what it would do for an
x86 game on x86 or an aarch64 game on aarch64:

    "…/steam-launch-wrapper" … -- \
    "…/reaper" SteamLaunch … -- \
    "…/SteamLinuxRuntime_sniper/_v2-entry-point" --verb=waitforexitandrun -- \
    "/path/to/game/executable"

# SEE ALSO

* **steam-runtime-graphics-provider.json**(5)
* **pressure-vessel-wrap**(1)
* `SrtEmulator` in [steam-runtime-tools][] source code

[FEX]: https://github.com/FEX-Emu/FEX
[multiarch tuples]: https://wiki.debian.org/Multiarch/Tuples
[steam-runtime-tools]: https://gitlab.steamos.cloud/steamrt/steam-runtime-tools

<!-- vim:set sw=4 sts=4 et: -->
