/*<private_header>*/
/*
 * steam-runtime-launcher-service — accept IPC requests to create child processes
 *
 * Copyright © 2020 Collabora Ltd.
 *
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.	 See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library. If not, see <http://www.gnu.org/licenses/>.
 */

#pragma once

#include <sys/socket.h>
#include <sys/un.h>

#include <glib.h>
#include <gio/gio.h>

#include "steam-runtime-tools/glib-backports-internal.h"
#include "libglnx.h"

#include "steam-runtime-tools/launcher-interface-internal.h"
#include "steam-runtime-tools/launcher1.h"

/* Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx */
#define PV_UUID_STRLEN 36

#define PV_MAX_SOCKET_DIRECTORY_LEN 64

/* If ${socket_directory} is no longer than PV_MAX_SOCKET_DIRECTORY_LEN,
 * then struct sockaddr_un.sun_path is long enough to contain
 * "${socket_directory}/${uuid}\0" */
G_STATIC_ASSERT (sizeof (struct sockaddr_un) >=
                 (G_STRUCT_OFFSET (struct sockaddr_un, sun_path) +
                  PV_MAX_SOCKET_DIRECTORY_LEN +
                  PV_UUID_STRLEN +
                  2));
