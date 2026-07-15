/*
 * Copyright © 2017-2025 Collabora Ltd.
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

#include "wrap-preload.h"

#include "steam-runtime-tools/glib-backports-internal.h"
#include "steam-runtime-tools/libdl-internal.h"
#include "libglnx.h"

#include <string.h>

#include "flatpak-utils-private.h"

#include "adverb-preload.h"
#include "exports.h"
#include "utils.h"

/*
 * export_path_for_preload:
 * @context: Context we are running in
 * @path: Absolute path to a LD_PRELOAD or LD_AUDIT module
 *
 * Return the path that we would need to add to `context->exports`
 * to make this module available to the container, or %NULL if no path
 * should be added.
 *
 * Returns: (transfer full) (nullable): Path to export, or %NULL
 */
static gchar *
export_path_for_preload (PvWrapContext *context,
                         const char *path)
{
  g_autofree gchar *parent = NULL;
  glnx_autofd int parent_fd = -1;
  FlatpakExports *exports = context->exports;

  if (exports == NULL)
    return NULL;

  /* Normally we export the directory containing the LD_PRELOAD module,
   * and not the module itself. For example, if we're going to load
   * /home/me/.local/lib64/mangohud/libMangoHud_shim.so,
   * we want to share /home/me/.local/lib64/mangohud with the
   * container, so that libMangoHud_shim.so can dlopen
   * libMangoHud_opengl.so in the same directory, as expected.
   * This is a compromise between exporting too much (which we
   * could easily do if we walked further up the directory tree,
   * for example undoing the effect of --unshare-home)
   * and exporting too little (just libMangoHud_shim.so, which
   * doesn't do anything useful on its own). */
  parent = g_path_get_dirname (path);
  parent_fd = _srt_sysroot_open (context->current_root,
                                 parent,
                                 SRT_RESOLVE_FLAGS_MUST_BE_DIRECTORY,
                                 NULL,
                                 NULL);

  /* Special case: we don't want to export all of $HOME if we are doing
   * --unshare-home, so override that to only exporting the minimum
   *  that we can: the module itself. */
  if (context->current_home_fd >= 0
      && parent_fd >= 0
      && _srt_fstatat_is_same_file (context->current_home_fd, "",
                                    parent_fd, ""))
    {
      g_debug ("Not exporting parent of \"%s\" because it is $HOME",
               path);
      return g_strdup (path);
    }

  g_debug ("Exporting parent of \"%s\" -> \"%s\"", path, parent);
  return g_steal_pointer (&parent);
}

static void
append_preload_internal (PvWrapContext *context,
                         GPtrArray *argv,
                         PvPreloadVariableIndex which,
                         const char *export_path,
                         const char *original_path,
                         GQuark architecture,
                         PvAppendPreloadFlags flags)
{
  g_auto(PvAdverbPreloadModule) module = PV_ADVERB_PRELOAD_MODULE_INIT;
  g_autofree gchar *arg = NULL;
  gboolean flatpak_subsandbox = ((flags & PV_APPEND_PRELOAD_FLAGS_FLATPAK_SUBSANDBOX) != 0);

  module.index_in_preload_variables = which;
  module.architecture = architecture;

  if (context->runtime != NULL
      && (g_str_has_prefix (original_path, "/usr/")
          || g_str_has_prefix (original_path, "/lib")
          || (flatpak_subsandbox && g_str_has_prefix (original_path, "/app/"))))
    {
      const char *target = flatpak_subsandbox ? "/run/parent" : "/run/host";

      module.name = g_build_filename (target, original_path, NULL);
      g_debug ("%s -> %s", original_path, module.name);
    }
  else
    {
      module.name = g_strdup (original_path);
      g_debug ("%s -> unmodified", original_path);

      if (context->exports != NULL && export_path != NULL && export_path[0] == '/')
        {
          const gchar *steam_path = g_environ_getenv (context->original_environ, "STEAM_COMPAT_CLIENT_INSTALL_PATH");

          if (steam_path != NULL
              && flatpak_has_path_prefix (export_path, steam_path))
            {
              g_debug ("Skipping exposing \"%s\" because it is located "
                       "under the Steam client install path that we "
                       "bind by default", export_path);
            }
          else
            {
              g_debug ("%s needs adding to exports", export_path);
              pv_exports_expose_or_log (context->exports,
                                        FLATPAK_FILESYSTEM_MODE_READ_ONLY,
                                        export_path);
            }
        }
    }

  arg = pv_adverb_preload_module_to_adverb_cli (&module);
  g_return_if_fail (arg != NULL);
  g_ptr_array_add (argv, g_steal_pointer (&arg));
}

