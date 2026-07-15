/* pv-adverb — run a command with an altered execution environment,
 * e.g. holding a lock.
 * The lock is basically flock(1), but using fcntl locks compatible with
 * those used by bubblewrap and Flatpak.
 *
 * Copyright © 2019-2021 Collabora Ltd.
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

#include <fcntl.h>
#include <locale.h>
#include <sysexits.h>
#include <sys/prctl.h>
#include <sys/types.h>
#include <sys/wait.h>

#include <glib.h>
#include <glib/gstdio.h>
#include <gio/gio.h>

#include "steam-runtime-tools/env-overlay-internal.h"
#include "steam-runtime-tools/glib-backports-internal.h"
#include "steam-runtime-tools/file-lock-internal.h"
#include "steam-runtime-tools/launcher-internal.h"
#include "steam-runtime-tools/log-internal.h"
#include "steam-runtime-tools/process-manager-internal.h"
#include "steam-runtime-tools/profiling-internal.h"
#include "steam-runtime-tools/steam-runtime-tools.h"
#include "steam-runtime-tools/system-info-internal.h"
#include "steam-runtime-tools/utils-internal.h"
#include "libglnx.h"

#include "adverb-preload.h"
#include "adverb-sdl.h"
#include "flatpak-utils-base-private.h"
#include "per-arch-dirs.h"
#include "supported-architectures.h"
#include "utils.h"
#include "wrap-interactive.h"

#define DEFAULT_TERMINATE_TIMEOUT 2.0

static const char * const *global_envp = NULL;
static GPtrArray *global_ld_so_conf_entries = NULL;
static SrtProcessManagerOptions *global_options = NULL;
static gboolean opt_clear_env = FALSE;
static gboolean opt_create = FALSE;
static SrtEmulator *opt_emulator = NULL;
static gboolean opt_generate_locales = FALSE;
static GQuark opt_ldconfig_architecture = SRT_ARCHITECTURE_QUARK_NONE;
static gchar *opt_overrides = NULL;
static gchar *opt_prefix = NULL;
static gchar *opt_regenerate_ld_so_cache = NULL;
static gchar *opt_set_ld_library_path = NULL;
static double opt_terminate_idle_timeout = 0.0;
static double opt_terminate_timeout = DEFAULT_TERMINATE_TIMEOUT;
static gboolean opt_terminate_with_main = FALSE;
static gboolean opt_verbose = FALSE;
static gboolean opt_version = FALSE;
static gboolean opt_wait = FALSE;
static gboolean opt_write = FALSE;

/* (element-type PvAdverbPreloadModule) */
static GArray *opt_preload_modules = NULL;

static gboolean
opt_emulator_cb (const char *name,
                 const char *value,
                 void *user_data,
                 GError **error)
{
  g_autoptr(SrtEmulator) emulator = NULL;

  if (opt_emulator != NULL)
    {
      g_set_error (error, G_OPTION_ERROR, G_OPTION_ERROR_FAILED,
                   "%s option can only be used once", name);
      return FALSE;
    }

  emulator = _srt_emulator_new_from_manifest (value, error);

  if (emulator == NULL)
    return FALSE;

  opt_emulator = g_steal_pointer (&emulator);
  return TRUE;
}

static gboolean
opt_fd_cb (const char *name,
           const char *value,
           gpointer data,
           GError **error)
{
  return _srt_process_manager_options_lock_fd_cli (global_options,
                                                   name, value, error);
}

static gboolean
opt_add_ld_so_cb (const char *name,
                  const char *value,
                  gpointer data,
                  GError **error)
{
  g_return_val_if_fail (global_ld_so_conf_entries != NULL, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);
  g_return_val_if_fail (value != NULL, FALSE);

  g_ptr_array_add (global_ld_so_conf_entries, g_strdup (value));
  return TRUE;
}

static gboolean
opt_ld_something (const char *option,
                  gsize index_in_preload_variables,
                  const char *value,
                  gpointer data,
                  GError **error)
{
  PvAdverbPreloadModule module = PV_ADVERB_PRELOAD_MODULE_INIT;

  if (!pv_adverb_preload_module_parse_adverb_cli (&module,
                                                  option,
                                                  index_in_preload_variables,
                                                  value,
                                                  error))
    return FALSE;

  if (opt_preload_modules == NULL)
    {
      opt_preload_modules = g_array_new (FALSE, FALSE, sizeof (PvAdverbPreloadModule));
      g_array_set_clear_func (opt_preload_modules, pv_adverb_preload_module_clear);
    }

  g_array_append_val (opt_preload_modules, module);
  return TRUE;
}

