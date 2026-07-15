/*
 * Copyright © 2020-2022 Collabora Ltd.
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
#include <glib/gstdio.h>
#include <glib-object.h>

#include "steam-runtime-tools/env-overlay-internal.h"
#include "steam-runtime-tools/glib-backports-internal.h"
#include "steam-runtime-tools/resolve-in-sysroot-internal.h"
#include "steam-runtime-tools/utils-internal.h"
#include "libglnx.h"

#include "flatpak-bwrap-private.h"
#include "flatpak-exports-private.h"
#include "flatpak-utils-base-private.h"
#include "graphics-provider.h"
#include "runtime-flags.h"
#include "runtime-library-data.h"
#include "utils.h"

/* If we're in an emulator like FEX-Emu, we need to use the host
 * OS's /usr as our real root directory, and set the runtime up
 * in a different directory. We use /run/p-v/interpreter-root
 * for the latter. */
#define PV_RUNTIME_PATH_INTERPRETER_ROOT "/run/pressure-vessel/interpreter-root"

typedef enum
{
  PV_RUNTIME_EMULATION_ROOTS_BOTH,
  PV_RUNTIME_EMULATION_ROOTS_REAL_ONLY,
  PV_RUNTIME_EMULATION_ROOTS_INTERPRETER_ONLY
} PvRuntimeEmulationRoots;

typedef struct _PvRuntime PvRuntime;
typedef struct _PvRuntimeClass PvRuntimeClass;

#define PV_TYPE_RUNTIME (pv_runtime_get_type ())
#define PV_RUNTIME(obj) (G_TYPE_CHECK_INSTANCE_CAST ((obj), PV_TYPE_RUNTIME, PvRuntime))
#define PV_RUNTIME_CLASS(cls) (G_TYPE_CHECK_CLASS_CAST ((cls), PV_TYPE_RUNTIME, PvRuntimeClass))
#define PV_IS_RUNTIME(obj) (G_TYPE_CHECK_INSTANCE_TYPE ((obj), PV_TYPE_RUNTIME))
#define PV_IS_RUNTIME_CLASS(cls) (G_TYPE_CHECK_CLASS_TYPE ((cls), PV_TYPE_RUNTIME))
#define PV_RUNTIME_GET_CLASS(obj) (G_TYPE_INSTANCE_GET_CLASS((obj), PV_TYPE_RUNTIME, PvRuntimeClass)
GType pv_runtime_get_type (void);

PvRuntime *pv_runtime_new (const char *source,
                           const char *variable_dir,
                           const char *bubblewrap,
                           GArray *architectures,
                           GPtrArray *providers,
                           const char *home,
                           const char * const *original_environ,
                           SrtSubprocessRunner *run_in_current_context,
                           PvRuntimeFlags flags,
                           PvWorkaroundFlags workarounds,
                           GError **error);

gboolean pv_runtime_get_adverb (PvRuntime *self,
                                FlatpakBwrap *adverb_args,
                                GError **error);
SrtEmulator *pv_runtime_get_emulator_in_container (PvRuntime *self);
const char *pv_runtime_get_helpers_dir_in_container (PvRuntime *self);
gboolean pv_runtime_bind (PvRuntime *self,
                          FlatpakExports *exports,
                          FlatpakBwrap *bwrap,
                          SrtEnvOverlay *container_env,
                          GError **error);
const char *pv_runtime_get_modified_usr (PvRuntime *self);
const char *pv_runtime_get_modified_app (PvRuntime *self);
const char *pv_runtime_get_overrides (PvRuntime *self);
void pv_runtime_cleanup (PvRuntime *self);

gboolean pv_runtime_garbage_collect_legacy (const char *variable_dir,
                                            const char *runtime_base,
                                            SrtDirentCompareFunc arbitrary_dirent_order,
                                            GError **error);

gboolean pv_runtime_use_shared_sockets (PvRuntime *self,
                                        FlatpakBwrap *bwrap,
                                        SrtEnvOverlay *container_env,
                                        GError **error);

gboolean pv_runtime_has_library (PvRuntime *self,
                                 const char *library);

void pv_runtime_log_overrides (PvRuntime *self);
void pv_runtime_log_container (PvRuntime *self);

/* Only exposed for testing purposes */
gboolean pv_runtime_bind_into_container (PvRuntime *self,
                                         FlatpakBwrap *bwrap,
                                         const char *host_path,
                                         const void *content,
                                         gssize content_size,
                                         const char *path,
                                         PvRuntimeEmulationRoots roots,
                                         GError **error);
gboolean pv_runtime_make_symlink_in_container (PvRuntime *self,
                                               FlatpakBwrap *bwrap,
                                               const char *target,
                                               const char *path,
                                               PvRuntimeEmulationRoots roots,
                                               GError **error);
SrtSysroot *pv_runtime_get_mutable_sysroot (PvRuntime *self);

G_DEFINE_AUTOPTR_CLEANUP_FUNC (PvRuntime, g_object_unref)

gboolean pv_runtime_path_belongs_in_interpreter_root (PvRuntime *self,
                                                      const char *path);
/*
 * PvAppFrameworkPath:
 * @path: (type filename): An absolute path
 * @ignore_if: Ignore this path if the given workaround is active
 * @bug: Something to log as a reason if we ignore the path
 */
typedef struct
{
  const char *path;
  PvWorkaroundFlags ignore_if;
  const char *bug;
} PvAppFrameworkPath;

const PvAppFrameworkPath *pv_runtime_get_other_app_framework_paths (void);
gboolean path_visible_in_provider_namespace (PvRuntimeFlags flags,
                                             const char *path);
