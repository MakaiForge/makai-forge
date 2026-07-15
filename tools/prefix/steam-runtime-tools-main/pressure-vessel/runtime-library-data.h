/*
 * Copyright © 2020-2025 Collabora Ltd.
 *
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

#pragma once

#include "steam-runtime-tools/glib-backports-internal.h"
#include "libglnx.h"

#include "graphics-provider.h"

/*
 * PvRuntimeLibraryData:
 * @paths: An ordered, unique list of paths found in some architecture's
 *  graphics provider. Paths found in the highest-precedence architecture
 *  (normally x86_64) come first. The values are owned by the GPtrArray.
 * @paths_to_provider: A map from unique paths from @paths to
 *  the graphics provider in which they were first found.
 *  The keys are borrowed from @paths. The values are owned references.
 *
 * An ordered map from the paths of data files associated with a library
 * to the highest-precedence graphics provider in which they were found.
 */
typedef struct
{
  GPtrArray *paths;
  GHashTable *path_to_provider;
} PvRuntimeLibraryData;

/*
 * pv_runtime_library_data_init:
 *
 * Initialize @self. This must be called before any other method,
 * except for pv_runtime_library_data_clear() which is valid to call
 * on struct initialized with `{}`.
 */
static inline void
pv_runtime_library_data_init (PvRuntimeLibraryData *self)
{
  self->paths = g_ptr_array_new_with_free_func (g_free);
  self->path_to_provider = g_hash_table_new_full (g_str_hash,
                                                  g_str_equal,
                                                  NULL,
                                                  g_object_unref);
}

/*
 * pv_runtime_library_data_contains:
 *
 * Returns: %TRUE if @self contains @path
 */
static inline gboolean
pv_runtime_library_data_contains (PvRuntimeLibraryData *self,
                                  const char *path)
{
  return g_hash_table_contains (self->path_to_provider, path);
}

/*
 * pv_runtime_library_data_iter_init:
 * @self: Collection of data directories associated with a library
 * @iter: An iterator, currently just a number
 *
 * Start iteration over PvRuntimeLibraryData, using the same pattern as
 * g_hash_table_iter_init().
 */
static inline void
pv_runtime_library_data_iter_init (PvRuntimeLibraryData *self,
                                   gsize *iter)
{
  *iter = 0;
}

/*
 * pv_runtime_library_data_iter_next:
 * @self: Collection of data directories associated with a library
 * @iter: An initialized iterator
 * @path: (out) (transfer none): Set to the next path if %TRUE was returned
 * @provider: (out) (transfer none): Set to the provider for @path if %TRUE
 *  was returned
 *
 * Continue iteration over PvRuntimeLibraryData, using the same pattern as
 * g_hash_table_iter_next().
 *
 * Returns: %TRUE if an item was returned, %FALSE at end of iteration
 */
static inline gboolean
pv_runtime_library_data_iter_next (PvRuntimeLibraryData *self,
                                   gsize *iter,
                                   const char **path,
                                   PvGraphicsProvider **provider)
{
  if (*iter >= self->paths->len)
    return FALSE;

  *path = g_ptr_array_index (self->paths, *iter);
  *provider = g_hash_table_lookup (self->path_to_provider, *path);
  (*iter)++;
  return TRUE;
}

/*
 * pv_runtime_library_data_clear:
 *
 * Clear a stack-allocated #PvRuntimeLibraryData, which must have either
 * been populated with pv_runtime_library_data_init() or zero-initialized
 * with `{}`.
 *
 * Use with `g_auto(PvRuntimeLibraryData) libdata = {}`.
 */
static inline void
pv_runtime_library_data_clear (PvRuntimeLibraryData *self)
{
  g_clear_pointer (&self->path_to_provider, g_hash_table_destroy);
  g_clear_pointer (&self->paths, g_ptr_array_unref);
}

G_DEFINE_AUTO_CLEANUP_CLEAR_FUNC (PvRuntimeLibraryData,
                                  pv_runtime_library_data_clear)

gboolean pv_runtime_library_data_try (PvRuntimeLibraryData *self,
                                      const char *path,
                                      PvGraphicsProvider *provider,
                                      const char *based_on_caption,
                                      const char *based_on,
                                      const char *reason);