/*
 * Deal with a LD_PRELOAD or LD_AUDIT module that contains tokens whose
 * expansion we can't control or predict, such as ${ORIGIN} or future
 * additions. We can't do much with these, because we can't assume that
 * the dynamic string tokens will expand in the same way for us as they
 * will for other programs.
 *
 * We mostly have to pass them into the container and hope for the best.
 * We can rewrite a /usr/, /lib or /app/ prefix, and we can export the
 * directory containing the first path component that has a dynamic
 * string token: for example, /opt/plat-${PLATFORM}/preload.so or
 * /opt/$PLATFORM/preload.so both have to be exported as /opt.
 *
 * Arguments are the same as for pv_wrap_append_preload().
 */
static void
append_preload_unsupported_token (PvWrapContext *context,
                                  GPtrArray *argv,
                                  PvPreloadVariableIndex which,
                                  const char *preload,
                                  PvAppendPreloadFlags flags)
{
  g_autofree gchar *export_path = NULL;
  char *dollar;
  char *slash;

  g_debug ("Found $ORIGIN or unsupported token in \"%s\"",
           preload);

  if (preload[0] == '/')
    {
      export_path = g_strdup (preload);
      dollar = strchr (export_path, '$');
      g_assert (dollar != NULL);
      /* Truncate before '$' */
      dollar[0] = '\0';
      slash = strrchr (export_path, '/');
      /* It's an absolute path, so there is definitely a '/' before '$' */
      g_assert (slash != NULL);
      /* Truncate before last '/' before '$' */
      slash[0] = '\0';

      /* If that truncation leaves it empty, don't try to expose
       * the whole root filesystem */
      if (export_path[0] != '/')
        {
          g_debug ("Not exporting root filesystem for \"%s\"",
                   preload);
          g_clear_pointer (&export_path, g_free);
        }
      else
        {
          g_debug ("Exporting \"%s\" for \"%s\"",
                   export_path, preload);
        }
    }
  else
    {
      /* Original path was relative and contained an unsupported
       * token like $ORIGIN. Pass it through as-is, without any extra
       * exports (because we don't know what the token means!), and
       * hope for the best. export_path stays NULL. */
      g_debug ("Not exporting \"%s\": not an absolute path, or starts "
               "with $ORIGIN",
               preload);
    }

  append_preload_internal (context,
                           argv,
                           which,
                           export_path,
                           preload,
                           0,   /* unspecified architecture */
                           flags);
}

/*
 * Deal with a LD_PRELOAD or LD_AUDIT module that contains tokens whose
 * expansion is ABI-dependent but otherwise fixed. We do these by
 * breaking it up into several ABI-dependent LD_PRELOAD modules, which
 * are recombined by pv-adverb. We have to do this because the expansion
 * of the ABI-dependent tokens could be different in the container, due
 * to using a different glibc.
 *
 * Arguments are the same as for pv_wrap_append_preload().
 */