static gboolean
opt_ld_audit_cb (const gchar *option_name,
                 const gchar *value,
                 gpointer data,
                 GError **error)
{
  return opt_ld_something (option_name, PV_PRELOAD_VARIABLE_INDEX_LD_AUDIT,
                           value, data, error);
}

static gboolean
opt_ld_preload_cb (const gchar *option_name,
                   const gchar *value,
                   gpointer data,
                   GError **error)
{
  return opt_ld_something (option_name, PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
                           value, data, error);
}

static gboolean
opt_ldconfig_architecture_cb (const char *name,
                              const char *value,
                              void *user_data,
                              GError **error)
{
  if (opt_ldconfig_architecture != SRT_ARCHITECTURE_QUARK_NONE)
    {
      g_set_error (error, G_OPTION_ERROR, G_OPTION_ERROR_FAILED,
                   "%s option can only be used once", name);
      return FALSE;
    }

  opt_ldconfig_architecture = _srt_architecture_guess_from_user_input (value,
                                                                       NULL,
                                                                       error);
  return (opt_ldconfig_architecture != SRT_ARCHITECTURE_QUARK_NONE);
}

static gboolean
opt_assign_fd_cb (const char *name,
                  const char *value,
                  gpointer data,
                  GError **error)
{
  return _srt_process_manager_options_assign_fd_cli (global_options,
                                                     name, value, error);
}

static gboolean
opt_pass_fd_cb (const char *name,
                const char *value,
                gpointer data,
                GError **error)
{
  return _srt_process_manager_options_pass_fd_cli (global_options,
                                                   name, value, error);
}

static gboolean
opt_lock_file_cb (const char *name,
                  const char *value,
                  gpointer data,
                  GError **error)
{
  SrtFileLock *lock;
  SrtFileLockFlags flags = SRT_FILE_LOCK_FLAGS_NONE;

  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);
  g_return_val_if_fail (value != NULL, FALSE);

  if (opt_create)
    flags |= SRT_FILE_LOCK_FLAGS_CREATE;

  if (opt_write)
    flags |= SRT_FILE_LOCK_FLAGS_EXCLUSIVE;

  if (opt_wait)
    flags |= SRT_FILE_LOCK_FLAGS_WAIT;

  lock = srt_file_lock_new (AT_FDCWD, value, flags, error);

  if (lock == NULL)
    return FALSE;

  _srt_process_manager_options_take_lock (global_options,
                                          g_steal_pointer (&lock));
  return TRUE;
}

