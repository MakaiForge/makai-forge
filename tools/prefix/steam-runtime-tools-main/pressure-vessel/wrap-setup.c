/*
 * Copyright © 2014-2019 Red Hat, Inc
 * Copyright © 2017-2021 Collabora Ltd.
 * Copyright © 2017 Jonas Ådahl
 * Copyright © 2018 Erick555
 * Copyright © 2022 Julian Orth
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

#include "wrap-setup.h"

#include "steam-runtime-tools/glib-backports-internal.h"
#include "steam-runtime-tools/log-internal.h"
#include "steam-runtime-tools/subprocess-internal.h"
#include "steam-runtime-tools/utils-internal.h"
#include "steam-runtime-tools/virtualization-internal.h"
#include "libglnx.h"

#include <string.h>

#include "bwrap.h"
#include "exports.h"
#include "flatpak-run-dbus-private.h"
#include "flatpak-run-private.h"
#include "flatpak-run-pulseaudio-private.h"
#include "flatpak-run-sockets-private.h"
#include "flatpak-run-wayland-private.h"
#include "flatpak-run-x11-private.h"
#include "flatpak-utils-private.h"
#include "utils.h"

gchar *
pv_wrap_check_bwrap (SrtSubprocessRunner *runner,
                     gboolean only_prepare,
                     SrtBwrapFlags *flags_out,
                     GError **error)
{
  g_autofree gchar *bwrap = NULL;
  const char *argv[] = { NULL, "--version", NULL };

  bwrap = _srt_check_bwrap (runner, only_prepare, flags_out, error);

  if (bwrap == NULL)
    return NULL;

  /* We're just running this so that the output ends up in the
   * debug log, so it's OK that the exit status and stdout are ignored.
   * bwrap is assumed to be directly executable without emulation. */
  argv[0] = bwrap;
  pv_run_sync (runner, SRT_ARCHITECTURE_QUARK_NONE, argv, NULL, NULL, NULL);

  return g_steal_pointer (&bwrap);
}

/* Based on Flatpak's flatpak_run_add_wayland_args() */
static void
pv_wrap_add_gamescope_args (FlatpakBwrap *sharing_bwrap,
                            SrtEnvOverlay *container_env)
{
  const char *wayland_display;
  g_autofree char *user_runtime_dir = flatpak_get_real_xdg_runtime_dir ();
  g_autofree char *wayland_socket = NULL;
  const char *sandbox_wayland_socket = NULL;
  struct stat statbuf;

  wayland_display = g_getenv ("GAMESCOPE_WAYLAND_DISPLAY");

  if (wayland_display == NULL)
    return;

  if (wayland_display[0] == '/')
    wayland_socket = g_strdup (wayland_display);
  else
    wayland_socket = g_build_filename (user_runtime_dir, wayland_display, NULL);

  if (stat (wayland_socket, &statbuf) == 0 &&
      (statbuf.st_mode & S_IFMT) == S_IFSOCK)
    {
      sandbox_wayland_socket = "/run/pressure-vessel/gamescope-socket";
      _srt_env_overlay_set (container_env, "GAMESCOPE_WAYLAND_DISPLAY",
                         sandbox_wayland_socket);
      flatpak_bwrap_add_args (sharing_bwrap,
                              "--ro-bind", wayland_socket, sandbox_wayland_socket,
                              NULL);
    }
}

/*
 * Use code borrowed from Flatpak to share various bits of the
 * execution environment with the host system, in particular Wayland,
 * X11 and PulseAudio sockets.
 */
