/* pressure-vessel-wrap — run a program in a container that protects $HOME,
 * optionally using a Flatpak-style runtime.
 *
 * Contains code taken from Flatpak.
 *
 * Copyright © 2014-2019 Red Hat, Inc
 * Copyright © 2017-2022 Collabora Ltd.
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

#include <glib.h>
#include <glib/gstdio.h>
#include <gio/gio.h>

#include <locale.h>
#include <stdlib.h>
#include <string.h>

#include "steam-runtime-tools/env-overlay-internal.h"
#include "steam-runtime-tools/glib-backports-internal.h"
#include "steam-runtime-tools/log-internal.h"
#include "steam-runtime-tools/profiling-internal.h"
#include "steam-runtime-tools/utils-internal.h"
#include "libglnx.h"

#include "bwrap.h"
#include "exports.h"
#include "flatpak-bwrap-private.h"
#include "flatpak-run-private.h"
#include "flatpak-utils-base-private.h"
#include "flatpak-utils-private.h"
#include "graphics-provider.h"
#include "runtime.h"
#include "utils.h"
#include "wrap-adverb.h"
#include "wrap-context.h"
#include "wrap-flatpak.h"
#include "wrap-home.h"
#include "wrap-interactive.h"
#include "wrap-preload.h"
#include "wrap-setup.h"

typedef enum
{
  PV_WRAP_LOG_FLAGS_OVERRIDES = (1 << 0),
  PV_WRAP_LOG_FLAGS_CONTAINER = (1 << 1),
  PV_WRAP_LOG_FLAGS_NONE = 0
} PvWrapLogFlags;

static const GDebugKey pv_debug_keys[] =
{
  { "overrides", PV_WRAP_LOG_FLAGS_OVERRIDES },
  { "container", PV_WRAP_LOG_FLAGS_CONTAINER },
};

int
main (int argc,
      char *argv[])
{
  g_autoptr(PvWrapContext) self = NULL;
  g_autoptr(GArray) inherit_fds = g_array_new (FALSE, FALSE, sizeof (int));
  g_autoptr(GError) local_error = NULL;
  GError **error = &local_error;
  int ret = 2;
  gsize i;
  PvHomeMode home_mode = PV_HOME_MODE_SHARED;
  g_autoptr(SrtEnvOverlay) container_env = NULL;
  g_autoptr(FlatpakBwrap) bwrap = NULL;
  g_autoptr(FlatpakBwrap) bwrap_filesystem_arguments = NULL;
  g_autoptr(FlatpakBwrap) bwrap_home_arguments = NULL;
  g_autoptr(FlatpakBwrap) argv_in_container = NULL;
  g_autoptr(FlatpakBwrap) payload_command = NULL;
  g_autoptr(FlatpakBwrap) final_argv = NULL;
  g_autoptr(SrtSysroot) real_root = NULL;
  g_autoptr(SrtSysroot) interpreter_root = NULL;
  g_autofree gchar *cwd_p = NULL;
  g_autofree gchar *cwd_l = NULL;
  g_autofree gchar *cwd_p_host = NULL;
  g_autofree gchar *private_home = NULL;
  glnx_autofd int original_stdout = -1;
  glnx_autofd int original_stderr = -1;
  glnx_autofd int tty_stdin = -1;
  glnx_autofd int tty_stdout = -1;
  const char *pkglibexecdir;
  const char *steam_app_id = NULL;
  g_autoptr(GPtrArray) adverb_preload_argv = NULL;
  int real_root_fd;
  int result;
  PvAppendPreloadFlags append_preload_flags = PV_APPEND_PRELOAD_FLAGS_NONE;
  const SrtKnownArchitecture *host_machine = NULL;
  SrtLogFlags log_flags;
  PvWrapLogFlags pv_log_flags = PV_WRAP_LOG_FLAGS_NONE;
  SrtSteamCompatFlags compat_flags;
  const GQuark *tuples;
  gsize n_tuples = 0;

  setlocale (LC_ALL, "");

  /* Set up the initial base logging */
  if (!_srt_util_set_glib_log_handler ("pressure-vessel-wrap",
                                       G_LOG_DOMAIN, SRT_LOG_FLAGS_NONE,
                                       &original_stdout, &original_stderr, error))
    goto out;

  g_info ("pressure-vessel version %s", VERSION);

  if (g_getenv ("STEAM_RUNTIME") != NULL)
    {
      usage_error (error,
                   "This program should not be run in the Steam Runtime. "
                   "Use pressure-vessel-unruntime instead.");
      goto out;
    }

  /* FEX-Emu transparently rewrites most file I/O to check its "rootfs"
   * first, and only use the real root if the corresponding file
   * doesn't exist in the "rootfs". In many places we actively don't want
   * this, because we're inspecting paths in order to pass them to bwrap,
   * which will use them to set up bind-mounts, which are not subject to
   * FEX-Emu's rewriting; so bypass it here. */
  real_root = _srt_sysroot_new_real_root (error);

  if (real_root == NULL)
    goto out;

  real_root_fd = _srt_sysroot_get_fd (real_root);
  self = pv_wrap_context_new (real_root, g_get_home_dir (), error);

  if (self == NULL)
    goto out;

  if (!pv_wrap_options_parse_environment (&self->options, error))
    goto out;

  if (!pv_wrap_context_parse_argv (self, &argc, &argv, error))
    goto out;

  log_flags = SRT_LOG_FLAGS_DIVERT_STDOUT | SRT_LOG_FLAGS_OPTIONALLY_JOURNAL;

  if (self->options.deterministic)
    log_flags |= SRT_LOG_FLAGS_DIFFABLE;

  if (self->options.verbose)
    {
      log_flags |= SRT_LOG_FLAGS_DEBUG;

      /* We share the same environment variable as the rest of s-r-t, but look
       * for additional flags in it */
      pv_log_flags = g_parse_debug_string (g_getenv ("SRT_LOG"),
                                           pv_debug_keys,
                                           G_N_ELEMENTS (pv_debug_keys));
    }

  if (!_srt_util_set_glib_log_handler (NULL, G_LOG_DOMAIN, log_flags,
                                       NULL, NULL, error))
    goto out;

  pv_wrap_detect_virtualization (&interpreter_root, &host_machine);

  if (!pv_wrap_options_parse_environment_after_argv (&self->options,
                                                     interpreter_root,
                                                     error))
    goto out;

  tuples = pv_wrap_options_get_architectures (&self->options, &n_tuples);
  g_assert (n_tuples > 0);
  g_assert (tuples != NULL);
  g_assert (tuples[0] != 0);

  for (i = 0; i < n_tuples; i++)
    g_info ("Architecture: %s", g_quark_to_string (tuples[i]));

  if (self->options.version_only || self->options.version)
    {
      if (original_stdout >= 0
          && !_srt_util_restore_saved_fd (original_stdout, STDOUT_FILENO, error))
        goto out;

      if (self->options.version_only)
        g_print ("%s\n", VERSION);
      else
        g_print ("%s:\n"
                 " Package: pressure-vessel\n"
                 " Version: %s\n",
                 argv[0], VERSION);

      ret = 0;
      goto out;
    }

  _srt_unblock_signals ();
  _srt_setenv_disable_gio_modules ();

  if (argc < 2 && !self->options.test && !self->options.only_prepare)
    {
      usage_error (error, "An executable to run is required");
      goto out;
    }

  if (self->options.terminal == PV_TERMINAL_AUTO)
    {
      if (self->options.shell != PV_SHELL_NONE)
        self->options.terminal = PV_TERMINAL_XTERM;
      else
        self->options.terminal = PV_TERMINAL_NONE;
    }

  if (self->options.terminal == PV_TERMINAL_NONE
      && self->options.shell != PV_SHELL_NONE)
    {
      usage_error (error, "--terminal=none is incompatible with --shell");
      goto out;
    }

  /* --launcher implies --batch */
  if (self->options.launcher)
    self->options.batch = TRUE;

  if (self->options.batch)
    {
      /* --batch or PRESSURE_VESSEL_BATCH=1 overrides these */
      self->options.shell = PV_SHELL_NONE;
      self->options.terminal = PV_TERMINAL_NONE;
    }

  if (argc > 1 && strcmp (argv[1], "--") == 0)
    {
      argv++;
      argc--;
    }

  if (!pv_wrap_context_choose_home_mode (self,
                                         &home_mode,
                                         &private_home,
                                         &steam_app_id,
                                         error))
    goto out;

  if (self->options.env_if_host != NULL)
    {
      for (i = 0; self->options.env_if_host[i] != NULL; i++)
        {
          const char *equals = strchr (self->options.env_if_host[i], '=');

          if (equals == NULL)
            {
              usage_error (error,
                           "--env-if-host argument must be of the form "
                           "NAME=VALUE, not \"%s\"",
                           self->options.env_if_host[i]);
              goto out;
            }
        }
    }

  if (self->options.only_prepare && self->options.test)
    {
      usage_error (error, "--only-prepare and --test are mutually exclusive");
      goto out;
    }

  if (self->options.copy_runtime && self->options.variable_dir == NULL)
    {
      usage_error (error, "--copy-runtime requires --variable-dir");
      goto out;
    }

  /* Finished parsing arguments, so any subsequent failures will make
   * us exit 1. */
  ret = 1;

  if (!pv_wrap_context_after_parsing_arguments (self,
                                                PV_WRAP_TEST_FLAGS_NONE,
                                                error))
    goto out;

  if ((result = _srt_set_compatible_resource_limits (0)) < 0)
    g_warning ("Unable to set normal resource limits: %s",
               g_strerror (-result));

  if (self->options.terminal != PV_TERMINAL_TTY && !self->options.devel)
    {
      int fd;

      if (!glnx_openat_rdonly (-1, "/dev/null", TRUE, &fd, error))
          goto out;

      if (dup2 (fd, STDIN_FILENO) < 0)
        {
          glnx_throw_errno_prefix (error,
                                   "Cannot replace stdin with /dev/null");
          goto out;
        }
    }

  compat_flags = _srt_steam_get_compat_flags (_srt_const_strv (self->original_environ));
  _srt_get_current_dirs (&cwd_p, &cwd_l);

  if (_srt_util_is_debugging ())
    {
      g_auto(GStrv) env = g_strdupv (self->original_environ);

      g_debug ("Original argv:");

      for (i = 0; i < self->original_argc; i++)
        {
          g_autofree gchar *quoted = g_shell_quote (self->original_argv[i]);

          g_debug ("\t%" G_GSIZE_FORMAT ": %s", i, quoted);
        }

      g_debug ("Current working directory:");
      g_debug ("\tPhysical: %s", cwd_p);
      g_debug ("\tLogical: %s", cwd_l);

      g_debug ("Environment variables:");

      qsort (env, g_strv_length (env), sizeof (char *), flatpak_envp_cmp);

      for (i = 0; env[i] != NULL; i++)
        {
          g_autofree gchar *quoted = g_shell_quote (env[i]);

          g_debug ("\t%s", quoted);
        }

      if (self->options.launcher)
        g_debug ("Arguments for s-r-launcher-service:");
      else
        g_debug ("Wrapped command:");

      for (i = 1; i < argc; i++)
        {
          g_autofree gchar *quoted = g_shell_quote (argv[i]);

          g_debug ("\t%" G_GSIZE_FORMAT ": %s", i, quoted);
        }
    }

  pkglibexecdir = _srt_subprocess_runner_get_helpers_path (self->run_in_current_context);
  g_return_val_if_fail (pkglibexecdir != NULL, FALSE);

  if (self->options.test)
    {
      ret = 0;
      goto out;
    }

  /* Invariant: we are in exactly one of these two modes */
  g_assert (((self->flatpak_subsandbox != NULL)
             + (!self->is_flatpak_env))
            == 1);

  if (self->flatpak_subsandbox == NULL)
    {
      /* Start with an empty environment and populate it later */
      bwrap = flatpak_bwrap_new (flatpak_bwrap_empty_env);
      g_assert (self->bwrap_executable != NULL);
      flatpak_bwrap_add_arg (bwrap, self->bwrap_executable);
      bwrap_filesystem_arguments = flatpak_bwrap_new (flatpak_bwrap_empty_env);
      self->exports = flatpak_exports_new ();
    }
  else
    {
      append_preload_flags |= PV_APPEND_PRELOAD_FLAGS_FLATPAK_SUBSANDBOX;
    }

  /* Invariant: we have bwrap or exports iff we also have the other */
  g_assert ((bwrap != NULL) == (self->exports != NULL));
  g_assert ((bwrap != NULL) == (bwrap_filesystem_arguments != NULL));
  g_assert ((bwrap != NULL) == (self->bwrap_executable != NULL));

  container_env = _srt_env_overlay_new ();

  if (bwrap != NULL)
    {
      FlatpakFilesystemMode sysfs_mode = FLATPAK_FILESYSTEM_MODE_READ_ONLY;

      g_assert (self->exports != NULL);
      g_assert (bwrap_filesystem_arguments != NULL);

      if ((_srt_util_get_log_flags () & SRT_LOG_FLAGS_LEVEL)
          && (self->bwrap_flags & SRT_BWRAP_FLAGS_HAS_LEVEL_PREFIX))
        flatpak_bwrap_add_arg (bwrap, "--level-prefix");

      if (self->bwrap_flags & SRT_BWRAP_FLAGS_HAS_NOT_A_SECURITY_BOUNDARY)
        flatpak_bwrap_add_arg (bwrap, "--not-a-security-boundary");

      /* Protect the controlling terminal from the app/game, unless we are
       * running an interactive shell in which case that would break its
       * job control. */
      if (self->options.terminal != PV_TERMINAL_TTY && !self->options.devel)
        flatpak_bwrap_add_arg (bwrap, "--new-session");

      /* Start with just the root tmpfs (which appears automatically)
       * and the standard API filesystems */
      if (self->options.for_steam_client || self->options.devel)
        sysfs_mode = FLATPAK_FILESYSTEM_MODE_READ_WRITE;

      pv_bwrap_add_api_filesystems (bwrap_filesystem_arguments,
                                    sysfs_mode,
                                    compat_flags);

      if (interpreter_root != NULL)
        {
          g_autofree gchar *etc_src = g_build_filename (interpreter_root->path,
                                                        "etc", NULL);

          /* Mount the interpreter root on /run/host. We'll use this
           * to look at paths like /run/host/etc/os-release. */
          flatpak_bwrap_add_args (bwrap_filesystem_arguments,
                                  "--ro-bind", etc_src, "/run/host/etc",
                                  NULL);

          if (!pv_bwrap_bind_usr (bwrap,
                                  interpreter_root->path,
                                  interpreter_root->fd,
                                  "/run/host", error))
            goto out;

          /* Mount the real root on /run/interpreter-host. We'll use this
           * to run the interpreter. */
          flatpak_bwrap_add_args (bwrap_filesystem_arguments,
                                  "--ro-bind", "/etc", "/run/interpreter-host/etc",
                                  NULL);

          if (!pv_bwrap_bind_usr (bwrap, "/",
                                  real_root_fd,
                                  "/run/interpreter-host",
                                  error))
            goto out;

          /* PvRuntime will mount the graphics stack provider on /gfx
           * and PV_RUNTIME_PATH_INTERPRETER_ROOT/gfx if necessary. */
        }
      else
        {
          flatpak_bwrap_add_args (bwrap_filesystem_arguments,
                                  "--ro-bind", "/etc", "/run/host/etc", NULL);

          if (!pv_bwrap_bind_usr (bwrap, "/",
                                  real_root_fd,
                                  "/run/host", error))
            goto out;
        }

      /* steam-runtime-system-info uses this to detect pressure-vessel, so we
       * need to create it even if it will be empty */
      flatpak_bwrap_add_args (bwrap_filesystem_arguments,
                              "--dir",
                              "/run/pressure-vessel",
                              NULL);
    }

  if (self->options.runtime != NULL)
    {
      G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) timer =
        _srt_profiling_start ("Setting up runtime");
      g_autoptr(GPtrArray) graphics_providers = NULL;
      PvRuntimeFlags flags = PV_RUNTIME_FLAGS_NONE;
      g_autofree gchar *runtime_resolved = NULL;
      const char *runtime_path = NULL;

      if (self->options.deterministic)
        flags |= PV_RUNTIME_FLAGS_DETERMINISTIC;

      if (self->options.gc_runtimes)
        flags |= PV_RUNTIME_FLAGS_GC_RUNTIMES;

      if (self->options.generate_locales)
        flags |= PV_RUNTIME_FLAGS_GENERATE_LOCALES;

      if (_srt_util_is_debugging ())
        flags |= PV_RUNTIME_FLAGS_VERBOSE;

      if (self->options.import_ca_certs)
        flags |= PV_RUNTIME_FLAGS_IMPORT_CA_CERTS;

      if (self->options.import_openxr_1_runtimes)
        flags |= PV_RUNTIME_FLAGS_IMPORT_OPENXR_1_RUNTIMES;

      if (self->options.import_openxr_1_layers)
        flags |= PV_RUNTIME_FLAGS_IMPORT_OPENXR_1_LAYERS;

      if (self->options.import_vulkan_layers)
        flags |= PV_RUNTIME_FLAGS_IMPORT_VULKAN_LAYERS;

      if (self->options.copy_runtime)
        flags |= PV_RUNTIME_FLAGS_COPY_RUNTIME;

      if (self->options.deterministic || self->options.single_thread)
        flags |= PV_RUNTIME_FLAGS_SINGLE_THREAD;

      if (self->flatpak_subsandbox != NULL)
        flags |= PV_RUNTIME_FLAGS_FLATPAK_SUBSANDBOX;

      if (interpreter_root != NULL)
        flags |= PV_RUNTIME_FLAGS_INTERPRETER_ROOT;

      if (self->options.graphics_provider != NULL
          && self->options.graphics_provider[0] != '\0')
        {
          graphics_providers = pv_graphics_provider_build_array (self->run_in_current_context,
                                                                 self->options.graphics_provider,
                                                                 self->options.arch_graphics_providers,
                                                                 tuples,
                                                                 n_tuples,
                                                                 host_machine,
                                                                 flags,
                                                                 error);

          if (graphics_providers == NULL)
            goto out;
        }

      runtime_path = self->options.runtime;

      if (!g_path_is_absolute (runtime_path)
          && self->options.runtime_base != NULL
          && self->options.runtime_base[0] != '\0')
        {
          runtime_resolved = g_build_filename (self->options.runtime_base,
                                               runtime_path, NULL);
          runtime_path = runtime_resolved;
        }

      g_debug ("Configuring runtime %s...", runtime_path);

      if (self->is_flatpak_env && !self->options.copy_runtime)
        {
          glnx_throw (error,
                      "Cannot set up a runtime inside Flatpak without "
                      "making a mutable copy");
          goto out;
        }

      self->runtime = pv_runtime_new (runtime_path,
                                      self->options.variable_dir,
                                      self->bwrap_executable,
                                      self->options.architectures,
                                      graphics_providers,
                                      g_quark_to_string (self->current_home),
                                      _srt_const_strv (self->original_environ),
                                      self->run_in_current_context,
                                      flags,
                                      self->workarounds,
                                      error);

      if (self->runtime == NULL)
        goto out;

      if (!pv_runtime_bind (self->runtime,
                            self->exports,
                            bwrap_filesystem_arguments,
                            container_env,
                            error))
        goto out;

      if (self->flatpak_subsandbox != NULL)
        {
          const char *app = pv_runtime_get_modified_app (self->runtime);
          const char *usr = pv_runtime_get_modified_usr (self->runtime);

          flatpak_bwrap_add_args (self->flatpak_subsandbox,
                                  "--app-path", app == NULL ? "" : app,
                                  "--share-pids",
                                  "--usr-path", usr,
                                  NULL);
        }
    }
  else if (self->flatpak_subsandbox != NULL)
    {
      /* Nothing special to do here: we'll just create the subsandbox
       * without changing the runtime, which means we inherit the
       * Flatpak's normal runtime. */
    }
  else
    {
      g_assert (!self->is_flatpak_env);
      g_assert (bwrap != NULL);
      g_assert (bwrap_filesystem_arguments != NULL);
      g_assert (self->exports != NULL);

      if (!pv_wrap_use_host_os (real_root_fd,
                                self->exports, bwrap_filesystem_arguments,
                                self->arbitrary_dirent_order,
                                self->workarounds,
                                error))
        goto out;
    }

  /* Protect other users' homes (but guard against the unlikely
   * situation that they don't exist). We use the FlatpakExports for this
   * so that it can be overridden by --filesystem=/home or
   * pv_wrap_use_home(), and so that it is sorted correctly with
   * respect to all the other home-directory-related exports. */
  if (self->exports != NULL
      && g_file_test ("/home", G_FILE_TEST_EXISTS))
    pv_exports_mask_or_log (self->exports, "/home");

  g_debug ("Making home directory available...");

  if (self->flatpak_subsandbox != NULL)
    {
      if (home_mode == PV_HOME_MODE_SHARED)
        {
          /* Nothing special to do here: we'll use the same home directory
           * and exports that the parent Flatpak sandbox used. */
        }
      else
        {
          /* Not yet supported */
          glnx_throw (error,
                      "Cannot use a game-specific home directory in a "
                      "Flatpak subsandbox");
          goto out;
        }
    }
  else
    {
      FlatpakFilesystemMode share_host = FLATPAK_FILESYSTEM_MODE_NONE;

      g_assert (!self->is_flatpak_env);
      g_assert (bwrap != NULL);
      g_assert (bwrap_filesystem_arguments != NULL);
      g_assert (self->exports != NULL);

      bwrap_home_arguments = flatpak_bwrap_new (flatpak_bwrap_empty_env);

      if (!pv_wrap_use_home (home_mode,
                             g_quark_to_string (self->current_home),
                             private_home,
                             self->exports, bwrap_home_arguments, container_env,
                             self->workarounds,
                             error))
        goto out;

      /* If runtime == NULL then we would already have shared the same
       * root directories, above, in case they're functionally necessary
       * (for example /opt might contain important libraries). */
      if (self->options.runtime != NULL
          && pv_wrap_context_has_filesystem (self, "host", &share_host)
          && share_host > FLATPAK_FILESYSTEM_MODE_NONE
          && !pv_export_root_dirs_like_filesystem_host (real_root_fd,
                                                        self->exports,
                                                        share_host,
                                                        self->arbitrary_dirent_order,
                                                        error))
        goto out;
    }

  if (!self->options.share_pid)
    {
      if (bwrap != NULL)
        {
          g_warning ("Unsharing process ID namespace. This is not expected "
                     "to work...");
          /* The top-level process inside the container is pv-adverb,
           * which reaps all child processes, so it's fine for it
           * to act as pid 1 inside the container - and that has better
           * handling of terminating signals than if we let bwrap provide
           * its own pid 1 */
          flatpak_bwrap_add_args (bwrap,
                                  "--as-pid-1",
                                  "--unshare-pid",
                                  NULL);
        }
      else
        {
          g_assert (self->flatpak_subsandbox != NULL);
          /* steam-runtime-launch-client currently hard-codes this */
          g_warning ("Process ID namespace is always shared when using a "
                     "Flatpak subsandbox");
        }
    }

  if (self->exports != NULL)
    pv_share_temp_dir (self->exports, container_env);

  if (self->flatpak_subsandbox != NULL)
    {
      /* We special case libshared-library-guard because usually
       * its blockedlist file is located in `/app` and we need
       * to change that to the `/run/parent` counterpart */
      const gchar *blockedlist = g_getenv ("SHARED_LIBRARY_GUARD_CONFIG");

      if (blockedlist == NULL)
        blockedlist = "/app/etc/freedesktop-sdk.ld.so.blockedlist";

      if (g_file_test (blockedlist, G_FILE_TEST_EXISTS)
          && (g_str_has_prefix (blockedlist, "/app/")
              || g_str_has_prefix (blockedlist, "/usr/")
              || g_str_has_prefix (blockedlist, "/lib")))
        {
          g_autofree gchar *adjusted_blockedlist = NULL;
          adjusted_blockedlist = g_build_filename ("/run/parent",
                                                   blockedlist, NULL);
          _srt_env_overlay_set (container_env, "SHARED_LIBRARY_GUARD_CONFIG",
                             adjusted_blockedlist);
        }
    }

  adverb_preload_argv = g_ptr_array_new_with_free_func (g_free);

  /* We need the LD_PRELOADs from Steam visible at the paths that were
   * used for them, which might be their physical rather than logical
   * locations. Steam doesn't generally use LD_AUDIT, but the Steam app
   * on Flathub does, and it needs similar handling. */
  pv_wrap_append_preloads (self, adverb_preload_argv,
                           (WrapPreloadModule *) self->options.preload_modules->data,
                           self->options.preload_modules->len,
                           append_preload_flags);

  pv_bind_and_propagate_from_environ (self, home_mode, container_env);

  if (self->flatpak_subsandbox == NULL)
    {
      const PvAppFrameworkPath *framework_paths;

      g_assert (bwrap != NULL);
      g_assert (bwrap_filesystem_arguments != NULL);
      g_assert (self->exports != NULL);

      /* Bind-mount /run/udev to support games that detect joysticks by using
       * udev directly. We only do that when the host's version of libudev.so.1
       * is in use, because there is no guarantees that the container's libudev
       * is compatible with the host's udevd. */
      if (self->runtime != NULL)
        {
          for (i = 0; i < n_tuples; i++)
            {
              GStatBuf ignored;
              g_autofree gchar *override = NULL;

              override = g_build_filename (pv_runtime_get_overrides (self->runtime),
                                           "lib", g_quark_to_string (tuples[i]),
                                           "libudev.so.1", NULL);

              if (g_lstat (override, &ignored) == 0)
                {
                  g_debug ("We are using the host's version of \"libudev.so.1\", trying to bind-mount /run/udev too...");
                  pv_exports_expose_or_log (self->exports,
                                            FLATPAK_FILESYSTEM_MODE_READ_ONLY,
                                            "/run/udev");
                  break;
                }
            }
        }

      /* Expose hard-coded library paths from other app runtime frameworks'
       * dependency management: /nix, /snap, etc. */
      for (framework_paths = pv_runtime_get_other_app_framework_paths ();
           framework_paths->path != NULL;
           framework_paths++)
        {
          if (self->workarounds & framework_paths->ignore_if)
            g_warning ("Not sharing %s with container to work around %s",
                       framework_paths->path, framework_paths->bug);
          else
            pv_exports_expose_or_log (self->exports,
                                      FLATPAK_FILESYSTEM_MODE_READ_ONLY,
                                      framework_paths->path);
        }

      /* Make arbitrary filesystems available. This is not as complete as
       * Flatpak yet. */
      if (!pv_wrap_setup_export_filesystems (self, error))
        goto out;

      /* Make sure the current working directory (the game we are going to
       * run) is available. Some games write here. */
      g_debug ("Making current working directory available...");

      cwd_p_host = pv_current_namespace_path_to_host_path (cwd_p);

      if (self->current_home_fd >= 0
          && _srt_fstatat_is_same_file (self->current_home_fd, "", AT_FDCWD, cwd_p))
        {
          g_info ("Not making physical working directory \"%s\" available to "
                  "container because it is the home directory",
                  cwd_p);
        }
      else
        {
          /* Inability to share the current working directory is unexpected
           * and will break assumptions, so warn if that happens.
           *
           * If in Flatpak, we assume that cwd_p_host is visible in the
           * current namespace as well as in the host, because it's
           * either in our ~/.var/app/$FLATPAK_ID, or a --filesystem that
           * was exposed from the host. */
          pv_exports_expose_or_warn (self->exports,
                                     FLATPAK_FILESYSTEM_MODE_READ_WRITE,
                                     cwd_p_host);
        }

      flatpak_bwrap_add_args (bwrap,
                              "--chdir", cwd_p_host,
                              NULL);
    }
  else
    {
      flatpak_bwrap_add_args (self->flatpak_subsandbox,
                              "--directory", cwd_p,
                              NULL);
    }

  _srt_env_overlay_set (container_env, "PWD", NULL);

  /* Put Steam Runtime environment variables back, if /usr is mounted
   * from the host. */
  if (self->runtime == NULL)
    {
      g_debug ("Making Steam Runtime available...");

      /* We need libraries from the Steam Runtime, so make sure that's
       * visible (it should never need to be read/write though) */
      if (self->options.env_if_host != NULL)
        {
          for (i = 0; self->options.env_if_host[i] != NULL; i++)
            {
              char *equals = strchr (self->options.env_if_host[i], '=');

              g_assert (equals != NULL);

              /* $STEAM_RUNTIME is functionally necessary if used, so
               * always warn if it cannot be exposed */
              if (self->exports != NULL
                  && g_str_has_prefix (self->options.env_if_host[i],
                                       "STEAM_RUNTIME=/"))
                pv_exports_expose_or_warn (self->exports,
                                           FLATPAK_FILESYSTEM_MODE_READ_ONLY,
                                           equals + 1);

              *equals = '\0';

              _srt_env_overlay_set (container_env, self->options.env_if_host[i],
                                   equals + 1);

              *equals = '=';
            }
        }
    }

  /* Convert the exported directories into extra bubblewrap arguments */
  if (self->exports != NULL)
    {
      g_autoptr(FlatpakBwrap) exports_bwrap =
        flatpak_bwrap_new (flatpak_bwrap_empty_env);

      g_assert (bwrap != NULL);
      g_assert (bwrap_filesystem_arguments != NULL);

      if (bwrap_home_arguments != NULL)
        {
          /* The filesystem arguments to set up a fake $HOME (if any) have
           * to come before the exports, as they do in Flatpak, so that
           * mounting the fake $HOME will not mask the exports used for
           * ~/.steam, etc. */
          g_warn_if_fail (g_strv_length (bwrap_home_arguments->envp) == 0);
          flatpak_bwrap_append_bwrap (bwrap, bwrap_home_arguments);
          g_clear_pointer (&bwrap_home_arguments, flatpak_bwrap_free);
        }

      flatpak_exports_append_bwrap_args (self->exports, exports_bwrap);
      g_warn_if_fail (g_strv_length (exports_bwrap->envp) == 0);
      if (!pv_bwrap_append_adjusted_exports (bwrap, exports_bwrap,
                                             g_quark_to_string (self->current_home),
                                             interpreter_root,
                                             self->workarounds,
                                             error))
        goto out;

      /* The other filesystem arguments have to come after the exports
       * so that if the exports set up symlinks, the other filesystem
       * arguments like --dir work with the symlinks' targets. */
      g_warn_if_fail (g_strv_length (bwrap_filesystem_arguments->envp) == 0);
      flatpak_bwrap_append_bwrap (bwrap, bwrap_filesystem_arguments);
      g_clear_pointer (&bwrap_filesystem_arguments, flatpak_bwrap_free);
    }

  if (bwrap != NULL)
    {
      g_autoptr(FlatpakBwrap) sharing_bwrap = NULL;

      sharing_bwrap = pv_wrap_share_sockets (self,
                                             container_env,
                                             _srt_const_strv (self->original_environ),
                                             (self->runtime != NULL),
                                             self->is_flatpak_env);
      g_warn_if_fail (g_strv_length (sharing_bwrap->envp) == 0);

      if (!pv_bwrap_append_adjusted_exports (bwrap, sharing_bwrap,
                                             g_quark_to_string (self->current_home),
                                             interpreter_root,
                                             self->workarounds,
                                             error))
        goto out;
    }
  else if (self->flatpak_subsandbox != NULL)
    {
      pv_wrap_set_icons_env_vars (container_env, _srt_const_strv (self->original_environ));
    }

  if (self->runtime != NULL)
    {
      if (!pv_runtime_use_shared_sockets (self->runtime, bwrap, container_env,
                                          error))
        goto out;
    }

  payload_command = flatpak_bwrap_new (flatpak_bwrap_empty_env);

  /* We build the "payload" command earlier than the obvious point,
   * in order to be early enough that we can still edit container_env. */
  if (!pv_wrap_context_append_payload_command (self,
                                               (const char * const *) &argv[1],
                                               argc - 1,
                                               payload_command,
                                               container_env,
                                               error))
    goto out;

  if (self->is_flatpak_env)
    {
      /* Let these inherit from the sub-sandbox environment */
      _srt_env_overlay_inherit (container_env, "FLATPAK_ID");
      _srt_env_overlay_inherit (container_env, "FLATPAK_SANDBOX_DIR");
      _srt_env_overlay_inherit (container_env, "DBUS_SESSION_BUS_ADDRESS");
      _srt_env_overlay_inherit (container_env, "DBUS_SYSTEM_BUS_ADDRESS");
      _srt_env_overlay_inherit (container_env, "DISPLAY");
      _srt_env_overlay_inherit (container_env, "XDG_RUNTIME_DIR");

      /* The bwrap envp will be completely ignored when calling
       * s-r-launch-client, and in fact putting them in its environment
       * variables would be wrong, because s-r-launch-client needs to see the
       * current execution environment's DBUS_SESSION_BUS_ADDRESS
       * (if different). For this reason we convert them to `--setenv`. */
      g_assert (self->flatpak_subsandbox != NULL);

      if (!pv_bwrap_container_env_to_subsandbox_argv (self->flatpak_subsandbox,
                                                      container_env,
                                                      error))
        goto out;
    }

  final_argv = flatpak_bwrap_new (self->original_environ);

  /* Populate final_argv->envp, overwriting its copy of original_environ.
   * We skip this if we are in a Flatpak environment, because in that case
   * we already used `--env-fd` for all the variables that we care about and
   * the final_argv->envp will be ignored anyway, other than as a way to
   * invoke s-r-launch-client (for which original_environ is appropriate). */
  if (!self->is_flatpak_env)
    pv_bwrap_container_env_to_envp (final_argv, container_env);

  /* Now that we've populated final_argv->envp, it's too late to change
   * any environment variables. Make sure that under normal circumstances
   * we get an assertion failure if we try.
   * However, if we're working around a setuid bwrap, we need to keep this
   * around a little bit longer. */
  if (!(self->workarounds & PV_WORKAROUND_FLAGS_BWRAP_SETUID))
    g_clear_pointer (&container_env, _srt_env_overlay_unref);

  if (bwrap != NULL)
    {
      /* Tell the application that it's running under a container manager
       * in a generic way (based on https://systemd.io/CONTAINER_INTERFACE/,
       * although a lot of that document is intended for "system"
       * containers and is less suitable for "app" containers like
       * Flatpak and pressure-vessel). */
      flatpak_bwrap_add_args (bwrap,
                              "--setenv", "container", "pressure-vessel",
                              NULL);
      if (!flatpak_bwrap_add_args_data (bwrap,
                                        "container-manager",
                                        "pressure-vessel\n", -1,
                                        "/run/host/container-manager",
                                        error))
        goto out;


      if (_srt_util_is_debugging ())
        {
          g_debug ("%s options before bundling:", self->bwrap_executable);

          for (i = 0; i < bwrap->argv->len; i++)
            {
              g_autofree gchar *quoted = NULL;

              quoted = g_shell_quote (g_ptr_array_index (bwrap->argv, i));
              g_debug ("\t%s", quoted);
            }
        }

      if (!self->options.only_prepare)
        {
          if (!flatpak_bwrap_bundle_args (bwrap, 1, -1, FALSE, error))
            goto out;
        }
    }

  argv_in_container = flatpak_bwrap_new (flatpak_bwrap_empty_env);

  /* Set up adverb inside container */
    {
      g_autoptr(FlatpakBwrap) adverb_argv = NULL;
      SrtEmulatorServer *emulator_server = NULL;

      adverb_argv = flatpak_bwrap_new (flatpak_bwrap_empty_env);

      if (self->runtime != NULL)
        {
          /* This includes the arguments necessary to regenerate the
           * ld.so cache */
          if (!pv_runtime_get_adverb (self->runtime, adverb_argv, error))
            goto out;
        }
      else
        {
          /* If not using a runtime, the adverb in the container has the
           * same path as outside and we assume no special LD_LIBRARY_PATH
           * is needed */
          g_autofree gchar *adverb_in_container =
            g_build_filename (pkglibexecdir, "pv-adverb", NULL);

          flatpak_bwrap_add_arg (adverb_argv, adverb_in_container);
        }

      if (self->workarounds & PV_WORKAROUND_FLAGS_BWRAP_SETUID)
        {
          /* If bwrap is setuid, then it might have filtered some
           * environment variables out of the environment.
           * Use pv-adverb --env-fd to put them back.
           * We used to do this for only the environment variables that
           * a setuid executable would filter out, but now that we're using
           * --env-fd, it's just as easy to serialize all of them. */
          if (!pv_bwrap_container_env_to_env_fd (adverb_argv,
                                                 container_env,
                                                 error))
            goto out;
        }

      if (self->options.terminate_timeout >= 0.0)
        {
          char idle_buf[G_ASCII_DTOSTR_BUF_SIZE] = {};
          char timeout_buf[G_ASCII_DTOSTR_BUF_SIZE] = {};

          g_ascii_dtostr (idle_buf, sizeof (idle_buf),
                          self->options.terminate_idle_timeout);
          g_ascii_dtostr (timeout_buf, sizeof (timeout_buf),
                          self->options.terminate_timeout);

          if (self->options.terminate_idle_timeout > 0.0)
            flatpak_bwrap_add_arg_printf (adverb_argv,
                                          "--terminate-idle-timeout=%s",
                                          idle_buf);

          flatpak_bwrap_add_arg_printf (adverb_argv,
                                        "--terminate-timeout=%s",
                                        timeout_buf);
        }

      if (!_srt_subprocess_runner_await_emulator (self->run_in_current_context,
                                                  SRT_ARCHITECTURE_QUARK_NONE,
                                                  NULL,
                                                  &emulator_server,
                                                  error))
        goto out;

      if (emulator_server != NULL)
        {
          int exit_fd = _srt_emulator_server_steal_exit_fd (emulator_server);

          g_return_val_if_fail (exit_fd >= 0, FALSE);
          /* pv-adverb will hold the fd open for as long as any game process
           * is running, preventing the server from exiting prematurely */
          g_array_append_val (inherit_fds, exit_fd);
          flatpak_bwrap_add_arg_printf (adverb_argv, "--fd=%d", exit_fd);
        }

      if (!pv_wrap_adverb_assign_stdio (adverb_argv,
                                        self->options.terminal,
                                        inherit_fds,
                                        original_stdout,
                                        original_stderr,
                                        &tty_stdin,
                                        &tty_stdout,
                                        error))
          goto out;

      for (i = 0; i < self->options.pass_fds->len; i++)
        {
          int fd = g_array_index (self->options.pass_fds, int, i);

          g_array_append_val (inherit_fds, fd);
          flatpak_bwrap_add_arg_printf (adverb_argv, "--pass-fd=%d", fd);
        }

      flatpak_bwrap_append_args (adverb_argv, adverb_preload_argv);

      if (_srt_util_is_debugging ())
        flatpak_bwrap_add_arg (adverb_argv, "--verbose");

      flatpak_bwrap_add_arg (adverb_argv, "--");

      g_warn_if_fail (g_strv_length (adverb_argv->envp) == 0);
      flatpak_bwrap_append_bwrap (argv_in_container, adverb_argv);
    }

  g_warn_if_fail (g_strv_length (payload_command->envp) == 0);
  flatpak_bwrap_append_bwrap (argv_in_container, payload_command);

  if (self->flatpak_subsandbox != NULL)
    {
      for (i = 0; i < argv_in_container->fds->len; i++)
        {
          g_autofree char *fd_str = g_strdup_printf ("--forward-fd=%d",
                                                     g_array_index (argv_in_container->fds, int, i));
          flatpak_bwrap_add_arg (self->flatpak_subsandbox, fd_str);
        }

      for (i = 0; i < inherit_fds->len; i++)
        {
          g_autofree char *fd_str = g_strdup_printf ("--forward-fd=%d",
                                                     g_array_index (inherit_fds, int, i));
          flatpak_bwrap_add_arg (self->flatpak_subsandbox, fd_str);
        }

      flatpak_bwrap_add_arg (self->flatpak_subsandbox, "--");

      g_warn_if_fail (g_strv_length (self->flatpak_subsandbox->envp) == 0);
      flatpak_bwrap_append_bwrap (final_argv, self->flatpak_subsandbox);
    }
  else
    {
      g_assert (bwrap != NULL);
      g_warn_if_fail (g_strv_length (bwrap->envp) == 0);
      flatpak_bwrap_append_bwrap (final_argv, bwrap);
    }

  g_warn_if_fail (g_strv_length (argv_in_container->envp) == 0);
  flatpak_bwrap_append_bwrap (final_argv, argv_in_container);

  /* We'll have permuted the order anyway, so we might as well sort it,
   * to make debugging a bit easier. */
  flatpak_bwrap_sort_envp (final_argv);

  if (_srt_util_is_debugging ())
    {
      if (self->runtime != NULL && (pv_log_flags & PV_WRAP_LOG_FLAGS_OVERRIDES))
        pv_runtime_log_overrides (self->runtime);

      if (self->runtime != NULL && (pv_log_flags & PV_WRAP_LOG_FLAGS_CONTAINER))
        pv_runtime_log_container (self->runtime);

      g_debug ("Final command to execute:");

      for (i = 0; i < final_argv->argv->len; i++)
        {
          g_autofree gchar *quoted = NULL;

          quoted = g_shell_quote (g_ptr_array_index (final_argv->argv, i));
          g_debug ("\t%s", quoted);
        }

      g_debug ("Final environment:");

      for (i = 0; final_argv->envp != NULL && final_argv->envp[i] != NULL; i++)
        {
          g_autofree gchar *quoted = NULL;

          quoted = g_shell_quote (final_argv->envp[i]);
          g_debug ("\t%s", quoted);
        }
    }

  /* Clean up temporary directory before running our long-running process */
  if (self->runtime != NULL)
    pv_runtime_cleanup (self->runtime);

  flatpak_bwrap_finish (final_argv);

  if (self->options.write_final_argv != NULL)
    {
      FILE *file = fopen (self->options.write_final_argv, "w");
      if (file == NULL)
        {
          g_warning ("An error occurred trying to write out the arguments: %s",
                    g_strerror (errno));
          /* This is not a fatal error, try to continue */
        }
      else
        {
          for (i = 0; i < final_argv->argv->len; i++)
            {
              const char *arg = g_ptr_array_index (final_argv->argv, i);

              if (i == final_argv->argv->len - 1)
                g_assert (arg == NULL);
              else
                fprintf (file, "%s%c", arg, '\0');
            }

          fclose (file);
        }
    }

  if (!self->is_flatpak_env)
    {
      if (!pv_wrap_maybe_load_nvidia_modules (self->run_in_current_context, error))
        {
          g_debug ("Cannot load nvidia modules: %s", local_error->message);
          g_clear_error (&local_error);
        }
    }

  if (!_srt_subprocess_runner_await_emulator (self->run_in_current_context,
                                              SRT_ARCHITECTURE_QUARK_NONE,
                                              NULL,
                                              NULL,
                                              error))
    goto out;

  if (self->options.only_prepare)
    {
      ret = 0;
      goto out;
    }

  if (self->options.systemd_scope)
    pv_wrap_move_into_scope (steam_app_id);

  pv_bwrap_execve (final_argv,
                   (int *) inherit_fds->data, inherit_fds->len,
                   error);

out:
  if (local_error != NULL)
    {
      _srt_log_failure ("%s", local_error->message);

      if (local_error->domain == G_OPTION_ERROR)
        ret = 2;
    }

  g_clear_pointer (&adverb_preload_argv, g_ptr_array_unref);

  g_debug ("Exiting with status %d", ret);
  return ret;
}
