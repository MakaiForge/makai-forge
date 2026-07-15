/*
 * Copyright © 2014-2019 Red Hat, Inc
 * Copyright © 2017-2021 Collabora Ltd.
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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library. If not, see <http://www.gnu.org/licenses/>.
 */

#pragma once

#include <glib.h>

#include "steam-runtime-tools/architecture-internal.h"
#include "steam-runtime-tools/bwrap-internal.h"
#include "steam-runtime-tools/env-overlay-internal.h"
#include "steam-runtime-tools/utils-internal.h"

#include "bwrap.h"
#include "flatpak-bwrap-private.h"
#include "flatpak-exports-private.h"
#include "runtime.h"
#include "wrap-context.h"
#include "wrap-discord.h"
#include "wrap-home.h"
#include "wrap-openxr.h"
#include "wrap-pipewire.h"
#include "utils.h"

gchar *pv_wrap_check_bwrap (SrtSubprocessRunner *runner,
                            gboolean only_prepare,
                            SrtBwrapFlags *flags_out,
                            GError **error);

FlatpakBwrap *pv_wrap_share_sockets (PvWrapContext *self,
                                     SrtEnvOverlay *container_env,
                                     const char * const *original_environ,
                                     gboolean using_a_runtime,
                                     gboolean is_flatpak_env);

void pv_wrap_set_icons_env_vars (SrtEnvOverlay *container_env,
                                 const char * const *original_environ);

gboolean pv_wrap_use_host_os (int root_fd,
                              FlatpakExports *exports,
                              FlatpakBwrap *bwrap,
                              SrtDirentCompareFunc arbitrary_dirent_order,
                              PvWorkaroundFlags workarounds,
                              GError **error);

gboolean pv_export_root_dirs_like_filesystem_host (int root_fd,
                                                   FlatpakExports *exports,
                                                   FlatpakFilesystemMode mode,
                                                   SrtDirentCompareFunc arbitrary_dirent_order,
                                                   GError **error);

void pv_wrap_move_into_scope (const char *steam_app_id);

gboolean pv_wrap_maybe_load_nvidia_modules (SrtSubprocessRunner *runner,
                                            GError **error);

void pv_wrap_detect_virtualization (SrtSysroot **interpreter_root_out,
                                    const SrtKnownArchitecture **host_machine_out);

void pv_share_temp_dir (FlatpakExports *exports,
                        SrtEnvOverlay *container_env);
void pv_bind_and_propagate_from_environ (PvWrapContext *self,
                                         PvHomeMode home_mode,
                                         SrtEnvOverlay *container_env);

gboolean pv_wrap_setup_export_filesystems (PvWrapContext *self,
                                           GError **error);