FlatpakBwrap *
pv_wrap_share_sockets (PvWrapContext *self,
                       SrtEnvOverlay *container_env,
                       const char * const *original_environ,
                       gboolean using_a_runtime,
                       gboolean is_flatpak_env)
{
  FlatpakContextShares shares;
  FlatpakContextSockets sockets;
  g_autoptr(FlatpakBwrap) sharing_bwrap =
    flatpak_bwrap_new (flatpak_bwrap_empty_env);
  g_auto(GStrv) envp = NULL;
  gsize i;

  g_return_val_if_fail (container_env != NULL, NULL);

  /* All potentially relevant sharing flags */
  shares = (FLATPAK_CONTEXT_SHARED_IPC
            | FLATPAK_CONTEXT_SHARED_NETWORK);
  /* We don't currently do anything with SSH_AUTH, PCSC, CUPS or GPG_AGENT.
   * We also don't use $WAYLAND_SOCKET, which is unsuitable for
   * pressure-vessel games because it only accepts one connection. */
  sockets = (FLATPAK_CONTEXT_SOCKET_PULSEAUDIO
             | FLATPAK_CONTEXT_SOCKET_SESSION_BUS
             | FLATPAK_CONTEXT_SOCKET_SYSTEM_BUS
             | FLATPAK_CONTEXT_SOCKET_WAYLAND
             | FLATPAK_CONTEXT_SOCKET_X11);

  /* If these are set by flatpak_run_add_x11_args(), etc., we'll
   * change them from unset to set later.
   * Every variable that is unset with flatpak_bwrap_unset_env() in
   * the functions we borrow from Flatpak (below) should be listed
   * here. */
  _srt_env_overlay_set (container_env, "DISPLAY", NULL);
  _srt_env_overlay_set (container_env, "PULSE_SERVER", NULL);
  _srt_env_overlay_set (container_env, "XAUTHORITY", NULL);

  flatpak_run_add_font_path_args (sharing_bwrap);

  flatpak_run_add_icon_path_args (sharing_bwrap);

  /* We need to set up IPC rendezvous points relatively late, so that
   * even if we are sharing /tmp via --filesystem=/tmp, we'll still
   * mount our own /tmp/.X11-unix over the top of the OS's. */
  if (using_a_runtime)
    {
      /* TODO: Try to call flatpak_run_add_socket_args_environment() here
       * instead of reinventing it */
      (void) sockets;

      flatpak_run_add_wayland_args (sharing_bwrap,
                                    TRUE,     /* allowed */
                                    FALSE);   /* don't inherit WAYLAND_SOCKET */
      pv_wrap_add_gamescope_args (sharing_bwrap, container_env);

      /* When in a Flatpak container the "DISPLAY" env is equal to ":99.0",
       * but it might be different on the host system. As a workaround we simply
       * bind the whole "/tmp/.X11-unix" directory and later unset the container
       * "DISPLAY" env.
       */
      if (is_flatpak_env)
        {
          flatpak_bwrap_add_args (sharing_bwrap,
                                  "--ro-bind", "/tmp/.X11-unix", "/tmp/.X11-unix",
                                  NULL);
        }
      else
        {
          flatpak_run_add_x11_args (sharing_bwrap, TRUE, shares);
        }

      flatpak_run_add_pulseaudio_args (sharing_bwrap, shares);
      flatpak_run_add_session_dbus_args (sharing_bwrap);
      flatpak_run_add_system_dbus_args (sharing_bwrap);
      flatpak_run_add_socket_args_late (sharing_bwrap, shares);
      flatpak_run_add_a11y_dbus_args (sharing_bwrap);

      if (self->options.import_openxr_1_runtimes
          || self->options.import_openxr_1_layers)
        pv_wrap_add_openxr_args (sharing_bwrap);

      pv_wrap_add_pipewire_args (sharing_bwrap, container_env);
      pv_wrap_add_discord_args (sharing_bwrap);
    }

  flatpak_bwrap_populate_runtime_dir (sharing_bwrap, NULL);

  envp = pv_bwrap_steal_envp (sharing_bwrap);

  for (i = 0; envp[i] != NULL; i++)
    {
      static const char * const known_vars[] =
      {
        "AT_SPI_BUS_ADDRESS",
        "DBUS_SESSION_BUS_ADDRESS",
        "DBUS_SYSTEM_BUS_ADDRESS",
        "DISPLAY",
        "PULSE_CLIENTCONFIG",
        "PULSE_SERVER",
        "XAUTHORITY",
      };
      char *equals = strchr (envp[i], '=');
      const char *var = envp[i];
      const char *val = NULL;
      gsize j;

      if (equals != NULL)
        {
          *equals = '\0';
          val = equals + 1;
        }

      for (j = 0; j < G_N_ELEMENTS (known_vars); j++)
        {
          if (strcmp (var, known_vars[j]) == 0)
            break;
        }

      /* If this warning is reached, we might need to add this
       * variable to the block of
       * _srt_env_overlay_set (container_env, ., NULL) calls above */
      if (j >= G_N_ELEMENTS (known_vars))
        g_warning ("Extra environment variable %s set during container "
                   "setup but not in known_vars; check logic",
                   var);

      _srt_env_overlay_set (container_env, var, val);
    }

  /* flatpak_run_add_x11_args assumes that the default is to inherit
   * the caller's DISPLAY */
  if (_srt_env_overlay_get (container_env, "DISPLAY") == NULL)
    _srt_env_overlay_inherit (container_env, "DISPLAY");

  pv_wrap_set_icons_env_vars (container_env, original_environ);

  g_warn_if_fail (g_strv_length (sharing_bwrap->envp) == 0);
  return g_steal_pointer (&sharing_bwrap);
}