static void
append_preload_per_architecture (PvWrapContext *context,
                                 GPtrArray *argv,
                                 PvPreloadVariableIndex which,
                                 const char *preload,
                                 PvAppendPreloadFlags flags)
{
  g_autoptr(SrtSystemInfo) system_info = srt_system_info_new (NULL);
  gsize n_supported_architectures = context->options.architectures->len;
  gsize i;

  for (i = 0; i < n_supported_architectures; i++)
    {
      g_autoptr(GString) mock_path = NULL;
      g_autoptr(SrtLibrary) details = NULL;
      GQuark arch_quark = g_array_index (context->options.architectures, GQuark, i);
      const gchar *multiarch_tuple = g_quark_to_string (arch_quark);
      const char *path = NULL;

      if (!(flags & PV_APPEND_PRELOAD_FLAGS_IN_UNIT_TESTS))
        {
          srt_system_info_check_library (system_info,
                                         multiarch_tuple,
                                         preload,
                                         &details);
          path = srt_library_get_absolute_path (details);
        }
      else
        {
          /* Use mock results to get predictable behaviour in the unit
           * tests. This avoids needing to have real libraries in place
           * when we do unit testing.
           *
           * tests/pressure-vessel/wrap-setup.c is the other side of this. */
          g_autofree gchar *lib = NULL;
          const char *platform;

          if (g_str_equal (multiarch_tuple, SRT_ABI_X86_64)
              || g_str_equal (multiarch_tuple, SRT_ABI_I386))
            {
              const SrtKnownArchitecture *known;

              /* As a mock ${PLATFORM}, use the first one listed. */
              known = _srt_architecture_get_by_tuple (multiarch_tuple);
              g_assert (known != NULL);
              g_assert (known->libdl_platform_expansions != NULL);
              platform = known->libdl_platform_expansions[0];
            }
          else
            {
              platform = "mock";
            }

          /* As a mock ${LIB}, behave like Debian or the fdo SDK. */
          lib = g_strdup_printf ("lib/%s", multiarch_tuple);

          mock_path = g_string_new (preload);

          if (strchr (preload, '/') == NULL)
            {
              g_string_printf (mock_path, "/path/to/%s/%s", lib, preload);
            }
          else
            {
              g_string_replace (mock_path, "$LIB", lib, 0);
              g_string_replace (mock_path, "${LIB}", lib, 0);
              g_string_replace (mock_path, "$PLATFORM", platform, 0);
              g_string_replace (mock_path, "${PLATFORM}", platform, 0);
            }

          path = mock_path->str;

          /* As a special case, pretend one 64-bit library failed to load,
           * so we can exercise what happens when there's only a 32-bit
           * library available. */
          if (strstr (path, "only-32-bit") != NULL
              && strcmp (multiarch_tuple, SRT_ABI_I386) != 0)
            path = NULL;
        }

      if (path != NULL)
        {
          g_autofree gchar *export_path = export_path_for_preload (context, path);

          g_debug ("Found %s version of %s at %s",
                   multiarch_tuple, preload, path);
          append_preload_internal (context,
                                   argv,
                                   which,
                                   export_path,
                                   path,
                                   arch_quark,
                                   flags);
        }
      else
        {
          g_info ("Unable to load %s version of %s",
                  multiarch_tuple, preload);
        }
    }
}

static void
append_preload_basename (PvWrapContext *context,
                         GPtrArray *argv,
                         PvPreloadVariableIndex which,
                         const char *preload,
                         PvAppendPreloadFlags flags)
{
  gboolean runtime_has_library = FALSE;

  if (context->runtime != NULL)
    runtime_has_library = pv_runtime_has_library (context->runtime, preload);

  if (flags & PV_APPEND_PRELOAD_FLAGS_IN_UNIT_TESTS)
    {
      /* Mock implementation for unit tests: behave as though the
       * container has everything except libfakeroot/libfakechroot. */
      if (g_str_has_prefix (preload, "libfake"))
        runtime_has_library = FALSE;
      else
        runtime_has_library = TRUE;
    }

  if (runtime_has_library)
    {
      /* If the library exists in the container runtime or in the
       * stack we imported from the graphics provider, e.g.
       * LD_PRELOAD=libpthread.so.0, then we certainly don't want
       * to be loading it from the current namespace: that would
       * bypass our logic for comparing library versions and picking
       * the newest. Just pass through the LD_PRELOAD item into the
       * container, and let the dynamic linker in the container choose
       * what it means (container runtime or graphics provider as
       * appropriate). */
      g_debug ("Found \"%s\" in runtime or graphics stack provider, "
               "passing %s through as-is",
               preload,
               pv_preload_variables[which].variable);
      append_preload_internal (context,
                               argv,
                               which,
                               NULL,  /* don't export anything */
                               preload,
                               0,     /* unspecified architecture */
                               flags);
    }
  else
    {
      /* There's no such library in the container runtime or in the
       * graphics provider, so it's OK to inject the version from the
       * current namespace. Use the same trick as for ${PLATFORM} to
       * turn it into (up to) one absolute path per ABI. */
      g_debug ("Did not find \"%s\" in runtime or graphics stack provider, "
               "splitting architectures",
               preload);
      append_preload_per_architecture (context,
                                       argv,
                                       which,
                                       preload,
                                       flags);
    }
}

/**
 * pv_wrap_append_preload:
 * @context: Context we are running in
 * @argv: (element-type filename): Array of command-line options to populate
 * @which: Either `LD_AUDIT` or `LD_PRELOAD`
 * @preload: (type filename): Path of preloadable module in current
 *  namespace, possibly including special ld.so tokens such as `$LIB`,
 *  or basename of a preloadable module to be found in the standard
 *  library search path
 * @flags: Flags to adjust behaviour
 *
 * Adjust @preload to be valid for the container and append it
 * to @argv.
 */
