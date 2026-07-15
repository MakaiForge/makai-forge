/*
 * Copyright © 2019-2022 Collabora Ltd.
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

#include "config.h"
#include "per-arch-dirs.h"

#include <glib/gstdio.h>

#include "steam-runtime-tools/architecture-internal.h"
#include "steam-runtime-tools/system-info.h"
#include "steam-runtime-tools/utils-internal.h"

static gchar *
get_libdl_lib_or_mock (GQuark arch_quark,
                       SrtSystemInfo *system_info,
                       GError **error)
{
  if (g_getenv ("PRESSURE_VESSEL_TEST_STANDARDIZE_PLATFORM") != NULL)
    {
      /* For unit tests, pretend it's an unsupported multilib setup,
       * so we fall through to ${PLATFORM} */
      return glnx_null_throw (error, "Pretending multilib is unsupported for unit test");
    }
  else
    {
      return srt_system_info_dup_libdl_lib (system_info,
                                            g_quark_to_string (arch_quark),
                                            error);
    }
}

static gchar *
get_libdl_platform_or_mock (GQuark arch_quark,
                            SrtSystemInfo *system_info,
                            GError **error)
{
  if (G_UNLIKELY (g_getenv ("PRESSURE_VESSEL_TEST_STANDARDIZE_PLATFORM") != NULL))
    {
      /* In unit tests it isn't straightforward to find the real
       * ${PLATFORM}, so we use a predictable mock implementation:
       * for x86 we use whichever platform happens to be listed first
       * and for all the other cases we simply use "mock". */
      const char *tuple = g_quark_to_string (arch_quark);
      const SrtKnownArchitecture *known;

      known = _srt_architecture_get_by_tuple (tuple);

      if (g_str_equal (tuple, SRT_ABI_X86_64) || g_str_equal (tuple, SRT_ABI_I386))
        {
          g_assert (known != NULL);
          g_assert (known->libdl_platform_expansions != NULL);
          g_assert (known->libdl_platform_expansions[0] != NULL);
          return g_strdup (known->libdl_platform_expansions[0]);
        }

      return g_strdup("mock");
    }
  else
    {
      return srt_system_info_dup_libdl_platform (system_info,
                                                 g_quark_to_string (arch_quark),
                                                 error);
    }
}

/*
 * PvPerArchDirsScheme:
 * @PV_PER_ARCH_DIRS_SCHEME_LIB: `${LIB}` expands to a known/supported
 *  library directory.
 * @PV_PER_ARCH_DIRS_SCHEME_PLATFORM: `${PLATFORM}` expands to a
 *  known/supported platform alias.
 */
typedef enum
{
  PV_PER_ARCH_DIRS_SCHEME_LIB,
  PV_PER_ARCH_DIRS_SCHEME_PLATFORM,
} PvPerArchDirsScheme;

void
pv_per_arch_dirs_free (PvPerArchDirs *self)
{
  (void) glnx_tmpdir_delete (&self->root, NULL, NULL);
  g_clear_pointer (&self->libdl_token_path, g_free);
  g_clear_pointer (&self->abi_paths, g_hash_table_unref);
  g_free (self);
}

/*
 * If @scheme distinguishes between all the architectures in @architectures,
 * populate @libdl_token_path and @abi_paths, and return %TRUE.
 * Else return %FALSE.
 */
static gboolean
pv_per_arch_dirs_try_scheme (PvPerArchDirs *self,
                             SrtSystemInfo *info,
                             PvPerArchDirsScheme scheme,
                             const GQuark *architectures,
                             gsize n_architectures,
                             GError **error)
{
  /* Values are owned by the array */
  g_autoptr(GPtrArray) ordered_strings = NULL;
  /* Values are borrowed from @ordered_strings */
  g_autoptr(GHashTable) unique_strings = NULL;
  gsize i;

  ordered_strings = g_ptr_array_new_with_free_func (g_free);
  unique_strings = g_hash_table_new (g_str_hash, g_str_equal);

  for (i = 0; i < n_architectures; i++)
    {
      g_autofree gchar *libdl_string = NULL;
      const char *label;

      switch (scheme)
        {
          case PV_PER_ARCH_DIRS_SCHEME_LIB:
            label = "${LIB}";
            libdl_string = get_libdl_lib_or_mock (architectures[i], info, error);
            break;
          case PV_PER_ARCH_DIRS_SCHEME_PLATFORM:
            label = "${PLATFORM}";
            libdl_string = get_libdl_platform_or_mock (architectures[i], info, error);
            break;
          default:
            g_return_val_if_reached (FALSE);
        }

      /* Short-circuit: if we failed to expand ${LIB}/${PLATFORM} on
       * any one architecture, then it can't possibly be the case
       * that we have a unique expansion on every architecture. */
      if (libdl_string == NULL)
        return glnx_prefix_error (error,
                                  "Unable to determine %s for %s",
                                  label, g_quark_to_string (architectures[i]));

      g_assert (ordered_strings->len == i);
      g_hash_table_add (unique_strings, libdl_string);
      g_ptr_array_add (ordered_strings, g_steal_pointer (&libdl_string));
    }

  g_assert (ordered_strings->len == n_architectures);

  /* Use the pigeonhole principle: tf we have fewer results than
   * architectures, then that must mean two architectures expanded
   * to the same value, which means we cannot use this token to distinguish
   * between all the architectures we want to
   *
   * For example on Arch Linux, `${LIB}` is expected to expand to `lib`
   * on both x86_64 and aarch64. */
  if (g_hash_table_size (unique_strings) != n_architectures)
    return glnx_throw (error,
                       "Only %u unique expansions of ${LIB} for %zu architectures",
                       g_hash_table_size (unique_strings),
                       n_architectures);

  /* Each architecture has a unique ${LIB}/${PLATFORM}, so we can use
   * /tmp/pressure-vessel-libs-XXXXXX/${LIB}/libfoo.so or
   * /tmp/pressure-vessel-libs-XXXXXX/${PLATFORM}/libfoo.so */

  switch (scheme)
    {
      case PV_PER_ARCH_DIRS_SCHEME_LIB:
        self->libdl_token_path = g_build_filename (self->root.path, "${LIB}", NULL);
        break;
      case PV_PER_ARCH_DIRS_SCHEME_PLATFORM:
        self->libdl_token_path = g_build_filename (self->root.path, "${PLATFORM}", NULL);
        break;
      default:
        g_return_val_if_reached (FALSE);
    }

  self->abi_paths = g_hash_table_new_full (g_direct_hash, g_direct_equal,
                                           NULL, g_free);

  for (i = 0; i < n_architectures; i++)
    {
      const char *libdl_string = g_ptr_array_index (ordered_strings, i);

      g_assert (libdl_string != NULL);
      g_hash_table_replace (self->abi_paths,
                            GUINT_TO_POINTER (architectures[i]),
                            g_build_filename (self->root.path, libdl_string, NULL));
    }

  return TRUE;
}