static gboolean
run_helper_sync (SrtSubprocessRunner *runner,
                 GQuark architecture,
                 const char * const *argv,
                 gchar **child_stderr,
                 int *wait_status,
                 GError **error)
{
  g_autoptr(SrtCompletedSubprocess) completed = NULL;
  SrtHelperFlags flags;

  g_return_val_if_fail (argv != NULL, FALSE);
  g_return_val_if_fail (argv[0] != NULL, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  /* We use LEAVE_FDS_OPEN to work around a deadlock in older GLib,
   * and to avoid wasting a lot of time closing fds if the rlimit for
   * maximum open file descriptors is high. Because we're waiting for the
   * subprocess to finish anyway, it doesn't really matter that any fds
   * that are not close-on-execute will get leaked into the child. */
  flags = SRT_HELPER_FLAGS_SEARCH_PATH | SRT_HELPER_FLAGS_LEAVE_FDS_OPEN;

  /* The adverb should wait for its child before it exits, but if it
   * gets terminated prematurely, we want the child to terminate too.
   * The child could reset this, but we assume it usually won't.
   * This makes it exit even if we are killed by SIGKILL, unless it
   * takes steps not to be. */
  flags |= SRT_HELPER_FLAGS_TERMINATE_WITH_PARENT;

  completed = _srt_subprocess_runner_run_sync (runner,
                                               flags,
                                               architecture,
                                               argv,
                                               SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
                                               SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
                                               error);

  if (completed == NULL)
    return FALSE;

  /* This has the side-effect of debug-logging stdout, stderr and wait status */
  _srt_completed_subprocess_report (completed, wait_status, NULL, NULL, NULL);

  if (child_stderr != NULL)
    *child_stderr = _srt_completed_subprocess_steal_stderr (completed);

  return TRUE;
}

static gboolean
regenerate_ld_so_cache (SrtSubprocessRunner *runner,
                        GQuark ldconfig_architecture,
                        const GPtrArray *ld_so_cache_paths,
                        const char *dir,
                        GError **error)
{
  g_autoptr(GError) local_error = NULL;
  g_autoptr(GPtrArray) argv = g_ptr_array_new ();
  g_autoptr(GString) conf = g_string_new ("");
  g_autoptr(SrtSubprocessRunner) chdir_runner = NULL;
  g_autofree gchar *child_stderr = NULL;
  g_autofree gchar *conf_path = g_build_filename (dir, "ld.so.conf", NULL);
  g_autofree gchar *rt_conf_path = g_build_filename (dir, "runtime-ld.so.conf", NULL);
  g_autofree gchar *replace_path = g_build_filename (dir, "ld.so.cache", NULL);
  g_autofree gchar *new_path = g_build_filename (dir, "new-ld.so.cache", NULL);
  g_autofree gchar *contents = NULL;
  int wait_status;
  gsize i;

  for (i = 0; ld_so_cache_paths != NULL && i < ld_so_cache_paths->len; i++)
    {
      const gchar *value = g_ptr_array_index (ld_so_cache_paths, i);
      if (strchr (value, '\n') != NULL
          || strchr (value, '\t') != NULL
          || value[0] != '/')
        return glnx_throw (error,
                           "Cannot include path entry \"%s\" in ld.so.conf",
                           value);

      g_debug ("%s: Adding \"%s\" to beginning of ld.so.conf",
               G_STRFUNC, value);
      g_string_append (conf, value);
      g_string_append_c (conf, '\n');
    }

  /* Ignore read error, if any */
  if (g_file_get_contents (rt_conf_path, &contents, NULL, NULL))
    {
      g_debug ("%s: Appending runtime's ld.so.conf:\n%s", G_STRFUNC, contents);
      g_string_append (conf, contents);
    }

  /* This atomically replaces conf_path, so we don't need to do the
   * atomic bit ourselves */
  if (!g_file_set_contents (conf_path, conf->str, -1, error))
    return FALSE;

  while (TRUE)
    {
      char *newline = strchr (conf->str, '\n');

      if (newline != NULL)
        *newline = '\0';

      g_debug ("%s: final ld.so.conf: %s", G_STRFUNC, conf->str);

      if (newline != NULL)
        g_string_erase (conf, 0, newline + 1 - conf->str);
      else
        break;
    }

  chdir_runner = _srt_subprocess_runner_new_swap_working_directory (runner, dir);

  /* Items in this GPtrArray are borrowed, not copied.
   *
   * /sbin/ldconfig might be a symlink into /run/host, or it might
   * be from the runtime, depending which version of glibc we're
   * using.
   *
   * ldconfig overwrites the file in-place rather than atomically,
   * so we write to a new filename, and do the atomic-overwrite
   * ourselves if ldconfig succeeds. */
  g_ptr_array_add (argv, (char *) "/sbin/ldconfig");
  g_ptr_array_add (argv, (char *) "-f");    /* Path to ld.so.conf */
  g_ptr_array_add (argv, conf_path);
  g_ptr_array_add (argv, (char *) "-C");    /* Path to new cache */
  g_ptr_array_add (argv, new_path);
  g_ptr_array_add (argv, (char *) "-X");    /* Don't update symlinks */

  if (_srt_util_is_debugging ())
    g_ptr_array_add (argv, (char *) "-v");

  g_ptr_array_add (argv, NULL);

  if (!run_helper_sync (chdir_runner,
                        ldconfig_architecture,
                        (const char * const *) argv->pdata,
                        &child_stderr,
                        &wait_status,
                        error))
    return glnx_prefix_error (error, "Cannot run /sbin/ldconfig");

  if (!g_spawn_check_wait_status (wait_status, &local_error))
    {
      if (child_stderr != NULL && child_stderr[0] != '\0')
        {
          g_set_error (error, local_error->domain, local_error->code,
                       ("Unable to generate %s: %s.\n"
                        "Diagnostic output:\n%s"),
                       new_path,
                       local_error->message,
                       child_stderr);
        }
      else
        {
          g_set_error (error, local_error->domain, local_error->code,
                       "Unable to generate %s: %s",
                       new_path,
                       local_error->message);
        }

      return FALSE;
    }

  /* Atomically replace ld.so.cache with new-ld.so.cache. */
  if (!glnx_renameat (AT_FDCWD, new_path, AT_FDCWD, replace_path, error))
    return glnx_prefix_error (error, "Cannot move %s to %s",
                              new_path, replace_path);

  if (_srt_util_is_debugging ())
    {
      const char * const read_back_argv[] =
      {
        "/sbin/ldconfig",
        "-p",
        NULL
      };

      if (!run_helper_sync (runner,
                            ldconfig_architecture,
                            read_back_argv,
                            NULL,
                            NULL,
                            error))
        return glnx_prefix_error (error, "Cannot run /sbin/ldconfig -p");
    }

  return TRUE;
}

/*
 * generate_locales:
 * @runner: Execution environment for helper tools
 * @architecture: Our best guess at the architecture of the helper tools,
 *  or %SRT_ARCHITECTURE_QUARK_NONE if unsure
 * @temp_dir: Directory containing locales, to be added to `$LOCPATH`
 *  on success
 * @error: The usual
 *
 * On success, @temp_dir may either be initialized or deleted.
 * If `temp_dir->initialized` is true, then we generated at least one locale,
 * and the caller is responsible for cleaning up the @temp_dir when they have
 * finished using the locales.
 * If `temp_dir->initialized` is false, then we didn't need to generate any.
 *
 * On failure, the caller is responsible for eventually cleaning up
 * the @temp_dir.
 *
 * Returns: %TRUE on success
 */
static gboolean
generate_locales (SrtSubprocessRunner *runner,
                  GQuark architecture,
                  GLnxTmpDir *temp_dir,
                  GError **error)
{
  g_autoptr(GDir) dir = NULL;
  g_autoptr(GPtrArray) pvlg = NULL;
  int wait_status;
  g_autofree gchar *child_stderr = NULL;

  g_return_val_if_fail (temp_dir != NULL, FALSE);
  g_return_val_if_fail (!temp_dir->initialized, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  if (!glnx_mkdtemp ("pressure-vessel-locales-XXXXXX", 0755, temp_dir, error))
    return glnx_prefix_error (error,
                              "Cannot create temporary directory for locales");

  pvlg = _srt_subprocess_runner_get_helper (runner,
                                            NULL,   /* no tuple - it's a script */
                                            NULL,
                                            "pv-locale-gen",
                                            SRT_HELPER_FLAGS_NONE,
                                            error);

  if (pvlg == NULL)
    return FALSE;

  g_ptr_array_add (pvlg, g_strdup ("--output-dir"));
  g_ptr_array_add (pvlg, g_strdup (temp_dir->path));
  g_ptr_array_add (pvlg, g_strdup ("--verbose"));
  g_ptr_array_add (pvlg, NULL);

  if (!run_helper_sync (runner,
                        architecture,
                        (const char * const *) pvlg->pdata,
                        &child_stderr,
                        &wait_status,
                        error))
    return glnx_prefix_error (error, "Cannot run pv-locale-gen");

  if (WIFEXITED (wait_status) && WEXITSTATUS (wait_status) == EX_OSFILE)
    {
      /* locale-gen exits 72 (EX_OSFILE) if it had to correct for
       * missing locales at OS level. This is not an error, but deserves
       * a warning, since it costs around 10 seconds even on a fast SSD. */
      g_printerr ("%s", child_stderr);
      g_warning ("Container startup will be faster if missing locales are created at OS level");
    }
  else if (!g_spawn_check_wait_status (wait_status, error))
    {
      return glnx_prefix_error (error, "Unable to generate locales");
    }
  /* else all locales were already present (exit status 0) */

  dir = g_dir_open (temp_dir->path, 0, error);

  if (dir == NULL || g_dir_read_name (dir) == NULL)
    {
      g_info ("No locales have been generated");
      glnx_tmpdir_delete (temp_dir, NULL, NULL);
      return TRUE;
    }

  /* Ownership of the temporary directory passes to the caller */
  return TRUE;
}

static gboolean
opt_ignored_cb (const char *option_name,
                const char *value,
                void *data,
                GError **error)
{
  g_warning ("%s is deprecated and no longer has any effect", option_name);
  return TRUE;
}

static GOptionEntry options[] =
{
  { "assign-fd", '\0',
    G_OPTION_FLAG_NONE, G_OPTION_ARG_CALLBACK, opt_assign_fd_cb,
    "Make fd TARGET a copy of SOURCE, like TARGET>&SOURCE in shell, "
    "and close SOURCE in the adverb process.",
    "TARGET=SOURCE" },

  { "clear-env", '\0',
    G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &opt_clear_env,
    "Run with clean environment.", NULL },

  { "fd", '\0',
    G_OPTION_FLAG_NONE, G_OPTION_ARG_CALLBACK, opt_fd_cb,
    "Take a file descriptor, already locked if desired, and keep it "
    "open. May be repeated.",
    "FD" },

  { "create", '\0',
    G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &opt_create,
    "Create each subsequent lock file if it doesn't exist.",
    NULL },
  { "no-create", '\0',
    G_OPTION_FLAG_REVERSE, G_OPTION_ARG_NONE, &opt_create,
    "Don't create subsequent nonexistent lock files [default].",
    NULL },

  { "emulator", '\0',
    G_OPTION_FLAG_FILENAME, G_OPTION_ARG_CALLBACK, opt_emulator_cb,
    "Use an emulator to run helper processes",
    "JSONFILE" },

  { "exit-with-parent", '\0',
    G_OPTION_FLAG_HIDDEN | G_OPTION_FLAG_NO_ARG, G_OPTION_ARG_CALLBACK,
    opt_ignored_cb, NULL, NULL },

  { "generate-locales", '\0',
    G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &opt_generate_locales,
    "Attempt to generate any missing locales.", NULL },
  { "no-generate-locales", '\0',
    G_OPTION_FLAG_REVERSE, G_OPTION_ARG_NONE, &opt_generate_locales,
    "Don't generate any missing locales [default].", NULL },

  { "regenerate-ld.so-cache", '\0',
    G_OPTION_FLAG_NONE, G_OPTION_ARG_FILENAME, &opt_regenerate_ld_so_cache,
    "Regenerate ld.so.cache in the given directory, incorporating "
    "the paths from \"add-ld.so-path\", if any. An empty argument results in "
    "not doing this [default].",
    "PATH" },
  { "add-ld.so-path", '\0',
    G_OPTION_FLAG_FILENAME, G_OPTION_ARG_CALLBACK, opt_add_ld_so_cb,
    "While regenerating the ld.so.cache, include PATH as an additional "
    "ld.so.conf.d entry. May be repeated.",
    "PATH" },
  { "set-ld-library-path", '\0',
    G_OPTION_FLAG_NONE, G_OPTION_ARG_FILENAME, &opt_set_ld_library_path,
    "Set the environment variable LD_LIBRARY_PATH to VALUE before "
    "executing COMMAND.",
    "VALUE" },

  { "write", '\0',
    G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &opt_write,
    "Lock each subsequent lock file for write access.",
    NULL },
  { "no-write", '\0',
    G_OPTION_FLAG_REVERSE, G_OPTION_ARG_NONE, &opt_write,
    "Lock each subsequent lock file for read-only access [default].",
    NULL },

  { "wait", '\0',
    G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &opt_wait,
    "Wait for each subsequent lock file.",
    NULL },
  { "no-wait", '\0',
    G_OPTION_FLAG_REVERSE, G_OPTION_ARG_NONE, &opt_wait,
    "Exit unsuccessfully if a lock-file is busy [default].",
    NULL },

  { "ld-audit", '\0',
    G_OPTION_FLAG_FILENAME, G_OPTION_ARG_CALLBACK, &opt_ld_audit_cb,
    "Add MODULE to LD_AUDIT before executing COMMAND.",
    "MODULE" },
  { "ld-preload", '\0',
    G_OPTION_FLAG_FILENAME, G_OPTION_ARG_CALLBACK, &opt_ld_preload_cb,
    "Add MODULE to LD_PRELOAD before executing COMMAND. Some adjustments "
    "may be performed, e.g. joining together multiple gameoverlayrenderer.so "
    "preloads into a single path by leveraging the dynamic linker token expansion",
    "MODULE" },

  { "ldconfig-architecture", '\0',
    G_OPTION_FLAG_FILENAME, G_OPTION_ARG_CALLBACK, &opt_ldconfig_architecture_cb,
    "Assume that the multiarch tuple for /sbin/ldconfig is TUPLE",
    "TUPLE" },

  { "lock-file", '\0',
    G_OPTION_FLAG_FILENAME, G_OPTION_ARG_CALLBACK, opt_lock_file_cb,
    "Open the given file and lock it, affected by options appearing "
    "earlier on the command-line. May be repeated.",
    "PATH" },

  { "overrides-path", '\0',
    G_OPTION_FLAG_NONE, G_OPTION_ARG_FILENAME, &opt_overrides,
    "Libraries and drivers set up by pressure-vessel are in PATH.",
    "PATH" },

  { "pass-fd", '\0',
    G_OPTION_FLAG_NONE, G_OPTION_ARG_CALLBACK, opt_pass_fd_cb,
    "Let the launched process inherit the given fd, "
    "while closing it in the adverb.",
    "FD" },

  { "prefix", '\0',
    G_OPTION_FLAG_NONE, G_OPTION_ARG_FILENAME, &opt_prefix,
    "pressure-vessel can be found in PATH/bin and PATH/libexec.",
    "PATH" },

  { "subreaper", '\0',
    G_OPTION_FLAG_HIDDEN | G_OPTION_FLAG_NO_ARG, G_OPTION_ARG_CALLBACK,
    opt_ignored_cb, NULL, NULL },

  { "terminate-with-main", '\0',
    G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &opt_terminate_with_main,
    "When the main COMMAND exits, terminate other descendant processes.",
    NULL },
  { "no-terminate-with-main", '\0',
    G_OPTION_FLAG_REVERSE, G_OPTION_ARG_NONE, &opt_terminate_with_main,
    "When the main COMMAND exits, other descendants may continue to run "
    "[default].",
    NULL },

  { "terminate-idle-timeout", '\0',
    G_OPTION_FLAG_NONE, G_OPTION_ARG_DOUBLE, &opt_terminate_idle_timeout,
    "When terminating descendant processes, "
    "wait this many seconds before sending the first signal. "
    "[Default: 0.0]",
    "SECONDS" },
  { "terminate-timeout", '\0',
    G_OPTION_FLAG_NONE, G_OPTION_ARG_DOUBLE, &opt_terminate_timeout,
    "When terminating descendant processes, "
    "send SIGTERM and SIGCONT, "
    "then wait this many seconds before sending SIGKILL and SIGCONT. "
    "If 0.0, skip SIGTERM and use SIGKILL immediately. "
    "[Default: " G_STRINGIFY (DEFAULT_TERMINATE_TIMEOUT) "]",
    "SECONDS" },

  { "verbose", '\0',
    G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &opt_verbose,
    "Be more verbose.", NULL },
  { "version", '\0',
    G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &opt_version,
    "Print version number and exit.", NULL },
  { NULL }
};

int
main (int argc,
      char *argv[])
{
  g_auto(SrtProcessManagerOptions) process_manager_options = SRT_PROCESS_MANAGER_OPTIONS_INIT;
  g_auto(GLnxTmpDir) locales_temp_dir = { .initialized = FALSE };
  g_auto(GStrv) envp = NULL;
  g_autoptr(GPtrArray) ld_so_conf_entries = NULL;
  g_autoptr(GOptionContext) context = NULL;
  g_autoptr(GError) local_error = NULL;
  g_autoptr(SrtEnvOverlay) env_overlay = NULL;
  g_autoptr(SrtProcessManager) process_manager = NULL;
  GError **error = &local_error;
  int ret = EX_USAGE;
  g_autofree gchar *bindir = NULL;
  g_autofree gchar *pkglibexecdir = NULL;
  glnx_autofd int original_stdout = -1;
  glnx_autofd int original_stderr = -1;
  g_autoptr(FlatpakBwrap) wrapped_command = NULL;
  g_autoptr(PvPerArchDirs) lib_temp_dirs = NULL;
  SrtSteamCompatFlags compat_flags;
  g_autoptr(GArray) tuples = NULL;
  g_autoptr(SrtSubprocessRunner) runner = NULL;
  g_autoptr(SrtSystemInfo) info = NULL;

  setlocale (LC_ALL, "");

  global_options = &process_manager_options;

  envp = g_get_environ ();
  global_envp = (const char * const *) envp;

  ld_so_conf_entries = g_ptr_array_new_with_free_func (g_free);
  global_ld_so_conf_entries = ld_so_conf_entries;

  /* Set up the initial base logging */
  if (!_srt_util_set_glib_log_handler ("pv-adverb",
                                       G_LOG_DOMAIN,
                                       SRT_LOG_FLAGS_DIVERT_STDOUT,
                                       &original_stdout, &original_stderr,
                                       error))
    {
      ret = EX_UNAVAILABLE;
      goto out;
    }

  /* Pre-cache known architecture strings as quarks before parsing
   * command-line, to avoid having to duplicate and "leak" them */
  _srt_architecture_init_known ();

  tuples = _srt_architecture_array_new ();
  pv_architecture_array_populate_from_environ (tuples);

  context = g_option_context_new (
      "COMMAND [ARG...]\n"
      "Run COMMAND [ARG...] under a subreaper, optionally holding locks etc.\n");

  g_option_context_add_main_entries (context, options, NULL);

  env_overlay = _srt_env_overlay_new ();
  g_option_context_add_group (context,
                              _srt_env_overlay_create_option_group (env_overlay));

  opt_verbose = _srt_boolean_environment ("PRESSURE_VESSEL_VERBOSE", FALSE);

  if (!g_option_context_parse (context, &argc, &argv, error))
    {
      if (g_error_matches (local_error, G_IO_ERROR, G_IO_ERROR_BUSY))
        ret = EX_TEMPFAIL;
      else if (local_error->domain == G_OPTION_ERROR)
        ret = EX_USAGE;
      else
        ret = EX_UNAVAILABLE;

      goto out;
    }

  g_clear_pointer (&context, g_option_context_free);

  if (opt_version)
    {
      g_print ("%s:\n"
               " Package: pressure-vessel\n"
               " Version: %s\n",
               argv[0], VERSION);
      ret = 0;
      goto out;
    }

  if (!_srt_util_set_glib_log_handler (NULL, G_LOG_DOMAIN,
                                       (SRT_LOG_FLAGS_DIVERT_STDOUT |
                                        SRT_LOG_FLAGS_OPTIONALLY_JOURNAL |
                                        (opt_verbose ? SRT_LOG_FLAGS_DEBUG : 0)),
                                       NULL, NULL, error))
    {
      ret = 1;
      goto out;
    }

  /* Must be called before we start any threads, but after we set up
   * logging */
  if (!_srt_process_manager_init_single_threaded (error))
    {
      ret = EX_UNAVAILABLE;
      goto out;
    }

  _srt_setenv_disable_gio_modules ();

  if (argc >= 2 && strcmp (argv[1], "--") == 0)
    {
      argv++;
      argc--;
    }

  if (argc < 2)
    {
      g_printerr ("%s: Usage: %s [OPTIONS] COMMAND [ARG...]\n",
                  g_get_prgname (),
                  g_get_prgname ());
      goto out;
    }

  if (tuples->len == 0)
    _srt_architecture_array_populate_with_defaults (tuples);

  ret = EX_UNAVAILABLE;

  process_manager_options.close_fds = TRUE;
  process_manager_options.dump_parameters = TRUE;
  process_manager_options.exit_with_parent = TRUE;
  process_manager_options.forward_signals = TRUE;
  process_manager_options.terminate_when_signaled = TRUE;
  process_manager_options.terminate_with_main = !!opt_terminate_with_main;
  process_manager_options.subreaper = TRUE;

  if (opt_terminate_idle_timeout > 0.0)
    process_manager_options.terminate_wait_usec = opt_terminate_idle_timeout * G_TIME_SPAN_SECOND;

  if (opt_terminate_timeout > 0.0)
    process_manager_options.terminate_grace_usec = opt_terminate_timeout * G_TIME_SPAN_SECOND;

  /* In the absence of --assign-fd arguments, the default is like shell
   * redirection 1>&original_stdout 2>&original_stderr */
  _srt_process_manager_options_take_original_stdout_stderr (&process_manager_options,
                                                            glnx_steal_fd (&original_stdout),
                                                            glnx_steal_fd (&original_stderr));

  global_options = NULL;
  process_manager = _srt_process_manager_new (&process_manager_options, error);

  if (process_manager == NULL)
    goto out;

  if (opt_prefix != NULL)
    {
      bindir = g_build_filename (opt_prefix, "bin", NULL);
      pkglibexecdir = g_build_filename (opt_prefix,
                                        "libexec",
                                        "steam-runtime-tools-" _SRT_API_MAJOR,
                                        NULL);
    }

  /* If we were given an emulator, we assume that pv-wrap was responsible
   * for starting its associated server already */
  runner = _srt_subprocess_runner_new_full (opt_emulator,
                                            NULL,   /* server assumed ready */
                                            global_envp,
                                            bindir,
                                            pkglibexecdir,
                                            NULL,   /* no sysroot */
                                            SRT_TEST_FLAGS_NONE,
                                            NULL);  /* cwd */

  envp = _srt_env_overlay_apply (env_overlay, envp);

  if (opt_clear_env)
    {
      wrapped_command = flatpak_bwrap_new (flatpak_bwrap_empty_env);
      wrapped_command->envp = _srt_env_overlay_apply (env_overlay,
                                                      wrapped_command->envp);
    }
  else
    {
      wrapped_command = flatpak_bwrap_new (envp);
    }

  g_clear_pointer (&env_overlay, _srt_env_overlay_unref);

  flatpak_bwrap_append_argsv (wrapped_command, &argv[1], argc - 1);
  flatpak_bwrap_finish (wrapped_command);

  if (opt_regenerate_ld_so_cache != NULL
      && opt_regenerate_ld_so_cache[0] != '\0')
    {
      if (regenerate_ld_so_cache (runner,
                                  opt_ldconfig_architecture,
                                  global_ld_so_conf_entries,
                                  opt_regenerate_ld_so_cache,
                                  error))
        {
          g_debug ("Generated ld.so.cache in %s", opt_regenerate_ld_so_cache);

          if (opt_set_ld_library_path == NULL)
            {
              g_debug ("No new value for LD_LIBRARY_PATH available");
            }
          else
            {
              g_debug ("Setting LD_LIBRARY_PATH to \"%s\"", opt_set_ld_library_path);
              flatpak_bwrap_set_env (wrapped_command, "LD_LIBRARY_PATH",
                                     opt_set_ld_library_path, TRUE);
            }
        }
      else
        {
          /* If this fails, it is not fatal - carry on anyway. However,
           * we must not use opt_set_ld_library_path in this case, because
           * in the case where we're not regenerating the ld.so.cache,
           * we have to rely on the longer LD_LIBRARY_PATH with which we
           * were invoked, which includes the library paths that were in
           * global_ld_so_conf_entries. */
          g_warning ("%s", local_error->message);
          g_warning ("Recovering by keeping our previous LD_LIBRARY_PATH");
          g_clear_error (error);
        }
    }
  else if (opt_set_ld_library_path != NULL)
    {
      g_debug ("Setting LD_LIBRARY_PATH to \"%s\"", opt_set_ld_library_path);
      flatpak_bwrap_set_env (wrapped_command, "LD_LIBRARY_PATH",
                             opt_set_ld_library_path, TRUE);
    }

  info = srt_system_info_new (NULL);
  _srt_system_info_set_subprocess_runner (info, runner);
  lib_temp_dirs = pv_per_arch_dirs_new (info, (const GQuark *) tuples->data,
                                        tuples->len, error);

  if (lib_temp_dirs == NULL)
    {
      g_warning ("%s", local_error->message);
      g_clear_error (error);
    }

  compat_flags = _srt_steam_get_compat_flags (_srt_const_strv (envp));
  pv_adverb_set_up_dynamic_sdls (wrapped_command,
                                 (const GQuark *) tuples->data, tuples->len,
                                 lib_temp_dirs,
                                 "/usr", opt_overrides, compat_flags);

  if (opt_overrides != NULL
      && !pv_adverb_set_up_overrides (wrapped_command,
                                      (const GQuark *) tuples->data, tuples->len,
                                      lib_temp_dirs,
                                      opt_overrides,
                                      error))
    {
      g_warning ("%s", local_error->message);
      g_clear_error (error);
    }

  if (opt_preload_modules != NULL
      && !pv_adverb_set_up_preload_modules (wrapped_command,
                                            (const GQuark *) tuples->data, tuples->len,
                                            lib_temp_dirs,
                                            (const PvAdverbPreloadModule *) opt_preload_modules->data,
                                            opt_preload_modules->len,
                                            error))
    goto out;

  if (opt_generate_locales)
    {
      G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) profiling =
        _srt_profiling_start ("Making sure locales are available");
      GQuark architecture;

      g_debug ("Making sure locales are available");

      /* TODO: pv-locale-gen is a shell script, so we need to run it using the
       * architecture of /bin/sh; but it runs pv-try-setlocale, which (we can
       * assume) is probably of the same architecture as pv-adverb, and it
       * also runs localedef, which is most likely to be of the container's
       * primary architecture.
       *
       * As a starting point that will usually be correct, guess that
       * /bin/sh and localedef will be of the same architecture as ldconfig. */
      architecture = opt_ldconfig_architecture;

      /* If this fails, it is not fatal - carry on anyway */
      if (!generate_locales (runner, architecture, &locales_temp_dir, error))
        {
          g_warning ("%s", local_error->message);
          g_clear_error (error);
        }
      else if (locales_temp_dir.initialized)
        {
          g_info ("Generated locales in %s", locales_temp_dir.path);
          flatpak_bwrap_set_env (wrapped_command, "LOCPATH", locales_temp_dir.path, TRUE);
        }
      else
        {
          g_info ("No locales were missing");
        }
    }

  /* We take the same action whether this succeeds or fails */
  _srt_process_manager_run (process_manager,
                            (const char * const *) wrapped_command->argv->pdata,
                            (const char * const *) wrapped_command->envp,
                            error);
  ret = _srt_process_manager_get_exit_status (process_manager);

out:
  global_ld_so_conf_entries = NULL;
  global_options = NULL;
  g_clear_object (&opt_emulator);
  g_clear_pointer (&opt_overrides, g_free);
  g_clear_pointer (&opt_regenerate_ld_so_cache, g_free);
  g_clear_pointer (&opt_preload_modules, g_array_unref);

  if (local_error != NULL)
    _srt_log_failure ("%s", local_error->message);

  global_envp = NULL;
  g_debug ("Exiting with status %d", ret);
  return ret;
}
