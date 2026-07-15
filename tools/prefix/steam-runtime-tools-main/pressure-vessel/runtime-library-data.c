/*
 * Copyright © 2020-2025 Collabora Ltd.
 *
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

#include "runtime-library-data.h"

/*
 * @self: Collection of data directories associated with a library
 * @path: A path relative to the @provider's root (must not
 *  start with a slash)
 * @provider: A graphics stack provider
 * @based_on_caption: A description of @based_on, for diagnostic messages
 * @based_on: Library path, etc. on which we based our decision to
 *  look at @path
 * @reason: (nullable): Additional text to append to diagnostic messages
 *
 * Check whether @provider is the highest-precedence graphics stack
 * provider where we can find @path.
 *
 * Returns: %TRUE if @path was found, either in @provider or previously
 */
gboolean
pv_runtime_library_data_try (PvRuntimeLibraryData *self,
                             const char *path,
                             PvGraphicsProvider *provider,
                             const char *based_on_caption,
                             const char *based_on,
                             const char *reason)
{
  gchar *copy;

  g_return_val_if_fail (self != NULL, FALSE);
  g_return_val_if_fail (path != NULL, FALSE);
  g_return_val_if_fail (path[0] != '/', FALSE);
  g_return_val_if_fail (PV_IS_GRAPHICS_PROVIDER (provider), FALSE);

  /* If another, higher-precedence architecture is already providing
   * e.g. usr/share/nvidia, defer to that one. This works because
   * we iterate through architectures in precedence order. */
  if (pv_runtime_library_data_contains (self, path))
    return TRUE;

  /* Or if the current architecture's graphics stack provider has e.g.
   * /usr/share/nvidia, we'll use that. */
  if (!_srt_sysroot_test (provider->in_current_ns, path,
                          SRT_RESOLVE_FLAGS_MUST_BE_DIRECTORY, NULL))
    return FALSE;

  g_debug ("Using \"/%s\" based on %s \"/%s\"%s",
           path, based_on_caption, based_on, reason ?: "");
  copy = g_strdup (path);
  g_ptr_array_add (self->paths, copy);
  g_hash_table_replace (self->path_to_provider, copy, g_object_ref (provider));
  return TRUE;
}