PvPerArchDirs *
pv_per_arch_dirs_new (SrtSystemInfo *info,
                      const GQuark *architectures,
                      gsize n_architectures,
                      GError **error)
{
  g_autoptr(GError) lib_error = NULL;
  g_autoptr(GError) platform_error = NULL;
  g_autoptr(PvPerArchDirs) self = g_new0 (PvPerArchDirs, 1);
  gsize abi;

  if (!glnx_mkdtemp ("pressure-vessel-libs-XXXXXX", 0755, &self->root, error))
    return glnx_prefix_error_null (error,
                                   "Cannot create temporary directory for platform specific libraries");

  if (!pv_per_arch_dirs_try_scheme (self, info, PV_PER_ARCH_DIRS_SCHEME_LIB,
                                    architectures, n_architectures, &lib_error)
      && !pv_per_arch_dirs_try_scheme (self, info, PV_PER_ARCH_DIRS_SCHEME_PLATFORM,
                                       architectures, n_architectures, &platform_error))
    return glnx_null_throw (error,
                            "Unable to identify uniquely identifying libdl tokens (%s; %s)",
                            lib_error->message,
                            platform_error->message);

  for (abi = 0; abi < n_architectures; abi++)
    {
      const char *abi_path = pv_per_arch_dirs_get_abi_path (self, architectures[abi]);

      g_return_val_if_fail (abi_path != NULL, NULL);

      if (g_mkdir_with_parents (abi_path, 0700) != 0)
        return glnx_null_throw_errno_prefix (error, "Unable to create \"%s\"", abi_path);
    }

  return g_steal_pointer (&self);
}

gboolean
pv_adverb_set_up_overrides (FlatpakBwrap *wrapped_command,
                            const GQuark *archs,
                            gsize n_archs,
                            PvPerArchDirs *lib_temp_dirs,
                            const char *overrides,
                            GError **error)
{
  g_autofree gchar *value = NULL;
  gsize abi;

  g_return_val_if_fail (wrapped_command != NULL, FALSE);

  if (lib_temp_dirs == NULL)
    return glnx_throw (error, "Unable to set up VDPAU driver search path");

  for (abi = 0; abi < n_archs; abi++)
    {
      GQuark arch_quark = archs[abi];
      const char *multiarch_tuple = g_quark_to_string (arch_quark);
      g_autofree gchar *abi_path = NULL;
      g_autofree gchar *target = NULL;
      const char *abi_path_base;

      abi_path_base = pv_per_arch_dirs_get_abi_path (lib_temp_dirs, arch_quark);
      g_assert (abi_path_base != NULL);
      abi_path = g_build_filename (abi_path_base, "vdpau", NULL);
      target = g_build_filename (overrides, "lib", multiarch_tuple, "vdpau", NULL);

      if (!g_file_test (target, G_FILE_TEST_IS_DIR))
        continue;

      g_debug ("Creating \"%s\" -> \"%s\"", abi_path, target);

      if (symlink (target, abi_path) != 0)
        return glnx_throw_errno_prefix (error, "Cannot create symlink \"%s\"", abi_path);
    }

  value = g_build_filename (lib_temp_dirs->libdl_token_path, "vdpau", NULL);
  g_debug ("Setting VDPAU_DRIVER_PATH=\"%s\"", value);
  flatpak_bwrap_set_env (wrapped_command, "VDPAU_DRIVER_PATH", value, TRUE);
  return TRUE;
}
