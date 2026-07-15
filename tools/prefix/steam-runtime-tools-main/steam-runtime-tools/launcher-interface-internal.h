/*<private_header>*/
/*
 * steam-runtime-launcher-interface-0 — convenience interface for compat tools
 *
 * Copyright © 2020-2025 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

/* This header is used by "pure glibc" code that does not use GLib.
 * NO GLIB DEPENDENCIES HERE PLEASE
 * Add them to launcher-internal.h instead. */

#pragma once

#include <stddef.h>

#define DBUS_NAME_DBUS "org.freedesktop.DBus"
#define DBUS_INTERFACE_DBUS DBUS_NAME_DBUS
#define DBUS_INTERFACE_PEER DBUS_INTERFACE_DBUS ".Peer"
#define DBUS_PATH_DBUS "/org/freedesktop/DBus"

#define LAUNCHER_INSIDE_APP_PREFIX "com.steampowered.App"
#define LAUNCHER_NAME_ALONGSIDE_STEAM "com.steampowered.PressureVessel.LaunchAlongsideSteam"
#define LAUNCHER_IFACE "com.steampowered.PressureVessel.Launcher1"
#define LAUNCHER_PATH "/com/steampowered/PressureVessel/Launcher1"

typedef enum
{
  PV_LAUNCH_FLAGS_CLEAR_ENV = (1 << 0),
  PV_LAUNCH_FLAGS_NONE = 0,
  PV_LAUNCH_FLAGS_MASK = (
    PV_LAUNCH_FLAGS_CLEAR_ENV |
    PV_LAUNCH_FLAGS_NONE
  ),
} PvLaunchFlags;

/* Chosen to be similar to env(1) */
enum
{
  LAUNCH_EX_USAGE = 125,
  LAUNCH_EX_FAILED = 125,
  LAUNCH_EX_CANNOT_INVOKE = 126,
  LAUNCH_EX_NOT_FOUND = 127,
  LAUNCH_EX_CANNOT_REPORT = 255
};

#define STEAM_COMPAT_LAUNCHER_SERVICE_ENVVAR "STEAM_COMPAT_LAUNCHER_SERVICE"
#define STEAM_COMPAT_LAUNCHER_SERVICE_LAYER_CONTAINER_RUNTIME "container-runtime"
#define STEAM_COMPAT_LAUNCHER_SERVICE_LAYER_PROTON "proton"
#define STEAM_COMPAT_LAUNCHER_SERVICE_LAYER_SCOUT_IN_CONTAINER "scout-in-container"

const char * const *_srt_launcher_interface_get_options (size_t *argc_out);