/*
 * Set the environment variables XCURSOR_PATH and XDG_DATA_DIRS to
 * support the icons from the host system.
 */
void
pv_wrap_set_icons_env_vars (SrtEnvOverlay *container_env,
                            const char * const *original_environ)
{
  g_autoptr(GString) new_data_dirs = g_string_new ("");
  g_autoptr(GString) new_xcursor_path = g_string_new ("");
  const gchar *initial_xdg_data_dirs = NULL;
  const gchar *original_xcursor_path = NULL;
  const gchar *container_xdg_data_home = NULL;
  g_autofree gchar *data_home_icons = NULL;

  original_xcursor_path = _srt_environ_getenv (original_environ, "XCURSOR_PATH");
  /* Cursors themes are searched in a few hardcoded paths. However if "XCURSOR_PATH"
   * is set, the user specified paths will override the hardcoded ones.
   * In order to keep the hardcoded paths in place, if "XCURSOR_PATH" is unset, we
   * append the default values first. Reference:
   * https://gitlab.freedesktop.org/xorg/lib/libxcursor/-/blob/80192583/src/library.c#L32 */
  if (original_xcursor_path == NULL)
    {
      /* We assume that this function is called after use_tmpfs_home() or
       * use_fake_home(), if we are going to. */
      container_xdg_data_home = _srt_env_overlay_get (container_env,
                                                      _SRT_XDG_DATA_HOME_VAR);
      if (container_xdg_data_home == NULL)
        container_xdg_data_home = "~/" _SRT_XDG_DATA_HOME_DEFAULT_SUBDIR;
      data_home_icons = g_build_filename (container_xdg_data_home, "icons", NULL);

      /* Note that unlike most path-searching implementations, libXcursor and
       * the derived code in Wayland expand '~' to the home directory. */
      _srt_search_path_append (new_xcursor_path, data_home_icons);
      _srt_search_path_append (new_xcursor_path, "~/.icons");
      _srt_search_path_append (new_xcursor_path, "/usr/share/icons");
      _srt_search_path_append (new_xcursor_path, "/usr/share/pixmaps");
      _srt_search_path_append (new_xcursor_path, "/usr/X11R6/lib/X11/icons");
    }
  else
    {
      /* Append the XCURSOR_PATH values from the host. This is expected to work
       * only for the paths that have been bind-mounted to the same exact
       * location inside the container. One example would be the home directory,
       * unless pv was executed with the `--unshare-home` option. */
      _srt_search_path_append (new_xcursor_path, original_xcursor_path);
    }
  /* Finally append the binded paths from the host */
  _srt_search_path_append (new_xcursor_path, "/run/host/user-share/icons");
  _srt_search_path_append (new_xcursor_path, "/run/host/share/icons");
  _srt_env_overlay_set (container_env, "XCURSOR_PATH", new_xcursor_path->str);

  initial_xdg_data_dirs = _srt_env_overlay_get (container_env, _SRT_XDG_DATA_DIRS_VAR);
  if (initial_xdg_data_dirs == NULL)
    initial_xdg_data_dirs = _srt_environ_getenv (original_environ, _SRT_XDG_DATA_DIRS_VAR);

  /* Reference:
   * https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html */
  if (initial_xdg_data_dirs == NULL)
    initial_xdg_data_dirs = _SRT_XDG_DATA_DIRS_DEFAULT;

  /* Append the host "share" directories to "XDG_DATA_DIRS".
   * Currently this is only useful to load the provider's icons */
  _srt_search_path_append (new_data_dirs, initial_xdg_data_dirs);
  _srt_search_path_append (new_data_dirs, "/run/host/user-share");
  _srt_search_path_append (new_data_dirs, "/run/host/share");
  _srt_env_overlay_set (container_env, _SRT_XDG_DATA_DIRS_VAR, new_data_dirs->str);
}

/*
 * Export most root directories, but not the ones that
 * "flatpak run --filesystem=host" would skip.
 * (See flatpak_context_export(), which might replace this function
 * later on.)
 *
 * If we are running inside Flatpak, we assume that any directory
 * that is made available in the root, and is not in dont_mount_in_root,
 * came in via --filesystem=host or similar and matches its equivalent
 * on the real root filesystem.
 */
