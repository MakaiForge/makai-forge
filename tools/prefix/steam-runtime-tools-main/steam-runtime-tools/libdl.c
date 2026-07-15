/*
 * Copyright © 2021 Collabora Ltd.
 *
 * SPDX-License-Identifier: MIT
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

#include "steam-runtime-tools/libdl-internal.h"

#include "steam-runtime-tools/architecture-internal.h"
#include "steam-runtime-tools/glib-backports-internal.h"
#include "steam-runtime-tools/utils.h"
#include "steam-runtime-tools/utils-internal.h"

static gchar *
_srt_libdl_run_helper (SrtSubprocessRunner *runner,
                       GQuark arch_quark,
                       const SrtKnownArchitecture *known_arch,
                       const char *helper_name,
                       GError **error)
{
  /* All dynamically-loaded libraries are relative to ${ORIGIN} */
  SrtHelperFlags helper_flags = SRT_HELPER_FLAGS_WORKS_IN_SYSROOT;
  g_autoptr(GPtrArray) argv = NULL;
  g_autoptr(SrtCompletedSubprocess) completed = NULL;
  g_autofree gchar *child_stdout = NULL;
  gsize len;

  g_return_val_if_fail (SRT_IS_SUBPROCESS_RUNNER (runner), NULL);
  g_return_val_if_fail (arch_quark != SRT_ARCHITECTURE_QUARK_NONE, NULL);
  g_return_val_if_fail (helper_name != NULL, NULL);
  g_return_val_if_fail (error == NULL || *error == NULL, NULL);
  g_return_val_if_fail (_srt_check_not_setuid (), NULL);

  argv = _srt_subprocess_runner_get_helper (runner,
                                            g_quark_to_string (arch_quark),
                                            known_arch,
                                            helper_name, helper_flags,
                                            error);

  if (argv == NULL)
    return NULL;

  g_ptr_array_add (argv, NULL);

  completed = _srt_subprocess_runner_run_sync (runner,
                                               helper_flags,
                                               arch_quark,
                                               (const char * const *) argv->pdata,
                                               SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
                                               SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
                                               error);

  if (completed == NULL)
    return NULL;

  if (!_srt_completed_subprocess_report (completed, NULL, NULL, NULL, NULL))
    return glnx_null_throw (error, "%s",
                            _srt_completed_subprocess_get_stderr (completed));

  child_stdout = _srt_completed_subprocess_steal_stdout (completed);

  len = strlen (child_stdout);

  /* Emulate shell $() */
  if (len > 0 && child_stdout[len - 1] == '\n')
    child_stdout[len - 1] = '\0';

  return g_steal_pointer(&child_stdout);
}

gchar *
_srt_libdl_detect_platform (SrtSubprocessRunner *runner,
                            GQuark arch_quark,
                            const SrtKnownArchitecture *known_arch,
                            GError **error)
{
  return _srt_libdl_run_helper (runner,
                                arch_quark,
                                known_arch,
                                "detect-platform",
                                error);
}

gchar *
_srt_libdl_detect_lib (SrtSubprocessRunner *runner,
                       GQuark arch_quark,
                       const SrtKnownArchitecture *known_arch,
                       GError **error)
{
  return _srt_libdl_run_helper (runner,
                                arch_quark,
                                known_arch,
                                "detect-lib",
                                error);
}

SrtLoadableKind
_srt_loadable_classify (const char *loadable,
                        SrtLoadableFlags *flags_out)
{
  SrtLoadableFlags flags = SRT_LOADABLE_FLAGS_NONE;
  SrtLoadableKind kind;
  gsize i;

  g_return_val_if_fail (loadable != NULL, SRT_LOADABLE_KIND_ERROR);

  if (loadable[0] == '\0')
    {
      kind = SRT_LOADABLE_KIND_ERROR;
      goto out;
    }

  if (strchr (loadable, '/') != NULL)
    {
      kind = SRT_LOADABLE_KIND_PATH;
    }
  else
    {
      /* Dynamic string tokens are not interpreted in a bare SONAME
       * so we don't need to do that part. */
      kind = SRT_LOADABLE_KIND_BASENAME;
      goto out;
    }

  for (i = 0; loadable[i] != '\0'; i++)
    {
      if (loadable[i] == '$')
        {
          const char *token = loadable + i + 1;
          gsize len;

          flags |= SRT_LOADABLE_FLAGS_DYNAMIC_TOKENS;

          if (token[0] == '{')
            {
              token++;
              len = strcspn (token, "}");
            }
          else
            {
              len = 0;

              while (g_ascii_isalnum (token[len]) || token[len] == '_')
                len++;
            }

          switch (len)
            {
              case 3:
                if (strncmp ("LIB", token, len) == 0)
                  {
                    flags |= SRT_LOADABLE_FLAGS_ABI_DEPENDENT;
                    continue;
                  }

                break;

              case 6:
                if (strncmp ("ORIGIN", token, len) == 0)
                  {
                    flags |= SRT_LOADABLE_FLAGS_ORIGIN;
                    continue;
                  }

                break;

              case 8:
                if (strncmp ("PLATFORM", token, len) == 0)
                  {
                    flags |= SRT_LOADABLE_FLAGS_ABI_DEPENDENT;
                    continue;
                  }

                break;

              default:
                break;
            }

          flags |= SRT_LOADABLE_FLAGS_UNKNOWN_TOKENS;
        }
    }

out:
  if (flags_out != NULL)
    *flags_out = flags;

  return kind;
}

/*
 * _srt_get_extra_ld_so_cache_filenames:
 *
 * Return an array of non-standard, architecture-independent filenames
 * for ld.so.cache.
 *
 * The result does not include the standard `/etc/ld.so.cache`,
 * as used upstream, in Debian and in the Steam Runtime.
 *
 * The result does not include any architecture-specific filenames.
 * For those, see #SrtKnownArchitecture.extra_ld_so_caches.
 *
 * Returns: (array zero-terminated=1) (element-type filename): The filenames
 */
const char * const *
_srt_get_extra_ld_so_cache_filenames (void)
{
  static const char * const filenames[] =
  {
    /* Clear Linux */
    "/var/cache/ldconfig/ld.so.cache",
    NULL
  };

  return filenames;
}

/*
 * _srt_get_extra_ld_so_conf_filenames:
 *
 * Return an array of non-standard, architecture-independent filenames
 * for ld.so.conf.
 *
 * The result does not include the standard `/etc/ld.so.conf`,
 * as used upstream, in Debian and in the Steam Runtime.
 *
 * The result does not include any architecture-specific filenames.
 * For those, see #SrtKnownArchitecture.extra_ld_so_confs.
 *
 * Returns: (array zero-terminated=1) (element-type filename): The filenames
 */
const char * const *
_srt_get_extra_ld_so_conf_filenames (void)
{
  static const char * const filenames[] =
  {
    /* Solus */
    "/usr/share/defaults/etc/ld.so.conf",
    NULL
  };

  return filenames;
}
