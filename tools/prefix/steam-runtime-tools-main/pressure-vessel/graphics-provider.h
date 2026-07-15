/*
 * Copyright © 2020-2025 Collabora Ltd.
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
#include <glib-object.h>

#include "steam-runtime-tools/glib-backports-internal.h"
#include "libglnx.h"

#include <steam-runtime-tools/steam-runtime-tools.h>

#include "steam-runtime-tools/architecture-internal.h"
#include "steam-runtime-tools/graphics-provider-internal.h"
#include "steam-runtime-tools/resolve-in-sysroot-internal.h"
#include "steam-runtime-tools/subprocess-internal.h"

#include "runtime-flags.h"

typedef struct _PvGraphicsProvider PvGraphicsProvider;
typedef struct _PvGraphicsProviderClass PvGraphicsProviderClass;

struct _PvGraphicsProvider
{
  GObject parent;

  /* All public members are read-only after initable_init(), which means
   * it's OK to access this object from more than one thread. */
  SrtGraphicsProvider *details;
  SrtSubprocessRunner *run_in_current_context;
  SrtSubprocessRunner *run_in_sysroot;
  SrtSysroot *in_current_ns;
  gchar *path_in_container_ns;
  gchar *path_in_host_ns;
  PvGraphicsProviderFlags flags;
};

struct _PvGraphicsProviderClass
{
  GObjectClass parent;
};

#define PV_TYPE_GRAPHICS_PROVIDER (pv_graphics_provider_get_type ())
#define PV_GRAPHICS_PROVIDER(obj) (G_TYPE_CHECK_INSTANCE_CAST ((obj), PV_TYPE_GRAPHICS_PROVIDER, PvGraphicsProvider))
#define PV_GRAPHICS_PROVIDER_CLASS(cls) (G_TYPE_CHECK_CLASS_CAST ((cls), PV_TYPE_GRAPHICS_PROVIDER, PvGraphicsProviderClass))
#define PV_IS_GRAPHICS_PROVIDER(obj) (G_TYPE_CHECK_INSTANCE_TYPE ((obj), PV_TYPE_GRAPHICS_PROVIDER))
#define PV_IS_GRAPHICS_PROVIDER_CLASS(cls) (G_TYPE_CHECK_CLASS_TYPE ((cls), PV_TYPE_GRAPHICS_PROVIDER))
#define PV_GRAPHICS_PROVIDER_GET_CLASS(obj) (G_TYPE_INSTANCE_GET_CLASS((obj), PV_TYPE_GRAPHICS_PROVIDER, PvGraphicsProviderClass)
GType pv_graphics_provider_get_type (void);

gboolean pv_graphics_provider_has_architecture (PvGraphicsProvider *self,
                                                GQuark tuple);
void pv_graphics_provider_add_architecture (PvGraphicsProvider *self,
                                            GQuark tuple);
const GQuark *pv_graphics_provider_get_architectures (PvGraphicsProvider *self,
                                                      gsize *n);

gchar *pv_graphics_provider_search_in_path_and_bin (PvGraphicsProvider *self,
                                                    const gchar *search_paths,
                                                    const gchar *program_name);

SrtSystemInfo *pv_graphics_provider_get_system_info (PvGraphicsProvider *self,
                                                     GQuark arch_specific);

G_DEFINE_AUTOPTR_CLEANUP_FUNC (PvGraphicsProvider, g_object_unref)

GPtrArray *pv_graphics_provider_build_array (SrtSubprocessRunner *run_in_current_context,
                                             const char *provider_path,
                                             GHashTable *quark_to_provider,
                                             const GQuark *tuples,
                                             gsize n_tuples,
                                             const SrtKnownArchitecture *host_machine,
                                             PvRuntimeFlags flags,
                                             GError **error);