gboolean
pv_export_root_dirs_like_filesystem_host (int root_fd,
                                          FlatpakExports *exports,
                                          FlatpakFilesystemMode mode,
                                          SrtDirentCompareFunc arbitrary_dirent_order,
                                          GError **error)
{
  g_auto(SrtDirIter) iter = SRT_DIR_ITER_CLEARED;
  const char *member = NULL;

  g_return_val_if_fail (root_fd >= 0, FALSE);
  g_return_val_if_fail (exports != NULL, FALSE);
  g_return_val_if_fail ((unsigned) mode <= FLATPAK_FILESYSTEM_MODE_LAST, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  if (!_srt_dir_iter_init_at (&iter, root_fd, ".",
                              SRT_DIR_ITER_FLAGS_FOLLOW,
                              arbitrary_dirent_order,
                              error))
    return FALSE;

  while (TRUE)
    {
      g_autofree gchar *path = NULL;
      struct dirent *dent;

      if (!_srt_dir_iter_next_dent (&iter, &dent, NULL, error))
        return FALSE;

      if (dent == NULL)
        break;

      member = dent->d_name;

      if (g_strv_contains (dont_mount_in_root, member))
        continue;

      path = g_build_filename ("/", member, NULL);

      /* See flatpak_context_export() for why we downgrade warnings
       * to debug messages here */
      pv_exports_expose_quietly (exports, mode, path);
    }

  /* For parity with Flatpak's handling of --filesystem=host */
  pv_exports_expose_or_log (exports, mode, "/run/media");

  return TRUE;
}

/*
 * This function assumes that /run on the host is the same as in the
 * current namespace, so it won't work in Flatpak.
 */
static gboolean
export_contents_of_run (int root_fd,
                        FlatpakBwrap *bwrap,
                        SrtDirentCompareFunc arbitrary_dirent_order,
                        GError **error)
{
  static const char *ignore[] =
  {
    "gfx",              /* can be created by pressure-vessel */
    "host",             /* created by pressure-vessel */
    "media",            /* see export_root_dirs_like_filesystem_host() */
    "pressure-vessel",  /* created by pressure-vessel */
    NULL
  };
  g_auto(SrtDirIter) iter = SRT_DIR_ITER_CLEARED;
  const char *member = NULL;

  g_return_val_if_fail (root_fd >= 0, FALSE);
  g_return_val_if_fail (bwrap != NULL, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);
  g_return_val_if_fail (!g_file_test ("/.flatpak-info", G_FILE_TEST_IS_REGULAR),
                        FALSE);

  if (!_srt_dir_iter_init_at (&iter, root_fd, "run",
                              SRT_DIR_ITER_FLAGS_FOLLOW,
                              arbitrary_dirent_order,
                              error))
    return FALSE;

  while (TRUE)
    {
      g_autofree gchar *path = NULL;
      struct dirent *dent;

      if (!_srt_dir_iter_next_dent (&iter, &dent, NULL, error))
        return FALSE;

      if (dent == NULL)
        break;

      member = dent->d_name;

      if (g_strv_contains (ignore, member))
        continue;

      path = g_build_filename ("/run", member, NULL);
      flatpak_bwrap_add_args (bwrap,
                              "--bind", path, path,
                              NULL);
    }

  return TRUE;
}

/*
 * Configure @exports and @bwrap to use the host operating system to
 * provide basically all directories.
 *
 * /app and /boot are excluded, but are assumed to be unnecessary.
 *
 * /dev, /proc and /sys are assumed to have been handled by
 * pv_bwrap_add_api_filesystems() already.
 */
gboolean
pv_wrap_use_host_os (int root_fd,
                     FlatpakExports *exports,
                     FlatpakBwrap *bwrap,
                     SrtDirentCompareFunc arbitrary_dirent_order,
                     PvWorkaroundFlags workarounds,
                     GError **error)
{
  static const char * const export_os_mutable[] = { "/etc", "/tmp", "/var" };
  gsize i;

  g_return_val_if_fail (root_fd >= 0, FALSE);
  g_return_val_if_fail (exports != NULL, FALSE);
  g_return_val_if_fail (bwrap != NULL, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  if (!pv_bwrap_bind_usr (bwrap, "/", root_fd, "/", error))
    return FALSE;

  for (i = 0; i < G_N_ELEMENTS (export_os_mutable); i++)
    {
      const char *dir = export_os_mutable[i];
      struct stat stat_buf;

      g_assert (dir[0] == '/');

      if (TEMP_FAILURE_RETRY (fstatat (root_fd, dir + 1, &stat_buf, 0)) == 0)
        flatpak_bwrap_add_args (bwrap, "--bind", dir, dir, NULL);
    }

  /* We do each subdirectory of /run separately, so that we can
   * always create /run/host and /run/pressure-vessel. */
  if (!export_contents_of_run (root_fd, bwrap, arbitrary_dirent_order, error))
    return FALSE;

  /* This handles everything except:
   *
   * /app (should be unnecessary)
   * /boot (should be unnecessary)
   * /dev (handled by pv_bwrap_add_api_filesystems())
   * /etc (handled by export_os_mutable above)
   * /overrides (used internally by PvRuntime)
   * /proc (handled by pv_bwrap_add_api_filesystems())
   * /root (should be unnecessary)
   * /run (handled by export_contents_of_run() above)
   * /sys (handled by pv_bwrap_add_api_filesystems())
   * /tmp (handled by export_os_mutable above)
   * /usr, /lib, /lib32, /lib64, /bin, /sbin
   *  (all handled by pv_bwrap_bind_usr() above)
   * /var (handled by export_os_mutable above)
   */
  if (workarounds & PV_WORKAROUND_FLAGS_LIMIT_SHARED_DIRS)
    {
      g_info ("Not exporting various subdirectories of the root due to "
              "limit-shared-dirs workaround flag");
    }
  else if (!pv_export_root_dirs_like_filesystem_host (root_fd,
                                                      exports,
                                                      FLATPAK_FILESYSTEM_MODE_READ_WRITE,
                                                      arbitrary_dirent_order,
                                                      error))
    {
      return FALSE;
    }

  return TRUE;
}

/*
 * Try to move the current process into a scope defined by the given
 * Steam app ID. If that's not possible, ignore.
 */
void
pv_wrap_move_into_scope (const char *steam_app_id)
{
  g_autoptr(GError) local_error = NULL;

  if (steam_app_id != NULL)
    {
      if (steam_app_id[0] == '\0')
        steam_app_id = NULL;
      else if (strcmp (steam_app_id, "0") == 0)
        steam_app_id = NULL;
    }

  if (steam_app_id != NULL)
    flatpak_run_in_transient_unit ("steam", "app", steam_app_id, &local_error);
  else
    flatpak_run_in_transient_unit ("steam", "", "unknown", &local_error);

  if (local_error != NULL)
    g_debug ("Cannot move into a systemd scope: %s", local_error->message);
}

/*
 * Nvidia Vulkan ray-tracing requires to load the `nvidia_uvm.ko` kernel
 * module, and this is usually done in `libcuda.so.1` by running the setuid
 * binary `nvidia-modprobe`. But when we are inside a container we don't bind
 * `nvidia-modprobe` and, even if we did, its setuid would not be effective
 * because we have `PR_SET_NO_NEW_PRIVS` and we don't have `CAP_SYS_MODULE` in
 * our capability bounding set.
 * For this reason if the current system is using the proprietary Nvidia
 * drivers, and `nvidia_uvm.ko` has not been already loaded, we should execute
 * `nvidia-modprobe` before entering in the container environment.
 *
 * nvidia-modprobe is assumed to be directly executable in the current
 * execution environment, without non-transparent emulation.
 */
gboolean
pv_wrap_maybe_load_nvidia_modules (SrtSubprocessRunner *runner,
                                   GError **error)
{
  const char *nvidia_modprobe_argv[] =
  {
    "nvidia-modprobe",
    "-u",
    "-c=0",
    NULL
  };

  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  if (g_file_test ("/sys/module/nvidia/version", G_FILE_TEST_IS_REGULAR)
      && !g_file_test ("/sys/module/nvidia_uvm", G_FILE_TEST_IS_DIR))
    return pv_run_sync (runner,
                        SRT_ARCHITECTURE_QUARK_NONE,
                        nvidia_modprobe_argv, NULL, NULL, error);

  return TRUE;
}

/**
 * pv_wrap_detect_virtualization:
 * @interpreter_root_out: (out) (optional): Used to return the absolute path
 *  to the overlay, if we are running under an interpreter/emulator like FEX.
 *  Otherwise, return %NULL.
 * @host_machine_out: (out) (optional): Used to return the host machine type, if
 *  an emulator is in use, or %SRT_MACHINE_TYPE_UNKNOWN if unknown or not
 *  applicable.
 */
void
pv_wrap_detect_virtualization (SrtSysroot **interpreter_root_out,
                               const SrtKnownArchitecture **host_machine_out)
{
  g_autoptr(SrtVirtualizationInfo) virt_info = NULL;
  const char *val;

  g_return_if_fail (interpreter_root_out == NULL || *interpreter_root_out == NULL);

  /* At the moment we only care about FEX-Emu here, which we happen to
   * know implements CPUID, so it's faster to skip the filesystem-based
   * checks */
  virt_info = _srt_check_virtualization (NULL, NULL, host_machine_out);

  if (interpreter_root_out != NULL)
    {
      val = srt_virtualization_info_get_interpreter_root (virt_info);

      /* We happen to know that the way _srt_check_virtualization() gets
       * this information guarantees an object with a canonicalized path,
       * so we don't need to canonicalize it again. */
      if (val != NULL)
        *interpreter_root_out = _srt_sysroot_new (val, NULL);
      else
        *interpreter_root_out = NULL;
    }
}

/**
 * pv_share_temp_dir:
 * @exports: exported directories
 * @container_env: environment variables for the container
 *
 * Ensure that temporary directories are available.
 */
void
pv_share_temp_dir (FlatpakExports *exports,
                   SrtEnvOverlay *container_env)
{
  static const char * const temp_dir_vars[] =
  {
    "TEMP",
    "TEMPDIR",
    "TMP",
    "TMPDIR",
  };
  gsize i;

  /* Always export /tmp for now. SteamVR uses this as a rendezvous
   * directory for IPC.
   * Should always succeed, but if it somehow doesn't, make more noise
   * about this than usual: not sharing /tmp will break expectations. */
  pv_exports_expose_or_warn (exports,
                             FLATPAK_FILESYSTEM_MODE_READ_WRITE,
                             "/tmp");

  for (i = 0; i < G_N_ELEMENTS (temp_dir_vars); i++)
    {
      const char *var = temp_dir_vars[i];
      const char *value = g_getenv (var);

      if (value == NULL)
        continue;

      if (value[0] != '/')
        {
          /* There's not much we can do with this... */
          g_warning ("%s is a relative path '%s', is this really intentional?",
                     var, value);
          continue;
        }

      /* Snap sets TMPDIR=$XDG_RUNTIME_DIR/snap.steam, but won't allow us
       * to bind-mount that path into our container. Unset TMPDIR in that
       * case, so that applications (and pv-adverb) will fall back to /tmp. */
      if (_srt_get_path_after (value, "run/user") != NULL)
        {
          g_debug ("%s '%s' is in /run/user, unsetting it",
                   var, value);
          _srt_env_overlay_set (container_env, var, NULL);
          continue;
        }

      /* Otherwise, try to share the directory with the container. */
      pv_exports_expose_or_log (exports, FLATPAK_FILESYSTEM_MODE_READ_WRITE,
                                value);
    }
}

typedef enum
{
  ENV_MOUNT_FLAGS_COLON_DELIMITED = (1 << 0),
  ENV_MOUNT_FLAGS_DEPRECATED = (1 << 1),
  ENV_MOUNT_FLAGS_READ_ONLY = (1 << 2),
  ENV_MOUNT_FLAGS_IF_HOME_SHARED = (1 << 3),
  ENV_MOUNT_FLAGS_NONE = 0
} EnvMountFlags;

typedef struct
{
  const char *name;
  EnvMountFlags flags;
  PvWrapExportFlags export_flags;
} EnvMount;

static const EnvMount known_required_env[] =
{
    { "PRESSURE_VESSEL_FILESYSTEMS_RO",
      ENV_MOUNT_FLAGS_READ_ONLY | ENV_MOUNT_FLAGS_COLON_DELIMITED },
    { "PRESSURE_VESSEL_FILESYSTEMS_RW", ENV_MOUNT_FLAGS_COLON_DELIMITED },
    { "PROTON_LOG_DIR", ENV_MOUNT_FLAGS_NONE },
    { "STEAM_COMPAT_APP_LIBRARY_PATH", ENV_MOUNT_FLAGS_DEPRECATED },
    { "STEAM_COMPAT_APP_LIBRARY_PATHS",
      ENV_MOUNT_FLAGS_COLON_DELIMITED | ENV_MOUNT_FLAGS_DEPRECATED },
    { "STEAM_COMPAT_CLIENT_INSTALL_PATH", ENV_MOUNT_FLAGS_NONE },
    { "STEAM_COMPAT_DATA_PATH", ENV_MOUNT_FLAGS_NONE },
    { "STEAM_COMPAT_INSTALL_PATH", ENV_MOUNT_FLAGS_NONE },
    { "STEAM_COMPAT_LIBRARY_PATHS", ENV_MOUNT_FLAGS_COLON_DELIMITED },
    { "STEAM_COMPAT_MOUNT_PATHS",
      ENV_MOUNT_FLAGS_COLON_DELIMITED | ENV_MOUNT_FLAGS_DEPRECATED },
    { "STEAM_COMPAT_MOUNTS", ENV_MOUNT_FLAGS_COLON_DELIMITED },
    { "STEAM_COMPAT_SHADER_PATH", ENV_MOUNT_FLAGS_NONE },
    { "STEAM_COMPAT_TOOL_PATH", ENV_MOUNT_FLAGS_DEPRECATED },
    { "STEAM_COMPAT_TOOL_PATHS", ENV_MOUNT_FLAGS_COLON_DELIMITED },
    { "STEAM_EXTRA_COMPAT_TOOLS_PATHS", ENV_MOUNT_FLAGS_COLON_DELIMITED },
    { "STEAM_RUNTIME_SCOUT", ENV_MOUNT_FLAGS_NONE },
    { _SRT_XDG_CACHE_HOME_VAR, ENV_MOUNT_FLAGS_IF_HOME_SHARED },
    { _SRT_XDG_CONFIG_HOME_VAR, ENV_MOUNT_FLAGS_IF_HOME_SHARED },
    { _SRT_XDG_DATA_HOME_VAR, ENV_MOUNT_FLAGS_IF_HOME_SHARED },
    { _SRT_XDG_STATE_HOME_VAR, ENV_MOUNT_FLAGS_IF_HOME_SHARED },
};

static void
bind_and_propagate_from_environ (PvWrapContext *self,
                                 PvHomeMode home_mode,
                                 SrtEnvOverlay *container_env,
                                 const char *variable,
                                 EnvMountFlags flags,
                                 PvWrapExportFlags export_flags)
{
  g_auto(GStrv) values = NULL;
  FlatpakFilesystemMode mode = FLATPAK_FILESYSTEM_MODE_READ_WRITE;
  SrtSysroot *sysroot;
  const char *value;
  const char *before;
  const char *after;
  gboolean changed = FALSE;
  gsize i;

  g_return_if_fail (PV_IS_WRAP_CONTEXT (self));
  g_return_if_fail (self->exports != NULL);
  g_return_if_fail (variable != NULL);
  sysroot = self->current_root;
  g_return_if_fail (sysroot != NULL);

  if (home_mode != PV_HOME_MODE_SHARED
      && (flags & ENV_MOUNT_FLAGS_IF_HOME_SHARED))
    return;

  if (_srt_env_overlay_contains (container_env, variable))
    value = _srt_env_overlay_get (container_env, variable);
  else
    value = g_environ_getenv (self->original_environ, variable);

  if (value == NULL)
    return;

  if (flags & ENV_MOUNT_FLAGS_DEPRECATED)
    g_message ("Setting $%s is deprecated", variable);

  if (flags & ENV_MOUNT_FLAGS_READ_ONLY)
    mode = FLATPAK_FILESYSTEM_MODE_READ_ONLY;

  if (flags & ENV_MOUNT_FLAGS_COLON_DELIMITED)
    {
      values = g_strsplit (value, ":", -1);
      before = "...:";
      after = ":...";
    }
  else
    {
      values = g_new0 (gchar *, 2);
      values[0] = g_strdup (value);
      values[1] = NULL;
      before = "";
      after = "";
    }

  for (i = 0; values[i] != NULL; i++)
    {
      g_autofree gchar *value_host = NULL;
      g_autofree gchar *canon = NULL;

      if (values[i][0] == '\0')
        continue;

      if (!_srt_sysroot_test (sysroot, values[i], SRT_RESOLVE_FLAGS_NONE, NULL))
        {
          g_info ("Not bind-mounting %s=\"%s%s%s\" because it does not exist",
                  variable, before, values[i], after);
          continue;
        }

      canon = g_canonicalize_filename (values[i], NULL);
      value_host = pv_current_namespace_path_to_host_path (canon);

      if (!pv_wrap_context_export_if_allowed (self,
                                              mode,
                                              canon,
                                              value_host,
                                              variable,
                                              before,
                                              after,
                                              export_flags))
        continue;

      if (strcmp (values[i], value_host) != 0)
        {
          g_clear_pointer (&values[i], g_free);
          values[i] = g_steal_pointer (&value_host);
          changed = TRUE;
        }
    }

  if (changed
      || _srt_sysroot_test (sysroot, "/.flatpak-info",
                            SRT_RESOLVE_FLAGS_NONE, NULL))
    {
      g_autofree gchar *joined = g_strjoinv (":", values);

      _srt_env_overlay_set (container_env, variable, joined);
    }
}

void
pv_bind_and_propagate_from_environ (PvWrapContext *self,
                                    PvHomeMode home_mode,
                                    SrtEnvOverlay *container_env)
{
  gsize i;

  g_return_if_fail (container_env != NULL);

  g_debug ("Making Steam environment variables available if required...");

  for (i = 0; i < G_N_ELEMENTS (known_required_env); i++)
    {
      const char *name = known_required_env[i].name;

      if (self->exports != NULL)
        {
          /* If we're using bubblewrap directly, we can and must make
           * sure that all required directories are bind-mounted */
          bind_and_propagate_from_environ (self, home_mode,
                                           container_env, name,
                                           known_required_env[i].flags,
                                           known_required_env[i].export_flags);
        }
      else
        {
          /* If we're using a Flatpak subsandbox, we have no choice but to
           * rely on the fact that any directory available to the parent app
           * is also going to be available to the subsandbox */
          g_return_if_fail (home_mode == PV_HOME_MODE_SHARED);

          if (!_srt_env_overlay_contains (container_env, name))
            _srt_env_overlay_set (container_env, name,
                                  g_environ_getenv (self->original_environ, name));
        }
    }
}

gboolean
pv_wrap_setup_export_filesystems (PvWrapContext *self,
                                  GError **error)
{
  g_auto(SrtHashTableIter) iter = SRT_HASH_TABLE_ITER_CLEARED;
  FlatpakFilesystemMode share_host_root = FLATPAK_FILESYSTEM_MODE_NONE;
  const char *filesystem;
  const void *mode_pointer;

  if (self->options.filesystems == NULL)
    return TRUE;

  _srt_hash_table_iter_init_sorted (&iter,
                                    self->options.filesystems,
                                    self->arbitrary_str_order);

  g_debug ("Processing --filesystem arguments...");

  if (pv_wrap_context_has_filesystem (self, "host-root", &share_host_root)
      && share_host_root > FLATPAK_FILESYSTEM_MODE_NONE)
    flatpak_exports_add_host_root_expose (self->exports, share_host_root);

  while (_srt_hash_table_iter_next (&iter, &filesystem, &mode_pointer))
    {
      if (g_strv_contains (flatpak_context_special_filesystems, filesystem))
        {
          /*
           * Either handled elsewhere or intentionally ignored:
           * - home: not implemented yet, it isn't entirely clear how it
           *   should interact with --share-home
           * - host: handled in pv_export_root_dirs_like_filesystem_host()
           * - host-etc, host-os: ignored, PvRuntime does the equivalent
           * - host-reset: ignored, can't actually happen because we don't
           *   implement --nofilesystem
           * - host-root: see above
           */
        }
      else if (g_str_has_prefix (filesystem, "~/"))
        {
          g_autofree gchar *path = NULL;

          path = g_build_filename (g_quark_to_string (self->current_home),
                                   filesystem + 2,
                                   NULL);
          pv_wrap_context_export_if_allowed (self,
                                             GPOINTER_TO_INT (mode_pointer),
                                             path,
                                             path,
                                             "--filesystem", "", "",
                                             PV_WRAP_EXPORT_FLAGS_NONE);
        }
      else if (g_str_has_prefix (filesystem, "/"))
        {
          pv_wrap_context_export_if_allowed (self,
                                             GPOINTER_TO_INT (mode_pointer),
                                             filesystem,
                                             filesystem,
                                             "--filesystem", "", "",
                                             PV_WRAP_EXPORT_FLAGS_NONE);
        }
      else
        {
          g_warning ("Unexpected filesystem arg %s", filesystem);
        }
    }

  return TRUE;
}