static void
pv_wrap_append_preload (PvWrapContext *context,
                        GPtrArray *argv,
                        PvPreloadVariableIndex which,
                        const char *preload,
                        PvAppendPreloadFlags flags)
{
  SrtLoadableKind kind;
  SrtLoadableFlags loadable_flags;
  const char *variable;

  g_return_if_fail (preload != NULL);
  g_return_if_fail (which >= 0);
  g_return_if_fail (which < G_N_ELEMENTS (pv_preload_variables));

  variable = pv_preload_variables[which].variable;

  if (strstr (preload, "gtk3-nocsd") != NULL)
    {
      g_warning ("Disabling gtk3-nocsd %s: it is known to cause crashes.",
                 variable);
      return;
    }

  if (context->options.remove_game_overlay
      && g_str_has_suffix (preload, "/gameoverlayrenderer.so"))
    {
      g_info ("Disabling Steam Overlay: %s", preload);
      return;
    }

  kind = _srt_loadable_classify (preload, &loadable_flags);

  switch (kind)
    {
      case SRT_LOADABLE_KIND_BASENAME:
        /* Basenames can't have dynamic string tokens. */
        g_warn_if_fail ((loadable_flags & SRT_LOADABLE_FLAGS_DYNAMIC_TOKENS) == 0);
        append_preload_basename (context,
                                 argv,
                                 which,
                                 preload,
                                 flags);
        break;

      case SRT_LOADABLE_KIND_PATH:
        /* Paths can have dynamic string tokens. */
        if (loadable_flags & (SRT_LOADABLE_FLAGS_ORIGIN
                              | SRT_LOADABLE_FLAGS_UNKNOWN_TOKENS))
          {
            append_preload_unsupported_token (context,
                                              argv,
                                              which,
                                              preload,
                                              flags);
          }
        else if (loadable_flags & SRT_LOADABLE_FLAGS_ABI_DEPENDENT)
          {
            g_debug ("Found $LIB or $PLATFORM in \"%s\", splitting architectures",
                     preload);
            append_preload_per_architecture (context,
                                             argv,
                                             which,
                                             preload,
                                             flags);
          }
        else
          {
            g_autofree gchar *export_path = export_path_for_preload (context, preload);

            /* All dynamic tokens should be handled above, so we can
             * assume that preload is a concrete filename */
            g_warn_if_fail ((loadable_flags & SRT_LOADABLE_FLAGS_DYNAMIC_TOKENS) == 0);
            append_preload_internal (context,
                                     argv,
                                     which,
                                     export_path,
                                     preload,
                                     0,   /* unspecified architecture */
                                     flags);
          }
        break;

      case SRT_LOADABLE_KIND_ERROR:
      default:
        /* Empty string or similar syntactically invalid token:
         * ignore with a warning. Since steam-runtime-tools!352 and
         * steamlinuxruntime!64, the wrapper scripts don't give us
         * an empty argument any more. */
        g_warning ("Ignoring invalid loadable module \"%s\"", preload);

        break;
    }
}

/*
 * pv_wrap_append_preloads:
 * @context: Context we are running in
 * @argv: (element-type filename): Array of command-line options to populate
 * @inputs: (array length=n_inputs): Array of LD_PRELOAD or similar modules
 * @n_inputs: Number of items in @inputs
 * @flags: Flags to adjust behaviour
 *
 * Adjust each module in @inputs to be valid for the container and append it
 * to @argv.
 */
void
pv_wrap_append_preloads (PvWrapContext *context,
                         GPtrArray *argv,
                         WrapPreloadModule *inputs,
                         gsize n_inputs,
                         PvAppendPreloadFlags flags)
{
  gsize i;

  g_return_if_fail (PV_IS_WRAP_CONTEXT (context));
  g_return_if_fail (argv != NULL);

  if (n_inputs == 0)
    return;

  g_return_if_fail (inputs != NULL);

  g_debug ("Adjusting LD_AUDIT/LD_PRELOAD modules...");

  for (i = 0; i < n_inputs; i++)
    {
      const WrapPreloadModule *input = inputs + i;

      pv_wrap_append_preload (context,
                              argv,
                              input->which,
                              input->preload,
                              flags);
    }
}
