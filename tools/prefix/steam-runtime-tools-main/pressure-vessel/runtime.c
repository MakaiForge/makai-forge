/*
 * Copyright © 2020-2026 Collabora Ltd.
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

#include "runtime.h"

#include <sysexits.h>

#include <gio/gio.h>

/* Include these before steam-runtime-tools.h so that their backport of
 * G_DEFINE_AUTOPTR_CLEANUP_FUNC will be visible to it */
#include "steam-runtime-tools/glib-backports-internal.h"
#include "steam-runtime-tools/json-glib-backports-internal.h"
#include "libglnx.h"

#include <steam-runtime-tools/steam-runtime-tools.h>

#include "steam-runtime-tools/architecture-internal.h"
#include "steam-runtime-tools/elf-utils-internal.h"
#include "steam-runtime-tools/file-lock-internal.h"
#include "steam-runtime-tools/graphics-internal.h"
#include "steam-runtime-tools/graphics-drivers-json-based-internal.h"
#include "steam-runtime-tools/libdl-internal.h"
#include "steam-runtime-tools/log-internal.h"
#include "steam-runtime-tools/profiling-internal.h"
#include "steam-runtime-tools/resolve-in-sysroot-internal.h"
#include "steam-runtime-tools/system-info-internal.h"
#include "steam-runtime-tools/utils-internal.h"

#include "bwrap.h"
#include "enumtypes.h"
#include "exports.h"
#include "flatpak-run-private.h"
#include "mtree.h"
#include "passwd.h"
#include "runtime-module.h"
#include "runtime-flags.h"
#include "runtime-library-data.h"
#include "supported-architectures.h"
#include "tree-copy.h"
#include "utils.h"

/*
 * Location of helper executables from a relocatable copy of
 * pressure-vessel, relative to the $PRESSURE_VESSEL_PREFIX
 */
#define PKGLIBEXECDIR "libexec/steam-runtime-tools-" _SRT_API_MAJOR

/*
 * Location of pv-adverb specifically, relative to the $PRESSURE_VESSEL_PREFIX
 */
#define PV_ADVERB_IN_PREFIX PKGLIBEXECDIR "/pv-adverb"

/*
 * Parent of the location where the $PRESSURE_VESSEL_PREFIX gets mounted
 * when using the mutable_sysroot code path
 */
#define PV_FROM_HOST_IN_MUTABLE_SYSROOT_PARENT "/usr/lib/pressure-vessel"
/*
 * Location where the $PRESSURE_VESSEL_PREFIX gets mounted when using the
 * mutable_sysroot code path
 */
#define PV_FROM_HOST_IN_MUTABLE_SYSROOT PV_FROM_HOST_IN_MUTABLE_SYSROOT_PARENT "/from-host"
/*
 * Path to pv-adverb as it is mounted inside the container when using
 * the mutable_sysroot code path
 */
#define PV_ADVERB_IN_MUTABLE_SYSROOT PV_FROM_HOST_IN_MUTABLE_SYSROOT "/" PV_ADVERB_IN_PREFIX

/*
 * Location where the $PRESSURE_VESSEL_PREFIX gets mounted when not
 * using the mutable_sysroot code path
 */
#define PV_FROM_HOST_WITHOUT_MUTABLE_SYSROOT "/run/pressure-vessel/pv-from-host"
/*
 * Path to pv-adverb as it is mounted inside the container when not
 * using the mutable_sysroot code path
 */
#define PV_ADVERB_WITHOUT_MUTABLE_SYSROOT PV_FROM_HOST_WITHOUT_MUTABLE_SYSROOT "/" PV_ADVERB_IN_PREFIX

/*
 * PvRuntime:
 *
 * Object representing a runtime to be used as the /usr for a game.
 */

struct _PvRuntime
{
  GObject parent;

  gchar *bubblewrap;
  SrtSubprocessRunner *run_in_current_context;
  gchar *source;
  gchar *source_files;          /* either source or that + "/files" */
  const gchar *pv_prefix;
  SrtFileLock *runtime_lock;
  GStrv original_environ;

  const SrtKnownArchitecture *adverb_architecture;
  SrtEmulator *emulator;
  SrtEmulator *emulator_in_container;
  const SrtKnownArchitecture *ldconfig_architecture;
  gchar *libcapsule_knowledge;  /* relative to runtime_files */
  gchar *runtime_abi_json;
  gchar *variable_dir;
  SrtSysroot *mutable_sysroot;
  SrtSysroot *real_root;
  SrtSysroot *host_root;
  gchar *tmpdir;
  gchar *overrides;
  const gchar *overrides_in_container;
  gchar *container_access;
  FlatpakBwrap *container_access_adverb;
  const gchar *runtime_files;   /* either source_files or mutable_sysroot->path */
  gchar *runtime_usr;           /* either runtime_files or that + "/usr" */
  gchar *runtime_app;           /* runtime_files + "/app" */
  gchar *runtime_files_on_host;
  GArray *tuples;
  const gchar *pv_prefix_in_container;
  const gchar *adverb_in_container;
  gchar *helpers_dir_in_container;
  GPtrArray *providers;
  SrtDirentCompareFunc arbitrary_dirent_order;
  GCompareFunc arbitrary_str_order;

  GQuark home;
  PvRuntimeFlags flags;
  PvWorkaroundFlags workarounds;
  int overrides_fd;
  int runtime_files_fd;
  int variable_dir_fd;
  unsigned any_libc_from_provider : 1;
  unsigned all_libc_from_provider : 1;
  unsigned runtime_is_just_usr : 1;
  unsigned is_steamrt : 1;
  unsigned is_scout : 1;
  unsigned is_flatpak_env : 1;
  unsigned any_vdpau_drivers : 1;
};

struct _PvRuntimeClass
{
  GObjectClass parent;
};

enum {
  PROP_0,
  PROP_ARCHITECTURES,
  PROP_BUBBLEWRAP,
  PROP_GRAPHICS_PROVIDERS,
  PROP_HOME,
  PROP_SOURCE,
  PROP_ORIGINAL_ENVIRON,
  PROP_FLAGS,
  PROP_RUN_IN_CURRENT_CONTEXT,
  PROP_VARIABLE_DIR,
  PROP_WORKAROUNDS,
  N_PROPERTIES
};

static GParamSpec *properties[N_PROPERTIES] = { NULL };

static void pv_runtime_initable_iface_init (GInitableIface *iface,
                                            gpointer unused);

G_DEFINE_TYPE_WITH_CODE (PvRuntime, pv_runtime, G_TYPE_OBJECT,
                         G_IMPLEMENT_INTERFACE (G_TYPE_INITABLE,
                                                pv_runtime_initable_iface_init))

static gchar *pv_runtime_get_ld_library_path (PvRuntime *self);
static gboolean pv_runtime_symlinkat (const gchar *target,
                                      int destination_dirfd,
                                      const gchar *destination,
                                      GError **error);


/*
 * Return whether @path is expected to be a mutable directory in
 * the container.
 */
static gboolean
path_mutable_in_container_namespace (const char *path)
{
  static const char * const no[] =
  {
    "run/gfx",
    "run/interpreter-host",
    "run/host",
    "var/pressure-vessel/gfx",
  };
  static const char * const yes[] =
  {
    "etc",
    "overrides",
    "run",
    "tmp",
    "var",
  };

  while (path[0] == '/')
    path++;

  for (size_t i = 0; i < G_N_ELEMENTS (no); i++)
    {
      if (_srt_get_path_after (path, no[i]) != NULL)
        return FALSE;
    }

  for (size_t i = 0; i < G_N_ELEMENTS (yes); i++)
    {
      if (_srt_get_path_after (path, yes[i]) != NULL)
        return TRUE;
    }

  return FALSE;
}

/* See pv_runtime_get_other_app_framework_paths() */
static const PvAppFrameworkPath framework_paths[] =
{
  { "/gnu/store", PV_WORKAROUND_FLAGS_NONE, NULL },
  { "/nix", PV_WORKAROUND_FLAGS_NONE, NULL },
  { "/snap", PV_WORKAROUND_FLAGS_STEAMSNAP_359,
    "https://github.com/canonical/steam-snap/issues/359" },
  { "/var/lib/snapd/hostfs", PV_WORKAROUND_FLAGS_STEAMSNAP_359,
    "https://github.com/canonical/steam-snap/issues/359" },
  { NULL }
};

/**
 * pv_runtime_get_other_app_framework_paths:
 *
 * Return directories other than /app and /usr in which non-pressure-vessel
 * app frameworks conventionally hard-code paths to dependency libraries
 * or similar things. This currently means:
 *
 * * /gnu/store, for Guix
 * * /nix, for Nix and NixOS
 * * /snap, for Canonical's unofficial Snap version of Steam
 * * /var/lib/snapd/hostfs, for Snap's equivalent of our /run/host
 *
 * Returns: (array zero-terminated=1) (transfer none):
 *  An array of absolute paths that should be made available read-only
 *  in the container if they exist and their workaround flags
 *  are not enabled
 */
const PvAppFrameworkPath *
pv_runtime_get_other_app_framework_paths (void)
{
  return framework_paths;
}

/*
 * pv_runtime_path_belongs_in_interpreter_root:
 * @path: An absolute or root-relative path, for example `/etc/os-release`
 *  or `usr/lib/os-release`
 *
 * Return whether the top-level directory containing @path is expected
 * to exist in the interpreter root for tools like FEX-Emu.
 *
 * For simplicity and efficiency, we ignore the compatibility symlinks here,
 * and assume a merged /usr: we always use an interpreter root in conjunction
 * with a mutable sysroot, which is always merged-/usr, so this is OK.
 *
 * Returns: %TRUE if we want the top-level directory of @path to appear
 *  in the interpreter root.
 */
gboolean
pv_runtime_path_belongs_in_interpreter_root (PvRuntime *self,
                                             const char *path)
{
  static const char * const yes[] =
  {
    "etc",
    "overrides",
    "usr",
    "var",
  };

  while (path[0] == '/')
    path++;

  for (size_t i = 0; i < G_N_ELEMENTS (yes); i++)
    {
      if (_srt_get_path_after (path, yes[i]) != NULL)
        return TRUE;
    }

  /* Special case: when running under older Snap we have to use
   * /run/pressure-vessel/ldso because /var/pressure-vessel/ldso isn't
   * allowed. We don't expect to be running FEX-Emu under Snap,
   * so it doesn't matter that this would break FEX-Emu. */
  if (self != NULL
      && (self->workarounds & PV_WORKAROUND_FLAGS_STEAMSNAP_356)
      && _srt_get_path_after (path, "run/pressure-vessel/ldso") != NULL)
    return TRUE;

  return FALSE;
}

/*
 * Return whether @path is likely to be visible as-is in the container.
 */
static gboolean
path_visible_in_container_namespace (PvRuntimeFlags flags,
                                     PvWorkaroundFlags workarounds,
                                     const char *path)
{
  if (flags & PV_RUNTIME_FLAGS_FLATPAK_SUBSANDBOX)
    return FALSE;

  for (size_t i = 0; framework_paths[i].path != NULL; i++)
    {
      if ((workarounds & framework_paths[i].ignore_if) == 0
          && _srt_get_path_after (path, framework_paths[i].path) != NULL)
        return TRUE;
    }

  return FALSE;
}

/*
 * Return whether @path is likely to be visible in the provider mount point
 * (e.g. /run/host).
 * This needs to be kept approximately in sync with pv_bwrap_bind_usr()
 * and Flatpak's --filesystem=host-os and --filesystem=host-etc special
 * keywords.
 */
gboolean
path_visible_in_provider_namespace (PvRuntimeFlags flags,
                                    const char *path)
{
  while (path[0] == '/')
    path++;

  /* In a Flatpak subsandbox, the provider is /run/parent, and
   * /run/parent/app in the subsandbox has the same content as /app
   * in Steam. */
  if ((flags & PV_RUNTIME_FLAGS_FLATPAK_SUBSANDBOX)
      && g_str_has_prefix (path, "app")
      && (path[3] == '\0' || path[3] == '/'))
    return TRUE;

  if (g_str_has_prefix (path, "usr") &&
      (path[3] == '\0' || path[3] == '/'))
    return TRUE;

  if (g_str_has_prefix (path, "lib"))
    return TRUE;

  if (g_str_has_prefix (path, "bin") &&
      (path[3] == '\0' || path[3] == '/'))
    return TRUE;

  if (g_str_has_prefix (path, "sbin") &&
      (path[4] == '\0' || path[4] == '/'))
    return TRUE;

  /* If the provider is /run/host, flatpak_exports_add_host_etc_expose()
   * in wrap.c is responsible for mounting /etc on /run/host/etc.
   *
   * In a Flatpak subsandbox environment, flatpak_run_app() makes
   * /run/parent/etc a symlink to /run/parent/usr/etc.
   *
   * Otherwise, bind_runtime_base() is responsible for mounting the provider's
   * /etc on /var/pressure-vessel/gfx/DIR/etc or /run/gfx/DIR/etc. */
  if (g_str_has_prefix (path, "etc")
      && (path[3] == '\0' || path[3] == '/'))
    return TRUE;

  return FALSE;
}

/*
 * pv_runtime_bind_into_container:
 * @self: the runtime
 * @bwrap: the arguments for bubblewrap
 * @host_path: absolute path on the host system (not necessarily the
 *  current execution environment); or if @content is non-%NULL, a basename
 *  for debugging
 * @content: content for a dynamically-created file
 * @content_size: length of @content in bytes, or -1 if 0-terminated
 * @path: absolute or root-relative path in the container and/or
 *  interpreter root, which should be in a path for which
 *  path_mutable_in_container_namespace() returns true
 * @roots: if using an interpreter root for FEX-Emu or similar, whether
 *  to modify the real root, the interpreter root or both
 * @error: you know how this works
 *
 * Try to make @path a bind-mount for @target in the container.
 */
gboolean
pv_runtime_bind_into_container (PvRuntime *self,
                                FlatpakBwrap *bwrap,
                                const char *host_path,
                                const void *content,
                                gssize content_size,
                                const char *path,
                                PvRuntimeEmulationRoots roots,
                                GError **error)
{
  g_autofree char *interpreter_dest = NULL;
  const char *real_dest = path;

  g_return_val_if_fail (PV_IS_RUNTIME (self), FALSE);
  g_return_val_if_fail (bwrap != NULL, FALSE);
  g_return_val_if_fail (!pv_bwrap_was_finished (bwrap), FALSE);
  g_return_val_if_fail (host_path != NULL, FALSE);
  g_return_val_if_fail (path != NULL, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);
  g_return_val_if_fail (roots == PV_RUNTIME_EMULATION_ROOTS_REAL_ONLY
                        || pv_runtime_path_belongs_in_interpreter_root (self, path),
                        FALSE);

  if (content != NULL)
    g_return_val_if_fail (strchr (host_path, '/') == NULL, FALSE);
  else
    g_return_val_if_fail (host_path[0] == '/', FALSE);

  if (!path_mutable_in_container_namespace (path))
    {
      g_set_error (error, G_IO_ERROR, G_IO_ERROR_READ_ONLY,
                   "Not making \"%s\" a bind-mount: not modifiable", path);
      return FALSE;
    }

  if (self->flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT)
    {
      if (roots != PV_RUNTIME_EMULATION_ROOTS_REAL_ONLY)
        interpreter_dest = g_build_filename (PV_RUNTIME_PATH_INTERPRETER_ROOT,
                                             path, NULL);

      if (roots == PV_RUNTIME_EMULATION_ROOTS_INTERPRETER_ONLY)
        real_dest = NULL;
    }

  if (real_dest != NULL)
    {
      gboolean ok = TRUE;

      g_debug ("Creating bind-mount \"%s\" => \"${container}/%s\"",
               host_path, real_dest);

      if (content != NULL)
        ok = flatpak_bwrap_add_args_data (bwrap,
                                          host_path,
                                          content,
                                          content_size,
                                          real_dest,
                                          error);
      else
        flatpak_bwrap_add_args (bwrap,
                                "--ro-bind",
                                host_path,
                                real_dest,
                                NULL);

      if (!ok)
        {
          g_prefix_error (error, "Unable to bind-mount \"%s\" on \"%s\": ",
                          host_path, real_dest);
          return FALSE;
        }
    }

  if (interpreter_dest != NULL)
    {
      gboolean ok = TRUE;

      g_debug ("Creating bind-mount \"%s\" => \"${container}/%s\"",
               host_path, interpreter_dest);

      if (content != NULL)
        ok = flatpak_bwrap_add_args_data (bwrap,
                                          host_path,
                                          content,
                                          content_size,
                                          interpreter_dest,
                                          error);
      else
        flatpak_bwrap_add_args (bwrap,
                                "--ro-bind",
                                host_path,
                                interpreter_dest,
                                NULL);

      if (!ok)
        {
          g_prefix_error (error, "Unable to bind-mount \"%s\" on \"%s\": ",
                          host_path, interpreter_dest);
          return FALSE;
        }
    }

  return TRUE;
}

/*
 * pv_runtime_make_symlink_in_container:
 * @self: the runtime
 * @bwrap: the arguments for bubblewrap
 * @target: target of the symlink
 * @path: absolute or root-relative path in the container and/or
 *  interpreter root
 * @roots: if using an interpreter root for FEX-Emu or similar, whether
 *  to modify the real root, the interpreter root or both
 * @error: you know how this works
 *
 * Try to make @path a symlink to @target in the container, by whichever
 * mechanism seems best: either editing the mutable sysroot in-place,
 * or telling bubblewrap to create a symlink in a transient directory
 * like /etc or /var.
 *
 * Returns: %TRUE on success
 */
gboolean
pv_runtime_make_symlink_in_container (PvRuntime *self,
                                      FlatpakBwrap *bwrap,
                                      const char *target,
                                      const char *path,
                                      PvRuntimeEmulationRoots roots,
                                      GError **error)
{
  g_autofree char *interpreter_dest = NULL;
  const char *real_dest = path;

  g_return_val_if_fail (PV_IS_RUNTIME (self), FALSE);
  g_return_val_if_fail (target != NULL, FALSE);
  g_return_val_if_fail (path != NULL, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);
  g_return_val_if_fail (roots == PV_RUNTIME_EMULATION_ROOTS_REAL_ONLY
                        || pv_runtime_path_belongs_in_interpreter_root (self, path),
                        FALSE);

  if (self->flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT)
    {
      if (roots != PV_RUNTIME_EMULATION_ROOTS_REAL_ONLY)
        interpreter_dest = g_build_filename (PV_RUNTIME_PATH_INTERPRETER_ROOT,
                                             path, NULL);

      if (roots == PV_RUNTIME_EMULATION_ROOTS_INTERPRETER_ONLY)
        real_dest = NULL;
    }

  if (real_dest != NULL)
    g_debug ("Creating symlink \"${container}/%s\" -> \"%s\"", real_dest, target);

  if (interpreter_dest != NULL)
    g_debug ("Creating symlink \"${container}/%s\" -> \"%s\"", interpreter_dest, target);

  if (_srt_get_path_after (path, "usr") != NULL)
    {
      /* We will mount the mutable sysroot (if used) on /usr inside the
       * interpreter root if used, or on /usr if not using an interpreter
       * root. We can't change the real /usr. */
      if ((self->flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT)
          && roots != PV_RUNTIME_EMULATION_ROOTS_INTERPRETER_ONLY)
        {
          g_set_error (error, G_IO_ERROR, G_IO_ERROR_READ_ONLY,
                       "Cannot modify real /usr while using emulation");
          goto error;
        }

      if (self->mutable_sysroot != NULL)
        {
          g_autofree gchar *parent = g_path_get_dirname (path);
          const char *base = glnx_basename (path);
          glnx_autofd int parent_fd = -1;

          parent_fd = _srt_resolve_in_sysroot (self->mutable_sysroot->fd,
                                               parent,
                                               SRT_RESOLVE_FLAGS_MKDIR_P,
                                               NULL, error);

          if (parent_fd < 0)
            goto error;

          if (!pv_runtime_symlinkat (target, parent_fd, base, error))
            goto error;

          return TRUE;
        }
      else
        {
          g_set_error (error, G_IO_ERROR, G_IO_ERROR_READ_ONLY,
                       "Cannot modify /usr when not copying runtime");
          goto error;
        }
    }

  if (bwrap != NULL
      && path_mutable_in_container_namespace (path))
    {
      /* Note that "--symlink foo bar" is equivalent to "--symlink foo /bar":
       * both end up creating the symlink at /newroot/bar */
      if (real_dest != NULL)
        flatpak_bwrap_add_args (bwrap,
                                "--symlink",
                                target,
                                real_dest,
                                NULL);

      if (interpreter_dest != NULL)
        flatpak_bwrap_add_args (bwrap,
                                "--symlink",
                                target,
                                interpreter_dest,
                                NULL);

      return TRUE;
    }

  g_set_error (error, G_IO_ERROR, G_IO_ERROR_READ_ONLY,
               "Not modifiable in current configuration");
error:
  g_prefix_error (error, "Not making \"%s\" a symlink to \"%s\": ",
                  path, target);
  return FALSE;
}

typedef struct
{
  /* g_quark_to_string (tuple_quark) */
  const char *tuple;
  /* Architecture knowledge from libsteam-runtime-tools, if any */
  const SrtKnownArchitecture *known_arch;
  /* Graphics stack provider to use */
  PvGraphicsProvider *provider;
  /* Details from provider manifest */
  SrtGraphicsProvider *provider_details;
  /* Per-architecture details from provider manifest.
   * Owned by @provider_details */
  const SrtGraphicsProviderArchitecture *provider_arch_details;
  /* Graphics stack provider's SrtSystemInfo for this architecture */
  SrtSystemInfo *system_info;
  /* Graphics stack provider's SrtSystemInfo's subprocess runner */
  SrtSubprocessRunner *runner;
  /* "lib/TUPLE/aliases", so that for example
   * /overrides/${aliases_relative_to_overrides}/libbz2.so.1 might exist
   * inside the final container */
  gchar *aliases_relative_to_overrides;
  /* Absolute path to TUPLE-capsule-capture-libs in p-v's execution
   * environment, with possible wrappers */
  GPtrArray *capsule_capture_libs;
  /* "lib/TUPLE", so that for example
   * /overrides/${libdir_relative_to_overrides}/libc.so.6 might exist inside
   * the final container */
  gchar *libdir_relative_to_overrides;
  /* A path valid inside the final container, for example
   * /overrides/${libdir_relative_to_overrides} */
  gchar *libdir_in_container;
  /* ABI's interoperable ld.so path, for example /lib64/ld-linux-x86-64.so.2 */
  gchar *ld_so;
  /* Architecture tuple as a quark */
  GQuark tuple_quark;
  SrtGraphicsProviderFeatureFlags provider_features;
} RuntimeArchitecture;

static PvGraphicsProvider *
pv_runtime_get_graphics_provider (PvRuntime *self,
                                  GQuark multiarch_tuple)
{
  if (self->providers == NULL)
    return NULL;

  if (multiarch_tuple == SRT_ARCHITECTURE_QUARK_NONE)
    return NULL;

  for (size_t i = 0; i < self->providers->len; i++)
    {
      PvGraphicsProvider *provider = g_ptr_array_index (self->providers, i);

      if (pv_graphics_provider_has_architecture (provider, multiarch_tuple))
        return provider;
    }

  return NULL;
}

static gboolean
runtime_architecture_detect_ld_so (RuntimeArchitecture *self,
                                   GError **error)
{
  g_autoptr(GPtrArray) argv = NULL;

  g_return_val_if_fail (self->ld_so == NULL, TRUE);

  argv = g_ptr_array_sized_new (self->capsule_capture_libs->len + 2);

  for (size_t i = 0; i < self->capsule_capture_libs->len; i++)
    g_ptr_array_add (argv, g_ptr_array_index (self->capsule_capture_libs, i));

  g_ptr_array_add (argv, (char *) "--print-ld.so");
  g_ptr_array_add (argv, NULL);

  /* This has the side-effect of testing whether we can run binaries
   * for this architecture on the current environment. We
   * assume that this is the same as whether we can run them
   * on the host, if different. */
  pv_run_sync (self->runner, self->tuple_quark,
               (const char * const *) argv->pdata,
               NULL, &self->ld_so, error);

  if (self->ld_so == NULL)
    return glnx_prefix_error (error,
                              "Cannot determine ld.so for %s",
                              self->tuple);

  return TRUE;
}

static gboolean
runtime_architecture_init (RuntimeArchitecture *self,
                           PvRuntime *runtime,
                           GQuark tuple,
                           GError **error)
{
  SrtSystemInfo *arch_system_info;
  SrtSubprocessRunner *runner;
  PvGraphicsProvider *provider;

  g_return_val_if_fail (tuple != SRT_ARCHITECTURE_QUARK_NONE, FALSE);
  g_return_val_if_fail (self->tuple == NULL, FALSE);

  self->tuple_quark = tuple;
  self->tuple = g_quark_to_string (tuple);
  g_return_val_if_fail (self->tuple != NULL, FALSE);

  provider = pv_runtime_get_graphics_provider (runtime, self->tuple_quark);
  g_return_val_if_fail (PV_IS_GRAPHICS_PROVIDER (provider), FALSE);
  self->provider = g_object_ref (provider);

  self->provider_details = g_object_ref (provider->details);
  self->provider_arch_details = _srt_graphics_provider_get_architecture (self->provider_details,
                                                                         tuple);
  self->provider_features = _srt_graphics_provider_architecture_get_features (self->provider_arch_details);

  arch_system_info = pv_graphics_provider_get_system_info (self->provider,
                                                           self->tuple_quark);
  self->system_info = g_object_ref (arch_system_info);
  runner = _srt_system_info_get_subprocess_runner (arch_system_info);
  self->runner = g_object_ref (runner);

  /* Could be %NULL, so be careful when dereferencing */
  self->known_arch = _srt_architecture_get_by_tuple (self->tuple);

  self->capsule_capture_libs = _srt_subprocess_runner_get_helper (runner,
                                                                  self->tuple,
                                                                  self->known_arch,
                                                                  "capsule-capture-libs",
                                                                  SRT_HELPER_FLAGS_SYSROOT_AWARE,
                                                                  error);

  if (self->capsule_capture_libs == NULL)
    return FALSE;

  self->libdir_relative_to_overrides = g_strdup_printf ("lib/%s",
                                                        self->tuple);
  self->libdir_in_container = g_build_filename (runtime->overrides_in_container,
                                                self->libdir_relative_to_overrides, NULL);

  self->aliases_relative_to_overrides = g_strdup_printf ("lib/%s/aliases",
                                                         self->tuple);

  if (self->known_arch == NULL
      || self->known_arch->interoperable_runtime_linker == NULL)
    {
      /* This is unlikely: we wouldn't do official binary builds of
       * capsule-capture-libs for an architecture we know nothing about.
       * But maybe someone built it unofficially? */
      g_info ("ld.so(8) for %s not known, attempting to auto-detect",
              self->tuple);

      if (!runtime_architecture_detect_ld_so (self, error))
        return FALSE;
    }
  else if (_srt_graphics_provider_get_manifest_path (self->provider_details) == NULL)
    {
      /* This is the typical case on x86: there is no specific graphics
       * provider (or it was specified as a directory, without metadata)
       * so the graphics provider's architectures are merely a best guess,
       * and we don't actually know whether we can run this architecture's
       * executables. For example, a pure x86_64 system might not be able
       * to run i386-linux-gnu-capsule-capture-libs. In this case we
       * make runtime_architecture_init() fail, which is not fatal,
       * so our caller will skip this architecture with a warning:
       * a container that can only run x86_64 code is better than nothing.
       * Run capsule-capture-libs --print-ld-so for its side-effect of
       * determining whether we can run this architecture at all. */
      g_debug ("Checking whether we can run architecture %s...", self->tuple);

      if (!runtime_architecture_detect_ld_so (self, error))
        return FALSE;
    }
  else
    {
      /* If we've explicitly been told to use a specific graphics provider
       * in the form of a JSON manifest, we can save some time by not
       * checking whether we can actually run this architecture.
       * If we can't, that's a configuration error by whoever supplied the
       * graphics provider, so it's OK that subsequent calls to
       * capsule-capture-libs will fail. */
      g_debug ("Graphics provider lists %s in its manifest, "
               "assuming we can run its executables",
               self->tuple);
      self->ld_so = g_strdup (self->known_arch->interoperable_runtime_linker);
    }

  g_return_val_if_fail (self->ld_so != NULL, FALSE);
  return TRUE;
}

static gboolean
runtime_architecture_check_valid (RuntimeArchitecture *self)
{
  g_return_val_if_fail (self->tuple != NULL, FALSE);
  g_return_val_if_fail (self->tuple_quark != SRT_ARCHITECTURE_QUARK_NONE, FALSE);
  g_return_val_if_fail (self->provider != NULL, FALSE);
  g_return_val_if_fail (self->capsule_capture_libs != NULL, FALSE);
  g_return_val_if_fail (self->libdir_relative_to_overrides != NULL, FALSE);
  g_return_val_if_fail (self->libdir_in_container != NULL, FALSE);
  g_return_val_if_fail (self->aliases_relative_to_overrides != NULL, FALSE);
  g_return_val_if_fail (self->ld_so != NULL, FALSE);
  return TRUE;
}

static void
runtime_architecture_clear (RuntimeArchitecture *self)
{
  self->tuple = NULL;
  self->tuple_quark = SRT_ARCHITECTURE_QUARK_NONE;
  g_clear_object (&self->provider);
  g_clear_object (&self->provider_details);
  g_clear_object (&self->system_info);
  g_clear_object (&self->runner);
  g_clear_pointer (&self->capsule_capture_libs, g_ptr_array_unref);
  g_clear_pointer (&self->libdir_relative_to_overrides, g_free);
  g_clear_pointer (&self->libdir_in_container, g_free);
  g_clear_pointer (&self->aliases_relative_to_overrides, g_free);
  g_clear_pointer (&self->ld_so, g_free);
}

G_DEFINE_AUTO_CLEANUP_CLEAR_FUNC (RuntimeArchitecture,
                                  runtime_architecture_clear)

static gboolean pv_runtime_use_provider_graphics_stack (PvRuntime *self,
                                                        FlatpakBwrap *bwrap,
                                                        SrtEnvOverlay *container_env,
                                                        GError **error);
static void pv_runtime_set_search_paths (PvRuntime *self,
                                         SrtEnvOverlay *container_env);

static void
pv_runtime_init (PvRuntime *self)
{
  self->any_libc_from_provider = FALSE;
  self->all_libc_from_provider = FALSE;
  self->overrides_fd = -1;
  self->runtime_files_fd = -1;
  self->variable_dir_fd = -1;
  self->is_flatpak_env = g_file_test ("/.flatpak-info",
                                      G_FILE_TEST_IS_REGULAR);
  self->tuples = _srt_architecture_array_new ();
}

static void
pv_runtime_get_property (GObject *object,
                         guint prop_id,
                         GValue *value,
                         GParamSpec *pspec)
{
  PvRuntime *self = PV_RUNTIME (object);

  switch (prop_id)
    {
      case PROP_ARCHITECTURES:
          {
            g_autoptr(GArray) arr = _srt_architecture_array_new ();

            g_array_append_vals (arr, self->tuples->data, self->tuples->len);
            g_value_take_boxed (value, g_steal_pointer (&arr));
          }
        break;

      case PROP_BUBBLEWRAP:
        g_value_set_string (value, self->bubblewrap);
        break;

      case PROP_GRAPHICS_PROVIDERS:
        g_value_set_boxed (value, self->providers);
        break;

      case PROP_HOME:
        g_value_set_string (value, g_quark_to_string (self->home));
        break;

      case PROP_ORIGINAL_ENVIRON:
        g_value_set_boxed (value, self->original_environ);
        break;

      case PROP_FLAGS:
        g_value_set_flags (value, self->flags);
        break;

      case PROP_VARIABLE_DIR:
        g_value_set_string (value, self->variable_dir);
        break;

      case PROP_SOURCE:
        g_value_set_string (value, self->source);
        break;

      case PROP_RUN_IN_CURRENT_CONTEXT:
        g_value_set_object (value, self->run_in_current_context);
        break;

      case PROP_WORKAROUNDS:
        g_value_set_flags (value, self->workarounds);
        break;

      default:
        G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
    }
}

static void
pv_runtime_set_property (GObject *object,
                         guint prop_id,
                         const GValue *value,
                         GParamSpec *pspec)
{
  PvRuntime *self = PV_RUNTIME (object);
  const char *path;

  switch (prop_id)
    {
      case PROP_ARCHITECTURES:
          {
            const GArray *arr;

            /* Construct-only */
            g_return_if_fail (self->tuples->len == 0);

            arr = g_value_get_boxed (value);
            g_array_append_vals (self->tuples, arr->data, arr->len);
          }
        break;

      case PROP_BUBBLEWRAP:
        /* Construct-only */
        g_return_if_fail (self->bubblewrap == NULL);
        self->bubblewrap = g_value_dup_string (value);
        break;

      case PROP_GRAPHICS_PROVIDERS:
        /* Construct-only */
        g_return_if_fail (self->providers == NULL);
        self->providers = g_value_dup_boxed (value);
        break;

      case PROP_HOME:
        /* Construct-only */
        g_return_if_fail (self->home == 0);

        self->home = g_quark_from_string (g_value_get_string (value));
        break;

      case PROP_ORIGINAL_ENVIRON:
        /* Construct-only */
        g_return_if_fail (self->original_environ == NULL);

        self->original_environ = g_value_dup_boxed (value);
        break;

      case PROP_FLAGS:
        self->flags = g_value_get_flags (value);
        break;

      case PROP_VARIABLE_DIR:
        /* Construct-only */
        g_return_if_fail (self->variable_dir == NULL);
        path = g_value_get_string (value);

        if (path != NULL)
          {
            self->variable_dir = realpath (path, NULL);

            if (self->variable_dir == NULL)
              {
                /* It doesn't exist. Keep the non-canonical path so we
                 * can warn about it later */
                self->variable_dir = g_strdup (path);
              }
          }

        break;

      case PROP_SOURCE:
        /* Construct-only */
        g_return_if_fail (self->source == NULL);
        path = g_value_get_string (value);

        if (path != NULL)
          {
            self->source = realpath (path, NULL);

            if (self->source == NULL)
              {
                /* It doesn't exist. Keep the non-canonical path so we
                 * can warn about it later */
                self->source = g_strdup (path);
              }
          }

        break;

      case PROP_RUN_IN_CURRENT_CONTEXT:
        /* Construct-only */
        g_return_if_fail (self->run_in_current_context == NULL);
        self->run_in_current_context = g_value_dup_object (value);
        break;

      case PROP_WORKAROUNDS:
        self->workarounds = g_value_get_flags (value);
        break;

      default:
        G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
    }
}

static void
pv_runtime_constructed (GObject *object)
{
  PvRuntime *self = PV_RUNTIME (object);

  G_OBJECT_CLASS (pv_runtime_parent_class)->constructed (object);

  g_return_if_fail (self->original_environ != NULL);
  g_return_if_fail (self->source != NULL);
}

static void
pv_runtime_maybe_garbage_collect_subdir (const char *description,
                                         const char *parent,
                                         int parent_fd,
                                         const char *member)
{
  g_autoptr(GError) local_error = NULL;
  g_autoptr(SrtFileLock) temp_lock = NULL;
  g_autofree gchar *keep = NULL;
  g_autofree gchar *ref = NULL;
  struct stat ignore;

  g_return_if_fail (parent != NULL);
  g_return_if_fail (parent_fd >= 0);
  g_return_if_fail (member != NULL);

  g_debug ("Found %s %s/%s, considering whether to delete it...",
           description, parent, member);

  keep = g_build_filename (member, "keep", NULL);

  if (glnx_fstatat (parent_fd, keep, &ignore,
                    AT_SYMLINK_NOFOLLOW, &local_error))
    {
      g_debug ("Not deleting \"%s/%s\": ./keep exists",
               parent, member);
      return;
    }
  else if (!g_error_matches (local_error, G_IO_ERROR,
                             G_IO_ERROR_NOT_FOUND))
    {
      /* EACCES or something? Give it the benefit of the doubt */
      g_warning ("Not deleting \"%s/%s\": unable to stat ./keep: %s",
               parent, member, local_error->message);
      return;
    }

  g_clear_error (&local_error);

  ref = g_build_filename (member, ".ref", NULL);
  temp_lock = srt_file_lock_new (parent_fd, ref,
                                 (SRT_FILE_LOCK_FLAGS_CREATE |
                                  SRT_FILE_LOCK_FLAGS_EXCLUSIVE),
                                 &local_error);

  if (temp_lock == NULL)
    {
      g_info ("Not deleting \"%s/%s\": unable to get lock: %s",
              parent, member, local_error->message);
      return;
    }

  g_debug ("Deleting \"%s/%s\"...", parent, member);

  /* We have the lock, which would not have happened if someone was
   * still using the runtime, so we can safely delete it. */
  if (!glnx_shutil_rm_rf_at (parent_fd, member, NULL, &local_error))
    {
      g_debug ("Unable to delete %s/%s: %s",
               parent, member, local_error->message);
    }
}

static gboolean
pv_runtime_garbage_collect (PvRuntime *self,
                            SrtFileLock *variable_dir_lock,
                            GError **error)
{
  g_auto(SrtDirIter) iter = SRT_DIR_ITER_CLEARED;
  G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) timer = NULL;

  g_return_val_if_fail (PV_IS_RUNTIME (self), FALSE);
  g_return_val_if_fail (self->variable_dir != NULL, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);
  /* We don't actually *use* this: it just acts as an assertion that
   * we are holding the lock on the parent directory. */
  g_return_val_if_fail (variable_dir_lock != NULL, FALSE);

  timer = _srt_profiling_start ("Cleaning up temporary runtimes in %s",
                                self->variable_dir);

  if (!_srt_dir_iter_init_at (&iter, AT_FDCWD, self->variable_dir,
                              (SRT_DIR_ITER_FLAGS_FOLLOW
                               | SRT_DIR_ITER_FLAGS_ENSURE_DTYPE),
                              self->arbitrary_dirent_order,
                              error))
    return FALSE;

  while (TRUE)
    {
      struct dirent *dent;

      if (!_srt_dir_iter_next_dent (&iter, &dent, NULL, error))
        return FALSE;

      if (dent == NULL)
        break;

      switch (dent->d_type)
        {
          case DT_DIR:
            break;

          case DT_BLK:
          case DT_CHR:
          case DT_FIFO:
          case DT_LNK:
          case DT_REG:
          case DT_SOCK:
          case DT_UNKNOWN:
          default:
            g_debug ("Ignoring %s/%s: not a directory",
                     self->variable_dir, dent->d_name);
            continue;
        }

      if (!g_str_has_prefix (dent->d_name, "tmp-"))
        {
          g_debug ("Ignoring %s/%s: not tmp-*",
                   self->variable_dir, dent->d_name);
          continue;
        }

      pv_runtime_maybe_garbage_collect_subdir ("temporary runtime",
                                               self->variable_dir,
                                               self->variable_dir_fd,
                                               dent->d_name);
    }

  return TRUE;
}

static gboolean
pv_runtime_init_variable_dir (PvRuntime *self,
                              GError **error)
{
  /* Nothing to do in this case */
  if (self->variable_dir == NULL)
    return TRUE;

  if (g_mkdir_with_parents (self->variable_dir, 0700) != 0)
    return glnx_throw_errno_prefix (error, "Unable to create %s",
                                    self->variable_dir);

  if (!glnx_opendirat (AT_FDCWD, self->variable_dir, TRUE,
                       &self->variable_dir_fd, error))
    return FALSE;

  return TRUE;
}

static gboolean
pv_runtime_create_copy (PvRuntime *self,
                        SrtFileLock *variable_dir_lock,
                        const char *usr_mtree,
                        PvMtreeApplyFlags mtree_flags,
                        GError **error)
{
  g_autofree gchar *dest_usr = NULL;
  g_autofree gchar *temp_dir = NULL;
  g_auto(SrtDirIter) dir = SRT_DIR_ITER_CLEARED;
  g_autoptr(SrtFileLock) copy_lock = NULL;
  G_GNUC_UNUSED g_autoptr(SrtFileLock) source_lock = NULL;
  G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) timer = NULL;
  struct dirent *dent;
  glnx_autofd int temp_dir_fd = -1;
  gboolean is_just_usr;

  g_return_val_if_fail (PV_IS_RUNTIME (self), FALSE);
  g_return_val_if_fail (self->variable_dir != NULL, FALSE);
  g_return_val_if_fail (self->flags & PV_RUNTIME_FLAGS_COPY_RUNTIME, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);
  /* We don't actually *use* this: it just acts as an assertion that
   * we are holding the lock on the parent directory. */
  g_return_val_if_fail (variable_dir_lock != NULL, FALSE);

  timer = _srt_profiling_start ("Temporary runtime copy");

  temp_dir = g_build_filename (self->variable_dir, "tmp-XXXXXX", NULL);

  if (g_mkdtemp (temp_dir) == NULL)
    return glnx_throw_errno_prefix (error,
                                    "Cannot create temporary directory \"%s\"",
                                    temp_dir);

  g_debug ("Using temporary mutable sysroot: \"%s\"", temp_dir);
  dest_usr = g_build_filename (temp_dir, "usr", NULL);

  if (usr_mtree != NULL)
    {
      is_just_usr = TRUE;
    }
  else
    {
      g_autofree gchar *source_usr_subdir = g_build_filename (self->source_files,
                                                              "usr", NULL);

      is_just_usr = !g_file_test (source_usr_subdir, G_FILE_TEST_IS_DIR);
    }

  if (is_just_usr)
    {
      /* ${source_files}/usr does not exist, so assume it's a merged /usr,
       * for example ./scout/files. Copy ${source_files}/bin to
       * ${temp_dir}/usr/bin, etc. */
      if (usr_mtree != NULL)
        {
          /* If there's a manifest available, it's actually quicker to iterate
           * through the manifest and use that to populate a new copy of the
           * runtime that it would be to do the equivalent of `cp -al` -
           * presumably because the mtree is probably contiguous on disk,
           * and the nested directories are probably not. */
          glnx_autofd int dest_usr_fd = -1;

          if (!glnx_ensure_dir (AT_FDCWD, dest_usr, 0755, error))
            return FALSE;

          if (!glnx_opendirat (AT_FDCWD, dest_usr, FALSE, &dest_usr_fd, error))
            {
              g_prefix_error (error, "Unable to open \"%s\": ", dest_usr);
              return FALSE;
            }

          if (!pv_mtree_apply (usr_mtree, dest_usr, dest_usr_fd,
                               self->source_files,
                               (mtree_flags
                                | PV_MTREE_APPLY_FLAGS_CHMOD_MAY_FAIL
                                | PV_MTREE_APPLY_FLAGS_EXPECT_HARD_LINKS),
                               error))
            return FALSE;
        }
      else
        {
          /* Fall back to assuming that what's on-disk is correct. */
          if (!pv_cheap_tree_copy (self->source_files, dest_usr,
                                   (PV_COPY_FLAGS_CHMOD_MAY_FAIL
                                    | PV_COPY_FLAGS_EXPECT_HARD_LINKS),
                                   error))
            return FALSE;
        }
    }
  else
    {
      /* ${source_files}/usr exists, so assume it's a complete sysroot.
       * Merge ${source_files}/bin and ${source_files}/usr/bin into
       * ${temp_dir}/usr/bin, etc. */
      g_assert (usr_mtree == NULL);

      if (!pv_cheap_tree_copy (self->source_files, temp_dir,
                               (PV_COPY_FLAGS_CHMOD_MAY_FAIL
                                | PV_COPY_FLAGS_USRMERGE),
                               error))
        return FALSE;
    }

  if (!glnx_opendirat (-1, temp_dir, FALSE, &temp_dir_fd, error))
    return FALSE;

  /* We need to break the hard link for the lock file, otherwise the
   * temporary copy will share its locked/unlocked state with the
   * original. */
  if (TEMP_FAILURE_RETRY (unlinkat (temp_dir_fd, ".ref", 0)) != 0
      && errno != ENOENT)
    return glnx_throw_errno_prefix (error,
                                    "Cannot remove \"%s/.ref\"",
                                    temp_dir);

  if (TEMP_FAILURE_RETRY (unlinkat (temp_dir_fd, "usr/.ref", 0)) != 0
      && errno != ENOENT)
    return glnx_throw_errno_prefix (error,
                                    "Cannot remove \"%s/usr/.ref\"",
                                    temp_dir);

  /* Create the copy in a pre-locked state. After the lock on the parent
   * directory is released, the copy continues to have a read lock,
   * preventing it from being modified or deleted while in use (even if
   * a cleanup process successfully obtains a write lock on the parent).
   *
   * Because we control the structure of the runtime in this case, we
   * actually lock /usr/.ref instead of /.ref, and ensure that /.ref
   * is a symlink to it. This might become important if we pass the
   * runtime's /usr to Flatpak, which normally takes out a lock on
   * /usr/.ref (obviously this will only work if the runtime happens
   * to be merged-/usr). */
  copy_lock = srt_file_lock_new (temp_dir_fd, "usr/.ref",
                                 SRT_FILE_LOCK_FLAGS_CREATE,
                                 error);

  if (copy_lock == NULL)
    return glnx_prefix_error (error,
                              "Unable to lock \"%s/.ref\" in temporary runtime",
                              dest_usr);

  if (is_just_usr)
    {
      if (TEMP_FAILURE_RETRY (symlinkat ("usr/.ref",
                                         temp_dir_fd,
                                         ".ref")) != 0)
        return glnx_throw_errno_prefix (error,
                                        "Cannot create symlink \"%s/.ref\" -> usr/.ref",
                                        temp_dir);
    }

  if (!_srt_dir_iter_init_at (&dir, AT_FDCWD, dest_usr,
                              SRT_DIR_ITER_FLAGS_FOLLOW,
                              self->arbitrary_dirent_order,
                              error))
    return FALSE;

  while (_srt_dir_iter_next_dent (&dir, &dent, NULL, NULL) && dent != NULL)
    {
      const char *member = dent->d_name;

      /* Create symlinks ${temp_dir}/bin -> usr/bin, etc. if missing.
       *
       * Also make ${temp_dir}/etc, ${temp_dir}/var symlinks to etc
       * and var, for the benefit of tools like capsule-capture-libs
       * accessing /etc/ld.so.cache in the incomplete container (for the
       * final container command-line they get merged by bind_runtime()
       * instead). */
      if (g_str_equal (member, "bin") ||
          g_str_equal (member, "etc") ||
          (g_str_has_prefix (member, "lib") &&
           !g_str_equal (member, "libexec")) ||
          g_str_equal (member, "sbin") ||
          g_str_equal (member, "var"))
        {
          g_autofree gchar *dest = g_build_filename (temp_dir, member, NULL);
          g_autofree gchar *target = g_build_filename ("usr", member, NULL);

          if (symlink (target, dest) != 0)
            {
              /* Ignore EEXIST in the case where it was not just /usr:
               * it's fine if the runtime we copied from source_files
               * already had either directories or symlinks in its root
               * directory */
              if (is_just_usr || errno != EEXIST)
                return glnx_throw_errno_prefix (error,
                                                "Cannot create symlink \"%s\" -> %s",
                                                dest, target);
            }
        }
    }

  /* Hand over from holding a lock on the source to just holding a lock
   * on the copy. We'll release source_lock when we leave this scope */
  source_lock = g_steal_pointer (&self->runtime_lock);
  self->runtime_lock = g_steal_pointer (&copy_lock);
  self->mutable_sysroot = _srt_sysroot_new_take (g_steal_pointer (&temp_dir),
                                                 g_steal_fd (&temp_dir_fd));

  return TRUE;
}

static gboolean
pv_runtime_initable_init (GInitable *initable,
                          GCancellable *cancellable G_GNUC_UNUSED,
                          GError **error)
{
  PvRuntime *self = PV_RUNTIME (initable);
  g_autoptr(GError) local_error = NULL;
  g_autoptr(SrtFileLock) mutable_lock = NULL;
  g_autofree gchar *adverb = NULL;
  g_autofree gchar *contents = NULL;
  g_autofree gchar *os_release = NULL;
  g_autofree gchar *usr_mtree = NULL;
  SrtEmulator *emulator;
  gsize len;
  PvMtreeApplyFlags mtree_flags = PV_MTREE_APPLY_FLAGS_NONE;
  struct stat ignore;

  g_return_val_if_fail (PV_IS_RUNTIME (self), FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  /* Should have been set at construct time */
  g_return_val_if_fail (self->run_in_current_context != NULL, FALSE);

  emulator = _srt_subprocess_runner_get_emulator (self->run_in_current_context);

  if (emulator != NULL)
    self->emulator = g_object_ref (emulator);

  self->pv_prefix = _srt_find_myself (NULL, NULL, error);

  if (self->pv_prefix == NULL)
    return FALSE;

  if (self->tuples == NULL || self->tuples->len == 0)
    return glnx_throw (error, "No architectures configured");

  for (size_t i = 0; i < self->tuples->len; i++)
    {
      GQuark q = g_array_index (self->tuples, GQuark, i);
      const char *tuple = g_quark_to_string (q);

      g_debug ("Configured architecture: %s", tuple);

      if (!_srt_architecture_check_plausible_tuple (tuple, error))
        return FALSE;
    }

  adverb = g_build_filename (self->pv_prefix, PV_ADVERB_IN_PREFIX, NULL);
  self->adverb_architecture = _srt_architecture_guess_from_elf (AT_FDCWD,
                                                                adverb,
                                                                &local_error);

  if (G_LIKELY (self->adverb_architecture != NULL))
    {
      g_debug ("pv-adverb is a %s executable",
               self->adverb_architecture->multiarch_tuple);
    }
  else
    {
      self->adverb_architecture = _srt_architecture_get_current ();

      if (self->adverb_architecture != NULL)
        {
          _srt_log_warning ("Unable to determine architecture of pv-adverb, assuming %s: %s",
                            self->adverb_architecture->multiarch_tuple,
                            local_error->message);
          g_clear_error (&local_error);
        }
      else
        {
          /* In practice this can't happen in official builds, because
           * we do define _SRT_MULTIARCH in official builds, and we also
           * don't do official builds for any architecture that isn't
           * in the SrtKnownArchitecture table. */
          g_propagate_prefixed_error (error, g_steal_pointer (&local_error),
                                      "Unable to determine architecture of pv-adverb: ");
          return FALSE;
        }
    }

  /* If we are in Flatpak container we don't expect to have a working bwrap */
  if (self->bubblewrap != NULL
      && !g_file_test (self->bubblewrap, G_FILE_TEST_IS_EXECUTABLE))
    {
      return glnx_throw (error, "\"%s\" is not executable",
                         self->bubblewrap);
    }

  if (!pv_runtime_init_variable_dir (self, error))
    return FALSE;

  if (!g_file_test (self->source, G_FILE_TEST_IS_DIR))
    {
      return glnx_throw (error, "\"%s\" is not a directory",
                         self->source);
    }

  /* If the runtime directory contains usr-mtree.txt, assume that it's a
   * Flatpak-style merged-/usr runtime, and usr-mtree.txt describes
   * what's in the runtime. The content is taken from the files/
   * directory, but files not listed in the mtree are not included.
   *
   * The manifest compresses well (about 3:1 if sha256sums are included)
   * so try to read a compressed version first, falling back to
   * uncompressed. */
  usr_mtree = g_build_filename (self->source, "usr-mtree.txt.gz", NULL);

  if (g_file_test (usr_mtree, G_FILE_TEST_IS_REGULAR))
    {
      mtree_flags |= PV_MTREE_APPLY_FLAGS_GZIP;
    }
  else
    {
      g_clear_pointer (&usr_mtree, g_free);
      usr_mtree = g_build_filename (self->source, "usr-mtree.txt", NULL);
    }

  if (!g_file_test (usr_mtree, G_FILE_TEST_IS_REGULAR))
    g_clear_pointer (&usr_mtree, g_free);

  /* Or, if it contains ./files/, assume it's a Flatpak-style runtime where
   * ./files is a merged /usr and ./metadata is an optional GKeyFile. */
  self->source_files = g_build_filename (self->source, "files", NULL);

  if (usr_mtree != NULL)
    {
      g_debug ("Assuming %s is a merged-/usr runtime because it has "
               "a /usr mtree",
               self->source);
    }
  else if (g_file_test (self->source_files, G_FILE_TEST_IS_DIR))
    {
      g_debug ("Assuming %s is a Flatpak-style runtime", self->source);
    }
  else
    {
      g_debug ("Assuming %s is a sysroot or merged /usr", self->source);
      g_clear_pointer (&self->source_files, g_free);
      self->source_files = g_strdup (self->source);
    }

  g_debug ("Taking runtime files from: %s", self->source_files);

  /* Take a lock on the runtime until we're finished with setup,
   * to make sure it doesn't get deleted.
   *
   * If the runtime is mounted read-only in the container, it will
   * continue to be locked until all processes in the container exit.
   * If we make a temporary mutable copy, we only hold this lock until
   * setup has finished. */
  if (self->runtime_lock == NULL)
    {
      g_autofree gchar *files_ref = NULL;

      files_ref = g_build_filename (self->source_files, ".ref", NULL);
      self->runtime_lock = srt_file_lock_new (AT_FDCWD, files_ref,
                                              SRT_FILE_LOCK_FLAGS_CREATE,
                                              error);
    }

  /* If the runtime is being deleted, ... don't use it, I suppose? */
  if (self->runtime_lock == NULL)
    return FALSE;

  /* GC old runtimes (if they have become unused) before we create a
   * new one. This means we should only ever have one temporary runtime
   * copy per game that is run concurrently. */
  if (self->variable_dir_fd >= 0
      && (self->flags & PV_RUNTIME_FLAGS_GC_RUNTIMES))
    {
      /* Take out an exclusive lock for GC so that we will not conflict
       * with other concurrent processes that are halfway through
       * deploying or unpacking a runtime. */
      if (mutable_lock == NULL)
        mutable_lock = srt_file_lock_new (self->variable_dir_fd, ".ref",
                                          (SRT_FILE_LOCK_FLAGS_CREATE
                                           | SRT_FILE_LOCK_FLAGS_EXCLUSIVE),
                                          &local_error);

      if (mutable_lock == NULL)
        g_debug ("Unable to take an exclusive lock, skipping GC: %s",
                 local_error->message);
      else if (!pv_runtime_garbage_collect (self, mutable_lock, error))
        return FALSE;
    }

  /* Always copy the runtime into var/ before applying a manifest. */
  if (usr_mtree != NULL)
    self->flags |= PV_RUNTIME_FLAGS_COPY_RUNTIME;

  /* Always copy the runtime into var/ if we are setting it up as an
   * overlay rootfs for FEX-Emu or similar. This lets us require that
   * we're using a mutable sysroot, which is a lot simpler. */
  if (self->flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT)
    self->flags |= PV_RUNTIME_FLAGS_COPY_RUNTIME;

  if (self->flags & PV_RUNTIME_FLAGS_DETERMINISTIC)
    {
      self->arbitrary_dirent_order = _srt_dirent_strcmp;
      self->arbitrary_str_order = _srt_generic_strcmp0;
    }

  if (self->flags & PV_RUNTIME_FLAGS_COPY_RUNTIME)
    {
      if (self->variable_dir_fd < 0)
        return glnx_throw (error,
                           "Cannot copy runtime without variable directory");

      /* This time take out a non-exclusive lock: any number of processes
       * can safely be creating their own temporary copy at the same
       * time. If another process is doing GC, wait for it to finish,
       * then take our lock. */
      if (mutable_lock == NULL)
        mutable_lock = srt_file_lock_new (self->variable_dir_fd, ".ref",
                                          (SRT_FILE_LOCK_FLAGS_CREATE
                                           | SRT_FILE_LOCK_FLAGS_WAIT),
                                          error);

      if (mutable_lock == NULL)
        return FALSE;

      if (!pv_runtime_create_copy (self, mutable_lock, usr_mtree,
                                   mtree_flags, error))
        return FALSE;
    }

  if (self->mutable_sysroot != NULL)
    {
      self->overrides_in_container = "/usr/lib/pressure-vessel/overrides";
      self->overrides = g_build_filename (self->mutable_sysroot->path,
                                          self->overrides_in_container, NULL);
      self->runtime_files = self->mutable_sysroot->path;
    }
  else
    {
      /* We currently only need a temporary directory if we don't have
       * a mutable sysroot to work with. */
      g_autofree gchar *tmpdir = g_dir_make_tmp ("pressure-vessel-wrap.XXXXXX",
                                                 error);

      if (tmpdir == NULL)
        return FALSE;

      self->tmpdir = realpath (tmpdir, NULL);

      if (self->tmpdir == NULL)
        return glnx_throw_errno_prefix (error, "realpath(\"%s\")", tmpdir);

      self->overrides = g_build_filename (self->tmpdir, "overrides", NULL);
      self->overrides_in_container = "/overrides";
      self->runtime_files = self->source_files;
    }

  if (!glnx_opendirat (-1, self->runtime_files, TRUE,
                       &self->runtime_files_fd, error))
    return FALSE;

  self->runtime_files_on_host = pv_current_namespace_path_to_host_path (self->runtime_files);

  if (!glnx_shutil_mkdir_p_at_open (AT_FDCWD, self->overrides, 0700,
                                    &self->overrides_fd, NULL, error))
    {
      g_prefix_error (error, "Unable to create and open \"%s\": ",
                      self->overrides);
      return FALSE;
    }

  self->runtime_app = g_build_filename (self->runtime_files, "app", NULL);
  self->runtime_usr = g_build_filename (self->runtime_files, "usr", NULL);

  if (g_file_test (self->runtime_usr, G_FILE_TEST_IS_DIR))
    {
      self->runtime_is_just_usr = FALSE;
      self->libcapsule_knowledge = g_build_filename ("usr", "lib", "steamrt",
                                                     "libcapsule-knowledge.keyfile",
                                                     NULL);
    }
  else
    {
      /* runtime_files is just a merged /usr. */
      self->runtime_is_just_usr = TRUE;
      g_free (self->runtime_usr);
      self->runtime_usr = g_strdup (self->runtime_files);
      self->libcapsule_knowledge = g_build_filename ("lib", "steamrt",
                                                     "libcapsule-knowledge.keyfile",
                                                     NULL);
    }

  if (fstatat (self->runtime_files_fd, self->libcapsule_knowledge,
               &ignore, AT_SYMLINK_NOFOLLOW) != 0)
    g_clear_pointer (&self->libcapsule_knowledge, g_free);

  /* We assume that in any runtime we might want to ship (unlike the
   * graphics stack, which is outside our control), ldconfig(8) will
   * be at its canonical path, /sbin/ldconfig.
   * Later, we might parachute in the ldconfig(8) from the graphics
   * provider, to go with a glibc from the graphics provider.
   * If so, we'll overwrite self->ldconfig_architecture with the
   * architecture of the replacement ldconfig. */
  self->ldconfig_architecture = _srt_architecture_guess_from_elf (self->runtime_files_fd,
                                                                  "sbin/ldconfig",
                                                                  &local_error);

  if (G_LIKELY (self->ldconfig_architecture != NULL))
    {
      g_debug ("runtime's ldconfig(8) is a %s executable",
               self->ldconfig_architecture->multiarch_tuple);
    }
  else
    {
      /* Not a g_warning() because during unit testing, our mock sysroot
       * legitimately doesn't have a real ldconfig */
      _srt_log_warning ("Unable to determine architecture of runtime's ldconfig: %s",
                        local_error->message);
      g_clear_error (&local_error);
    }

  self->runtime_abi_json = g_build_filename (self->runtime_usr, "lib", "steamrt",
                                             "steam-runtime-abi.json", NULL);

  if (!g_file_test (self->runtime_abi_json, G_FILE_TEST_EXISTS))
    g_clear_pointer (&self->runtime_abi_json, g_free);

  os_release = g_build_filename (self->runtime_usr, "lib", "os-release", NULL);

  /* TODO: Teach SrtSystemInfo to be able to load lib/os-release from
   * a merged-/usr, so we don't need to open-code this here */
  if (g_file_get_contents (os_release, &contents, &len, NULL))
    {
      g_autofree gchar *id = NULL;
      g_autofree gchar *version_id = NULL;
      char *beginning_of_line = contents;

      for (size_t i = 0; i < len; i++)
        {
          if (contents[i] == '\n')
            {
              contents[i] = '\0';

              if (id == NULL &&
                  g_str_has_prefix (beginning_of_line, "ID="))
                id = g_shell_unquote (beginning_of_line + strlen ("ID="), NULL);
              else if (version_id == NULL &&
                       g_str_has_prefix (beginning_of_line, "VERSION_ID="))
                version_id = g_shell_unquote (beginning_of_line + strlen ("VERSION_ID="), NULL);

              beginning_of_line = contents + i + 1;
            }
        }

      if (g_strcmp0 (id, "steamrt") == 0)
        {
          self->is_steamrt = TRUE;

          if (g_strcmp0 (version_id, "1") == 0)
            self->is_scout = TRUE;
        }
    }

  /* Opening /proc/self/root rather than / lets us bypass FEX-Emu's
   * redirection from the real root filesystem into its "rootfs". */
  self->real_root = _srt_sysroot_new_real_root (error);

  if (self->real_root == NULL)
    return FALSE;

  /* If we are in a Flatpak environment we expect to have the host system
   * mounted in `/run/host`. Otherwise we assume that the host system, in the
   * current namespace, is the root - but again use /proc/self/root to bypass
   * FEX-Emu's redirection. */
  if (g_file_test ("/.flatpak-info", G_FILE_TEST_IS_REGULAR))
    {
      self->host_root = _srt_sysroot_new_flatpak_host (error);

      if (self->host_root == NULL)
        return FALSE;
    }
  else
    {
      self->host_root = g_object_ref (self->real_root);
    }

  return TRUE;
}

void
pv_runtime_cleanup (PvRuntime *self)
{
  g_autoptr(GError) local_error = NULL;

  g_return_if_fail (PV_IS_RUNTIME (self));

  if (self->tmpdir != NULL &&
      !glnx_shutil_rm_rf_at (-1, self->tmpdir, NULL, &local_error))
    {
      g_warning ("Unable to delete temporary directory: %s",
                 local_error->message);
    }

  g_clear_pointer (&self->overrides, g_free);
  g_clear_pointer (&self->container_access, g_free);
  g_clear_pointer (&self->container_access_adverb, flatpak_bwrap_free);
  g_clear_pointer (&self->tmpdir, g_free);
}

static void
pv_runtime_dispose (GObject *object)
{
  PvRuntime *self = PV_RUNTIME (object);

  /* This is borrowed from mutable_sysroot, so must be cleared here */
  self->runtime_files = NULL;

  if (self->providers != NULL)
    g_ptr_array_set_size (self->providers, 0);

  g_clear_object (&self->emulator);
  g_clear_object (&self->emulator_in_container);
  g_clear_object (&self->mutable_sysroot);
  g_clear_object (&self->real_root);
  g_clear_object (&self->host_root);
  g_clear_object (&self->run_in_current_context);

  G_OBJECT_CLASS (pv_runtime_parent_class)->dispose (object);
}

static void
pv_runtime_finalize (GObject *object)
{
  PvRuntime *self = PV_RUNTIME (object);

  pv_runtime_cleanup (self);
  g_free (self->bubblewrap);
  g_free (self->helpers_dir_in_container);
  g_free (self->libcapsule_knowledge);
  g_strfreev (self->original_environ);
  g_clear_fd (&self->overrides_fd, NULL);
  g_clear_pointer (&self->providers, g_ptr_array_unref);
  g_free (self->runtime_abi_json);
  g_free (self->runtime_app);
  g_clear_fd (&self->runtime_files_fd, NULL);
  g_free (self->runtime_files_on_host);
  g_free (self->runtime_usr);
  g_clear_pointer (&self->runtime_lock, srt_file_lock_free);
  g_free (self->source);
  g_free (self->source_files);
  g_clear_pointer (&self->tuples, g_array_unref);
  g_free (self->variable_dir);
  g_clear_fd (&self->variable_dir_fd, NULL);

  G_OBJECT_CLASS (pv_runtime_parent_class)->finalize (object);
}

static void
pv_runtime_class_init (PvRuntimeClass *cls)
{
  GObjectClass *object_class = G_OBJECT_CLASS (cls);

  object_class->get_property = pv_runtime_get_property;
  object_class->set_property = pv_runtime_set_property;
  object_class->constructed = pv_runtime_constructed;
  object_class->dispose = pv_runtime_dispose;
  object_class->finalize = pv_runtime_finalize;

  properties[PROP_ARCHITECTURES] =
    g_param_spec_boxed ("architectures", "Architectures",
                        "GArray of GQuark representing multiarch tuples",
                        G_TYPE_ARRAY,
                        (G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                         G_PARAM_STATIC_STRINGS));

  properties[PROP_BUBBLEWRAP] =
    g_param_spec_string ("bubblewrap", "Bubblewrap",
                         "Bubblewrap executable",
                         NULL,
                         (G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                          G_PARAM_STATIC_STRINGS));

  properties[PROP_GRAPHICS_PROVIDERS] =
    g_param_spec_boxed ("graphics-providers",
                        "Graphics providers",
                        "Sysroots used for graphics stack, or NULL",
                        G_TYPE_PTR_ARRAY,
                        (G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                         G_PARAM_STATIC_STRINGS));

  properties[PROP_HOME] =
    g_param_spec_string ("home", "Home directory",
                         "The original home directory to use",
                         NULL,
                         (G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                          G_PARAM_STATIC_STRINGS));

  properties[PROP_ORIGINAL_ENVIRON] =
    g_param_spec_boxed ("original-environ", "Original environ",
                        "The original environ to use",
                        G_TYPE_STRV,
                        (G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                         G_PARAM_STATIC_STRINGS));

  properties[PROP_FLAGS] =
    g_param_spec_flags ("flags", "Flags",
                        "Flags affecting how we set up the runtime",
                        PV_TYPE_RUNTIME_FLAGS, PV_RUNTIME_FLAGS_NONE,
                        (G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                         G_PARAM_STATIC_STRINGS));

  properties[PROP_VARIABLE_DIR] =
    g_param_spec_string ("variable-dir", "Variable directory",
                         ("Path to directory for temporary files, or NULL"),
                         NULL,
                         (G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                          G_PARAM_STATIC_STRINGS));

  properties[PROP_SOURCE] =
    g_param_spec_string ("source", "Source",
                         ("Path to read-only runtime files (merged-/usr "
                          "or sysroot), in current namespace"),
                         NULL,
                         (G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                          G_PARAM_STATIC_STRINGS));

  properties[PROP_RUN_IN_CURRENT_CONTEXT] =
    g_param_spec_object ("run-in-current-context", NULL, NULL,
                         SRT_TYPE_SUBPROCESS_RUNNER,
                         (G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                          G_PARAM_STATIC_STRINGS));

  properties[PROP_WORKAROUNDS] =
    g_param_spec_flags ("workarounds", "Workarounds",
                        "Workarounds for external components",
                        PV_TYPE_WORKAROUND_FLAGS, PV_WORKAROUND_FLAGS_NONE,
                        (G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                         G_PARAM_STATIC_STRINGS));

  g_object_class_install_properties (object_class, N_PROPERTIES, properties);
}

PvRuntime *
pv_runtime_new (const char *source,
                const char *variable_dir,
                const char *bubblewrap,
                GArray *architectures,
                GPtrArray *providers,
                const char *home,
                const char * const *original_environ,
                SrtSubprocessRunner *run_in_current_context,
                PvRuntimeFlags flags,
                PvWorkaroundFlags workarounds,
                GError **error)
{
  g_return_val_if_fail (source != NULL, NULL);
  g_return_val_if_fail ((flags & ~(PV_RUNTIME_FLAGS_MASK)) == 0, NULL);

  return g_initable_new (PV_TYPE_RUNTIME,
                         NULL,
                         error,
                         "architectures", architectures,
                         "bubblewrap", bubblewrap,
                         "graphics-providers", providers,
                         "home", home,
                         "original-environ", original_environ,
                         "run-in-current-context", run_in_current_context,
                         "variable-dir", variable_dir,
                         "source", source,
                         "flags", flags,
                         "workarounds", workarounds,
                         NULL);
}

static gchar *
pv_runtime_remap_emulator_exe (PvRuntime *self,
                               FlatpakExports *exports,
                               FlatpakBwrap *bwrap,
                               const char *exe,
                               GError **error)
{
  g_autofree gchar *exe_now = g_canonicalize_filename (exe, NULL);

  if (path_visible_in_provider_namespace (self->flags, exe_now))
    {
      if (self->flags & PV_RUNTIME_FLAGS_FLATPAK_SUBSANDBOX)
        return g_strdup_printf ("/run/parent%s", exe_now);
      else
        return g_strdup_printf ("/run/host%s", exe_now);
    }
  else if ((self->flags & PV_RUNTIME_FLAGS_FLATPAK_SUBSANDBOX)
           || (exports != NULL
               && flatpak_exports_path_is_visible (exports, exe_now)))
    {
      /* It's in $HOME or some similar path, we can use it as-is.
       * For the Flatpak case, we assume that everything visible
       * to the Steam app is equally visible to our sub-sandbox.
       * Otherwise, we can assume that pv_runtime_bind() already exported
       * the emulator if necessary (and possible). */
      return g_strdup (exe_now);
    }
  else
    {
      return glnx_null_throw (error,
                              "Unable to work out how to run %s in container",
                              exe_now);
    }
}

static gboolean
pv_runtime_bind_emulator (PvRuntime *self,
                          FlatpakExports *exports,
                          FlatpakBwrap *bwrap,
                          GError **error)
{
  g_autofree gchar *exe_in_container = NULL;
  g_autofree gchar *main_exe_in_container = NULL;
  const char * const *container_argv;
  const char * const *main_argv;
  const char *paths[3];

  g_return_val_if_fail (SRT_IS_EMULATOR (self->emulator), FALSE);

  container_argv = _srt_emulator_get_container_argv (self->emulator);
  main_argv = _srt_emulator_get_main_argv (self->emulator);
  g_return_val_if_fail (container_argv != NULL, FALSE);
  g_return_val_if_fail (container_argv[0] != NULL, FALSE);
  g_return_val_if_fail (main_argv != NULL, FALSE);
  g_return_val_if_fail (main_argv[0] != NULL, FALSE);

  /* We document that we only export the path of the manifest (paths[0]),
   * but to be nice to developers, also try to export the path to the
   * main executable if different. */
  paths[0] = _srt_emulator_get_manifest (self->emulator);
  paths[1] = container_argv[0];
  paths[2] = main_argv[0];

  for (size_t i = 0; i < G_N_ELEMENTS (paths); i++)
    {
      const char *path = paths[i];
      g_autofree gchar *parent = NULL;

      if (path == NULL)
        continue;

      parent = g_path_get_dirname (path);

      if (path_visible_in_provider_namespace (self->flags, parent))
        {
          g_info ("Emulator path %s is /usr-like, not exporting", parent);
        }
      else if (exports != NULL)
        {
          g_info ("Trying to export %s because it contains an emulator",
                  parent);

          if (!flatpak_exports_add_path_expose (exports,
                                                FLATPAK_FILESYSTEM_MODE_READ_ONLY,
                                                parent,
                                                error))
            return glnx_prefix_error (error, "Unable to export emulator \"%s\"",
                                      parent);
        }
    }

  exe_in_container = pv_runtime_remap_emulator_exe (self, exports, bwrap,
                                                    container_argv[0], error);

  if (exe_in_container == NULL)
    return FALSE;

  main_exe_in_container = pv_runtime_remap_emulator_exe (self, exports, bwrap,
                                                         main_argv[0],
                                                         error);

  if (main_exe_in_container == NULL)
    return FALSE;

  self->emulator_in_container = _srt_emulator_new_for_container (self->emulator,
                                                                 exe_in_container,
                                                                 main_exe_in_container);
  g_return_val_if_fail (SRT_IS_EMULATOR (self->emulator_in_container), FALSE);
  return TRUE;
}

/*
 * This is chosen to be:
 * - somewhere we don't bind-mount from the runtime or host
 *   (/var/pressure-vessel is specifically excluded)
 * - on a tmpfs
 * - in a top-level directory that we carry in the interpreter root, so that
 *   symlinks in the interpreter root can usefully point to it
 * - not in /run, so that we don't get mixed up between
 *   the real root and the interpreter root (we want /run to only
 *   exist in the real root)
 */
#define MUTABLE_LDSO_DIR_NORMAL "/var/pressure-vessel/ldso"
/*
 * Unfortunately we can't currently use that path under Snap, because
 * snapd thinks it knows better than we do what our mount points are.
 * Keep using the old path for now.
 * https://github.com/canonical/steam-snap/issues/356
 */
#define MUTABLE_LDSO_DIR_SNAP "/run/pressure-vessel/ldso"

static void
pv_runtime_adverb_regenerate_ld_so_cache (PvRuntime *self,
                                          FlatpakBwrap *adverb_argv)
{
  g_autoptr(GString) ldlp_after_regen = g_string_new ("");
  g_autofree gchar *regen_dir = NULL;
  SrtEmulator *emulator;

  /* This directory was set up in bind_runtime_ld_so() */
  if (self->is_flatpak_env)
    {
      const gchar *xrd;

      /* As in bind_runtime_ld_so(), we expect Flatpak to provide this
       * in practice, even if the host system does not. */
      xrd = g_environ_getenv (self->original_environ, "XDG_RUNTIME_DIR");
      g_return_if_fail (xrd != NULL);

      regen_dir = g_build_filename (xrd, "pressure-vessel", "ldso", NULL);
    }
  else if (self->workarounds & PV_WORKAROUND_FLAGS_STEAMSNAP_356)
    {
      regen_dir = g_strdup (MUTABLE_LDSO_DIR_SNAP);
    }
  else
    {
      regen_dir = g_strdup (MUTABLE_LDSO_DIR_NORMAL);
    }

  flatpak_bwrap_add_args (adverb_argv,
                          "--regenerate-ld.so-cache", regen_dir,
                          NULL);

  emulator = _srt_subprocess_runner_get_emulator (self->run_in_current_context);

  if (emulator != NULL && self->ldconfig_architecture != NULL)
    flatpak_bwrap_add_args (adverb_argv,
                            "--ldconfig-architecture",
                            self->ldconfig_architecture->multiarch_tuple,
                            NULL);

  /* This logic to build the search path matches
   * pv_runtime_set_search_paths(), except that here, we split them up:
   * the directories containing SONAMEs go in ld.so.conf, and only the
   * directories containing aliases go in LD_LIBRARY_PATH. */
  for (size_t i = 0; i < self->tuples->len; i++)
    {
      GQuark tuple_quark = g_array_index (self->tuples, GQuark, i);
      const char *tuple = g_quark_to_string (tuple_quark);
      g_autofree gchar *ld_path = NULL;
      g_autofree gchar *aliases = NULL;
      gboolean keep_in_ldlp = FALSE;

      ld_path = g_build_filename (self->overrides_in_container, "lib",
                                  tuple, NULL);

      aliases = g_build_filename (self->overrides_in_container, "lib",
                                  tuple, "aliases", NULL);

      flatpak_bwrap_add_args (adverb_argv,
                              "--add-ld.so-path", ld_path,
                              NULL);

      /* If we are not operating from a mutable sysroot, then we do not
       * have the opportunity to delete the runtime's version of overridden
       * libraries, so ldconfig will see both the provider's version and
       * the runtime's version. If the runtime's version has an OS ABI tag
       * and the provider's version does not, then ldconfig will prioritize
       * the runtime's older version. Work around this by adding the
       * provider's version to LD_LIBRARY_PATH *as well as* regenerating
       * the ld.so.cache - this will not work for games that incorrectly
       * reset the LD_LIBRARY_PATH, but is better than nothing! */
      if (self->mutable_sysroot == NULL)
        keep_in_ldlp = TRUE;

      /* Each ldconfig(8) implementation will write its own libraries,
       * and zero or more foreign architectures' libraries, into the
       * ld.so.cache.
       * For example x86_64 ldconfig(8) handles its own libraries,
       * plus i386 and x32 libraries.
       * If it does, we can remove the corresponding directories from the
       * LD_LIBRARY_PATH to get a search order that more closely resembles
       * the "real" host machine.
       * Conversely, if it does not (for example aarch64 libraries when we
       * are running an x86_64 ldconfig(8)), we will have to keep those
       * directories in the LD_LIBRARY_PATH, otherwise the foreign
       * architecture's libraries will not be found. */
      if (!_srt_architecture_ldconfig_knows_architecture (self->ldconfig_architecture,
                                                          tuple))
        keep_in_ldlp = TRUE;

      if (keep_in_ldlp)
        _srt_search_path_append (ldlp_after_regen, ld_path);

      _srt_search_path_append (ldlp_after_regen, aliases);
    }

  flatpak_bwrap_add_args (adverb_argv,
                          "--set-ld-library-path", ldlp_after_regen->str,
                          NULL);
}

/* If we are using a runtime, ensure the locales to be generated,
 * pass the lock fd to the executed process,
 * and make it act as a subreaper for the game itself.
 *
 * If we were using --unshare-pid then we could use bwrap --sync-fd
 * and rely on bubblewrap's init process for this, but we currently
 * can't do that without breaking gameoverlayrender.so's assumptions,
 * and we want -adverb for its locale functionality anyway. */
gboolean
pv_runtime_get_adverb (PvRuntime *self,
                       FlatpakBwrap *bwrap,
                       GError **error)
{
  g_autofree char *ld_library_path = NULL;
  SrtEmulator *emulator_for_adverb;
  GQuark adverb_arch_quark;

  g_return_val_if_fail (PV_IS_RUNTIME (self), FALSE);
  /* This will be true if pv_runtime_bind() was successfully called. */
  g_return_val_if_fail (self->adverb_in_container != NULL, FALSE);
  /* This will be true if pv_runtime_bind() was successfully called. */
  g_return_val_if_fail ((self->emulator != NULL) == (self->emulator_in_container != NULL),
                        FALSE);
  g_return_val_if_fail (bwrap != NULL, FALSE);
  g_return_val_if_fail (flatpak_bwrap_is_empty (bwrap), FALSE);
  g_return_val_if_fail (!pv_bwrap_was_finished (bwrap), FALSE);

  /* This should have been set in pv_runtime_initable_init() */
  g_return_val_if_fail (self->adverb_architecture != NULL, FALSE);
  adverb_arch_quark = g_quark_from_static_string (self->adverb_architecture->multiarch_tuple);

  if (!_srt_subprocess_runner_await_emulator (self->run_in_current_context,
                                              adverb_arch_quark,
                                              &emulator_for_adverb,
                                              NULL,
                                              error))
    return FALSE;

  if (self->workarounds & PV_WORKAROUND_FLAGS_BWRAP_SETUID)
    ld_library_path = pv_runtime_get_ld_library_path (self);

  if (emulator_for_adverb != NULL)
    {
      const char * const *original_argv;
      const char * const *argv;

      /* If emulator_for_adverb is non-null, then we can assume that it is
       * the same emulator as the one we would have previously used to derive
       * emulator_in_container, because we only support one emulator
       * at a time. */
      g_return_val_if_fail (self->emulator_in_container != NULL, FALSE);

      if (ld_library_path != NULL)
        {
          /* See below - same idea, but for the emulator itself */
          g_autoptr(GError) local_error = NULL;
          g_autofree gchar *ld_so = NULL;

          original_argv = _srt_emulator_get_container_argv (emulator_for_adverb);
          g_return_val_if_fail (original_argv != NULL, FALSE);
          ld_so = _srt_elf_path_get_pt_interp (AT_FDCWD,
                                               original_argv[0],
                                               &local_error);

          if (ld_so != NULL)
            {
              g_info ("Running emulator %s via ELF interpreter %s",
                      original_argv[0], ld_so);
              flatpak_bwrap_add_args (bwrap,
                                      ld_so,
                                      "--library-path",
                                      ld_library_path,
                                      NULL);
            }
          else if (g_error_matches (local_error, SRT_LIBRARY_ERROR,
                                    SRT_LIBRARY_ERROR_NO_INTERPRETER))
            {
              g_info ("Assuming emulator %s is statically linked",
                      original_argv[0]);
              g_clear_error (&local_error);
            }
          else
            {
              g_propagate_error (error, g_steal_pointer (&local_error));
              return FALSE;
            }
        }

      /* This only sets the argv, not the environment variables (which are
       * placed in container_env by pv_runtime_bind()). */
      argv = _srt_emulator_get_container_argv (self->emulator_in_container);
      g_return_val_if_fail (argv != NULL, FALSE);
      flatpak_bwrap_append_argsv (bwrap, (char **) argv, -1);
    }

  if (ld_library_path != NULL)
    {
      const char *ld_so = NULL;

      /* We can't rely on LD_LIBRARY_PATH staying in the environment,
       * which means we can't run anything until we have invoked
       * ldconfig to regenerate ld.so.cache, which is a chicken-and-egg
       * problem because pv-adverb needs to load shared libraries.
       * Resolve this by using ld.so(8) to invoke pv-adverb. */
      ld_so = self->adverb_architecture->interoperable_runtime_linker;

      if (ld_so == NULL)
        return glnx_throw (error,
                           "Runtime linker for architecture %s not known",
                           self->adverb_architecture->multiarch_tuple);

      g_debug ("Using runtime linker %s to run pv-adverb", ld_so);
      flatpak_bwrap_add_args (bwrap,
                              ld_so,
                              "--library-path",
                              ld_library_path,
                              NULL);
    }

  flatpak_bwrap_add_arg (bwrap, self->adverb_in_container);
  flatpak_bwrap_add_arg_printf (bwrap, "--prefix=%s",
                                self->pv_prefix_in_container);

  /* We need to tell the adverb how it can run the emulator for its
   * subprocesses, notably ldconfig. */
  if (self->emulator_in_container != NULL)
    {
      g_autofree char *dest = NULL;

      dest = g_strdup_printf ("%s/emulator.json", self->overrides);

      if (!_srt_emulator_write_manifest (self->emulator_in_container, dest, error))
        return FALSE;

      flatpak_bwrap_add_arg_printf (bwrap,
                                    "--emulator=%s/emulator.json",
                                    self->overrides_in_container);
    }

  if (self->flags & PV_RUNTIME_FLAGS_GENERATE_LOCALES)
    flatpak_bwrap_add_args (bwrap, "--generate-locales", NULL);

  if (srt_file_lock_is_ofd (self->runtime_lock))
    {
      int fd = srt_file_lock_steal_fd (self->runtime_lock);
      g_autofree gchar *fd_str = NULL;

      g_debug ("Passing lock fd %d down to adverb", fd);
      flatpak_bwrap_add_fd (bwrap, fd);
      fd_str = g_strdup_printf ("%d", fd);
      flatpak_bwrap_add_args (bwrap,
                              "--fd", fd_str,
                              NULL);
    }
  else
    {
      /*
       * We were unable to take out an open file descriptor lock,
       * so it will be released on fork(). Tell the adverb process
       * to take out its own compatible lock instead. There will be
       * a short window during which we have lost our lock but the
       * adverb process has not taken its lock - that's unavoidable
       * if we want to use exec() to replace ourselves with the
       * container.
       *
       * pv_bwrap_bind_usr() arranges for /.ref to either be a
       * symbolic link to /usr/.ref which is the runtime_lock
       * (if opt_runtime is a merged /usr), or the runtime_lock
       * itself (otherwise).
       */
      g_debug ("Telling process in container to lock /.ref");
      flatpak_bwrap_add_args (bwrap,
                              "--lock-file", "/.ref",
                              NULL);
    }

  pv_runtime_adverb_regenerate_ld_so_cache (self, bwrap);

  if (self->any_vdpau_drivers)
    flatpak_bwrap_add_args (bwrap,
                            "--overrides-path", self->overrides_in_container,
                            NULL);

  return TRUE;
}

/*
 * Set self->container_access_adverb to a (possibly empty) command prefix
 * that will result in the container being available at
 * self->container_access, with write access to self->overrides, and
 * read-only access to everything else.
 */
static gboolean
pv_runtime_provide_container_access (PvRuntime *self,
                                     GError **error)
{
  if (self->container_access_adverb != NULL)
    return TRUE;

  if (!self->runtime_is_just_usr)
    {
      static const char * const need_top_level[] =
      {
        "bin",
        "etc",
        "lib",
        "sbin",
      };

      /* If we are working with a runtime that has a root directory containing
       * /etc and /usr, we can just access it via its path - that's "the same
       * shape" that the final system is going to be.
       *
       * In particular, if we are working with a writeable copy of a runtime
       * that we are editing in-place, it's always like that. */
      g_info ("%s: Setting up runtime without using bwrap",
              G_STRFUNC);
      self->container_access_adverb = flatpak_bwrap_new (NULL);
      self->container_access = g_strdup (self->runtime_files);

      /* This is going to go poorly for us if the runtime is not complete.
       * !self->runtime_is_just_usr means we know it has a /usr subdirectory,
       * but that doesn't guarantee that it has /bin, /lib, /sbin (either
       * in the form of real directories or symlinks into /usr) and /etc
       * (for at least /etc/alternatives and /etc/ld.so.cache).
       *
       * This check is not intended to be exhaustive, merely something
       * that will catch obvious mistakes like completely forgetting to
       * add the merged-/usr symlinks.
       *
       * In practice we also need /lib64 for 64-bit-capable runtimes,
       * but a pure 32-bit runtime would legitimately not have that,
       * so we don't check for it. */
      for (size_t i = 0; i < G_N_ELEMENTS (need_top_level); i++)
        {
          g_autofree gchar *path = g_build_filename (self->runtime_files,
                                                     need_top_level[i],
                                                     NULL);

          if (!g_file_test (path, G_FILE_TEST_IS_DIR))
            g_warning ("%s does not exist, this probably won't work",
                       path);
        }
    }
  else
    {
      g_autofree gchar *etc = NULL;
      g_autofree gchar *etc_dest = NULL;

      /* If we're in FEX-Emu or similar, then we require a mutable sysroot,
       * but a mutable sysroot is never just /usr. */
      g_return_val_if_fail (!(self->flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT), FALSE);

      if (self->bubblewrap == NULL)
        return glnx_throw (error,
                           "Cannot run bubblewrap to set up runtime");

      /* Otherwise, will we need to use bwrap to build a directory hierarchy
       * that is the same shape as the final system. */
      g_info ("%s: Using bwrap to set up runtime that is just /usr",
              G_STRFUNC);

      /* By design, writeable copies of the runtime never need this:
       * the writeable copy is a complete sysroot, not just a merged /usr. */
      g_assert (self->mutable_sysroot == NULL);
      g_assert (self->tmpdir != NULL);

      self->container_access = g_build_filename (self->tmpdir, "mnt", NULL);
      g_mkdir (self->container_access, 0700);

      self->container_access_adverb = flatpak_bwrap_new (NULL);
      /* Intentionally not using pv_runtime_bind_into_container for this
       * temporary adverb command; by the time we get here, we know we
       * are not using an interpreter root anyway */
      flatpak_bwrap_add_args (self->container_access_adverb,
                              self->bubblewrap,
                              "--ro-bind", "/", "/",
                              "--bind", self->overrides, self->overrides,
                              "--tmpfs", self->container_access,
                              NULL);

      if (!pv_bwrap_bind_usr (self->container_access_adverb,
                              self->runtime_files_on_host,
                              self->runtime_files_fd,
                              self->container_access,
                              error))
        return FALSE;

      /* For simplicity we bind all of /etc here */
      etc = g_build_filename (self->runtime_files_on_host,
                              "etc", NULL);
      etc_dest = g_build_filename (self->container_access,
                                   "etc", NULL);
      /* OK to use --ro-bind directly, as above */
      flatpak_bwrap_add_args (self->container_access_adverb,
                              "--ro-bind", etc, etc_dest,
                              NULL);
    }

  return TRUE;
}

static FlatpakBwrap *
pv_runtime_get_capsule_capture_libs (PvRuntime *self,
                                     RuntimeArchitecture *arch,
                                     GError **error)
{
  SrtEmulator *emulator = NULL;
  const gchar *ld_library_path;
  g_autofree gchar *remap_app = NULL;
  g_autofree gchar *remap_usr = NULL;
  g_autofree gchar *remap_lib = NULL;
  g_autoptr(FlatpakBwrap) ret = NULL;
  glnx_autofd int runtime_files_fd = -1;
  const char * const *fallbacks;

  g_return_val_if_fail (arch->provider != NULL, NULL);
  g_return_val_if_fail (error == NULL || *error == NULL, NULL);

  ret = pv_bwrap_copy (self->container_access_adverb);

  /* If we have a custom "LD_LIBRARY_PATH", we want to preserve
   * it when calling capsule-capture-libs.
   * (Keep this in sync with runtime_architecture_maybe_prefix_ld_so()) */
  ld_library_path = g_environ_getenv (self->original_environ, "LD_LIBRARY_PATH");
  if (ld_library_path != NULL)
    flatpak_bwrap_set_env (ret, "LD_LIBRARY_PATH", ld_library_path, TRUE);

  /* Every symlink that starts with exactly /app/ (for Flatpak) */
  remap_app = g_strjoin (NULL, "/app/", "=",
                         arch->provider->path_in_container_ns,
                         "/app/", NULL);

  /* Every symlink that starts with exactly /usr/ */
  remap_usr = g_strjoin (NULL, "/usr/", "=",
                         arch->provider->path_in_container_ns,
                         "/usr/", NULL);

  /* Every symlink that starts with /lib, e.g. /lib64 */
  remap_lib = g_strjoin (NULL, "/lib", "=",
                         arch->provider->path_in_container_ns,
                         "/lib", NULL);

  runtime_files_fd = dup (self->runtime_files_fd);

  if (runtime_files_fd < 0)
    return glnx_null_throw_errno_prefix (error,
                                         "Unable to duplicate file "
                                         "descriptor %d for runtime "
                                         "files \"%s\"",
                                         self->runtime_files_fd,
                                         self->runtime_files);

  /* self->container_access_adverb might involve a srt-bwrap or system bwrap
   * invocation, assumed to be of our own architecture rather than @arch,
   * so we can't just ask the SrtSubprocessRunner to prepend the emulator
   * to the argv. Instead we need to insert the emulator into the middle
   * of the argv, after srt-bwrap or system bwrap, but before the
   * ${arch}-capsule-capture-libs command. */
  if (!_srt_subprocess_runner_await_emulator (self->run_in_current_context,
                                              arch->tuple_quark,
                                              &emulator,
                                              NULL,
                                              error))
    return FALSE;

  if (emulator != NULL)
    {
      const char * const *emulator_argv = _srt_emulator_get_argv (emulator);
      const SrtEnvOverlay *emulator_env = _srt_emulator_get_environment (emulator);

      flatpak_bwrap_append_argsv (ret, (char **) emulator_argv, -1);
      ret->envp = _srt_env_overlay_apply (emulator_env, ret->envp);
    }

  for (size_t i = 0; i < arch->capsule_capture_libs->len; i++)
    flatpak_bwrap_add_arg (ret, g_ptr_array_index (arch->capsule_capture_libs, i));

  if (_srt_util_get_log_flags () & SRT_LOG_FLAGS_LEVEL)
    flatpak_bwrap_add_arg (ret, "--level-prefix");

  fallbacks =
    _srt_graphics_provider_architecture_get_fallback_library_paths (
        arch->provider_arch_details);

  if (fallbacks != NULL)
    {
      flatpak_bwrap_add_arg (ret, "--fallback-paths");
      flatpak_bwrap_take_arg (ret, g_strjoinv (":", (char **) fallbacks));
    }

  flatpak_bwrap_add_args (ret,
                          "--remap-link-prefix", remap_app,
                          "--remap-link-prefix", remap_usr,
                          "--remap-link-prefix", remap_lib,
                          "--provider", arch->provider->in_current_ns->path,
                          "--container",
                          NULL);

  if (g_str_equal (self->runtime_files, self->container_access))
    flatpak_bwrap_add_arg_printf (ret, "/proc/self/fd/%d",
                                  runtime_files_fd);
  else
    flatpak_bwrap_add_arg (ret, self->container_access);

  if (self->libcapsule_knowledge)
    {
      flatpak_bwrap_add_arg (ret, "--library-knowledge");
      flatpak_bwrap_add_arg_printf (ret, "/proc/self/fd/%d/%s",
                                    runtime_files_fd,
                                    self->libcapsule_knowledge);
    }

  flatpak_bwrap_add_fd (ret, g_steal_fd (&runtime_files_fd));
  return g_steal_pointer (&ret);
}

static gboolean pv_runtime_capture_libraries (PvRuntime *self,
                                              RuntimeArchitecture *arch,
                                              const char *destination,
                                              const char *profiling_message,
                                              const char * const *patterns,
                                              gsize n_patterns,
                                              GError **error);

static gboolean
collect_s2tc (PvRuntime *self,
              RuntimeArchitecture *arch,
              const char *libdir,
              GError **error)
{
  g_autofree gchar *s2tc = g_build_filename (libdir, "libtxc_dxtn.so", NULL);
  g_autofree gchar *s2tc_in_current_namespace = NULL;

  g_return_val_if_fail (arch->provider != NULL, FALSE);

  s2tc_in_current_namespace = g_build_filename (arch->provider->in_current_ns->path,
                                                s2tc, NULL);

  if (g_file_test (s2tc_in_current_namespace, G_FILE_TEST_EXISTS))
    {
      g_autofree gchar *expr = NULL;

      g_debug ("Collecting s2tc \"%s\" and its dependencies...", s2tc);
      expr = g_strdup_printf ("path-match:%s", s2tc);

      if (!pv_runtime_capture_libraries (self, arch,
                                         arch->libdir_relative_to_overrides,
                                         expr,
                                         (const char * const *) &expr, 1, error))
        return FALSE;
    }

  return TRUE;
}

/*
 * pv_runtime_capture_libraries:
 * @self: (not nullable): The runtime
 * @arch: (not nullable): An architecture
 * @destination: (not nullable): Where to capture the libraries,
 *  either as an absolute path or relative to `/overrides`
 * @profiling_message: (nullable): Description of this operation, for
 *  profiling. If %NULL, the profiling timer is not used.
 * @patterns: (not nullable) (array length=n_patterns): Patterns for capsule-capture-libs
 * @n_patterns: Number of patterns in @patterns, which must be greater than 0
 * @error: Used to return an error on failure
 *
 * Use capsule-capture-libs to capture libraries for architecture @arch
 * matching @patterns, creating symlinks in @destination.
 *
 * Returns: %TRUE on success
 */
static gboolean
pv_runtime_capture_libraries (PvRuntime *self,
                              RuntimeArchitecture *arch,
                              const gchar *destination,
                              const char *profiling_message,
                              const char * const *patterns,
                              gsize n_patterns,
                              GError **error)
{
  g_autoptr(FlatpakBwrap) temp_bwrap = NULL;
  G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) timer = NULL;

  g_return_val_if_fail (runtime_architecture_check_valid (arch), FALSE);
  g_return_val_if_fail (destination != NULL, FALSE);
  g_return_val_if_fail (n_patterns > 0, FALSE);
  g_return_val_if_fail (patterns != NULL, FALSE);

  if (profiling_message != NULL)
    timer = _srt_profiling_start ("%s", profiling_message);

  if (!pv_runtime_provide_container_access (self, error))
    return FALSE;

  temp_bwrap = pv_runtime_get_capsule_capture_libs (self, arch, error);

  if (temp_bwrap == NULL)
    return FALSE;

  flatpak_bwrap_add_arg (temp_bwrap, "--dest");

  if (g_path_is_absolute (destination))
    {
      flatpak_bwrap_add_arg (temp_bwrap, destination);
    }
  else
    {
      int fd = dup (self->overrides_fd);

      if (fd < 0)
        return glnx_throw_errno_prefix (error,
                                        "Unable to duplicate file descriptor "
                                        "%d for overrides \"%s\"",
                                        fd, self->overrides);

      flatpak_bwrap_add_arg_printf (temp_bwrap, "/proc/self/fd/%d/%s",
                                    fd, destination);
      flatpak_bwrap_add_fd (temp_bwrap, g_steal_fd (&fd));
    }

  for (size_t i = 0; i < n_patterns; i++)
    flatpak_bwrap_add_arg (temp_bwrap, patterns[i]);

  flatpak_bwrap_finish (temp_bwrap);

  if (!pv_bwrap_run_sync (temp_bwrap, self->run_in_current_context, NULL, error))
    return FALSE;

  return TRUE;
}

/*
 * @requested_subdir: (not nullable):
 * @details_arr: (array length=n_details):
 * @n_details: Number of entries in @details_arr
 * @use_numbered_subdirs: (inout) (not optional): if %TRUE, use a
 *  numbered subdirectory per ICD, for the rare case where not all
 *  drivers have a unique basename or where order matters
 * @libdir_patterns: (inout) (not nullable): array of patterns for
 *  capsule-capture-libs whose destination will be `${libdir}`
 * @search_path: (nullable): Add the parent directory of the resulting
 *  ICD to this search path if necessary
 *
 * For each driver in @details_arr that is an absolute path, put a symlink
 * in `${libdir}/${requested_subdir}` or `${libdir}/${requested_subdir}/${n}`.
 * Also add a pattern to @libdir_patterns that will capture
 * its dependencies into `${libdir}`.
 *
 * For each driver in @details_arr that is a SONAME, instead add a pattern
 * to @libdir_patterns that will capture the driver and its dependencies
 * into `${libdir}`.
 *
 * If the module is %ICD_KIND_ABSOLUTE or %ICD_KIND_SONAME, change its
 * `details->archs[x].path_in_container`
 * from %NULL to a non-%NULL path. Otherwise leave it %NULL.
 */
static gboolean
bind_icds (PvRuntime *self,
           RuntimeArchitecture *arch,
           const char *subdir,
           IcdDetails **details_arr,
           gsize n_details,
           gboolean *use_numbered_subdirs,
           GPtrArray *libdir_patterns,
           GString *search_path,
           GError **error)
{
  static const char options[] = "if-exists:if-same-abi";
  g_autoptr(GHashTable) basename_set = NULL;
  /* If details_arr[i]->archs[x].kind is ICD_KIND_ABSOLUTE,
   * then basenames[i] is the basename of the file; otherwise %NULL. */
  g_autofree const char **basenames = NULL;
  /* If details_arr[i] will not be passed to capsule-capture-libs because
   * it represents an ICD_KIND_ABSOLUTE driver that is a hard link or
   * symlink to a driver that was already seen at position j < i,
   * then captured_instead[i] == j.
   * Otherwise captured_instead[i] = G_MAXSIZE. */
  g_autofree gsize *captured_instead = NULL;
  g_autofree gchar *subdir_relative_to_overrides = NULL;
  glnx_autofd int subdir_fd = -1;
  int digits = pv_count_decimal_digits (n_details);

  g_return_val_if_fail (runtime_architecture_check_valid (arch), FALSE);
  g_return_val_if_fail (subdir != NULL, FALSE);
  g_return_val_if_fail (n_details == 0 || details_arr != NULL, FALSE);
  g_return_val_if_fail (use_numbered_subdirs != NULL, FALSE);
  g_return_val_if_fail (libdir_patterns != NULL, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  /* Iterate through the drivers adding the SONAMEs to @patterns. */
  for (size_t i = 0; i < n_details; i++)
    {
      IcdDetails *details = details_arr[i];
      PvModulePerArch *details_arch;

      if (!details->has_library)
        continue;

      details_arch = icd_details_get_architecture (details, arch->tuple_quark);

      if (details_arch == NULL)
        continue;

      g_return_val_if_fail (details_arch->path_in_container == NULL, FALSE);

      g_debug ("Capturing %s loadable module #%" G_GSIZE_FORMAT ": %s",
               subdir, i, details->debug_name);

      if (details_arch->kind == ICD_KIND_SONAME)
        {
          g_autofree gchar *pattern = NULL;

          pattern = g_strdup_printf ("even-if-older:%s:soname:%s",
                                     options,
                                     details_arch->resolved_library);
          g_ptr_array_add (libdir_patterns, g_steal_pointer (&pattern));

          /* Even though we have not actually run capsule-capture-libs yet,
           * we can predict where it's going to end up:
           * it will be ${overrides}/lib/${arch}/${SONAME}. */
          details_arch->path_in_container = g_build_filename (arch->libdir_in_container,
                                                              details_arch->resolved_library,
                                                              NULL);
          continue;
        }

      g_assert (details_arch->kind == ICD_KIND_ABSOLUTE);

      /* We set subdir_relative_to_overrides non-NULL if and only if at least
       * one driver is ICD_KIND_ABSOLUTE */
      if (subdir_relative_to_overrides == NULL)
        subdir_relative_to_overrides = g_build_filename (arch->libdir_relative_to_overrides,
                                                         subdir, NULL);
    }

  /* If no driver was ICD_KIND_ABSOLUTE, then there is nothing more to do */
  if (subdir_relative_to_overrides == NULL)
    goto success;

  if (!glnx_shutil_mkdir_p_at_open (self->overrides_fd,
                                    subdir_relative_to_overrides, 0700,
                                    &subdir_fd, NULL, error))
    {
      g_prefix_error (error, "Unable to create and open \"%s/%s/\": ",
                      self->overrides, subdir_relative_to_overrides);
      return FALSE;
    }

  /* Decide whether we need to use numbered subdirectories.
   * If there are file collisions, then the answer is yes we do:
   * .../glvnd/0/libEGL_example.so -> /usr/.../libEGL_example.so,
   * .../glvnd/1/libEGL_example.so -> /opt/.../libEGL_example.so,
   * and so on. If not (common case), we can use a single directory:
   * .../glvnd/libEGL_one.so -> /usr/.../libEGL_one.so,
   * .../glvnd/libEGL_two.so -> /opt/.../libEGL_two.so,
   * and so on. */
  basename_set = g_hash_table_new_full (g_str_hash, g_str_equal, NULL, NULL);
  basenames = g_new0 (const char *, n_details);

  for (size_t i = 0; i < n_details && !*use_numbered_subdirs; i++)
    {
      IcdDetails *details = details_arr[i];
      const PvModulePerArch *details_arch;
      const char *base;

      details_arch = icd_details_get_architecture (details, arch->tuple_quark);

      if (details_arch == NULL
          || details_arch->kind != ICD_KIND_ABSOLUTE)
        continue;

      base = glnx_basename (details_arch->resolved_library);
      basenames[i] = base;

      if (g_hash_table_contains (basename_set, base))
        {
          /* The ICD is (at least potentially) going to collide with
           * another from this batch */
          *use_numbered_subdirs = TRUE;
        }
      else
        {
          g_autofree gchar *path = g_build_filename (subdir_relative_to_overrides,
                                                     base, NULL);
          struct stat stat_buf;

          g_hash_table_add (basename_set, (char *) base);

          /* The ICD would collide with one that we already set up */
          if (fstatat (self->overrides_fd, path, &stat_buf, AT_SYMLINK_NOFOLLOW) == 0
              && S_ISLNK (stat_buf.st_mode))
            *use_numbered_subdirs = TRUE;
        }
    }

  /* If we've decided there are no collisions, then we can process all
   * drivers as a single batch, because they're all going to the same
   * place. */
  if (!*use_numbered_subdirs)
    {
      g_autoptr(GPtrArray) patterns = g_ptr_array_new_full (n_details, g_free);
      /* (element-type (struct stat) gsize)
       * Key: Identity of a file
       * Value: Index of first ICD_KIND_ABSOLUTE in details_arr[] and
       *  basenames[] that is a symlink or hard link to that file */
      g_autoptr(GHashTable) unique_drivers = NULL;

      unique_drivers = g_hash_table_new_full (_srt_struct_stat_devino_hash,
                                              _srt_struct_stat_devino_equal,
                                              g_free,
                                              NULL);
      captured_instead = g_new (gsize, n_details);

      for (size_t i = 0; i < n_details; i++)
        captured_instead[i] = G_MAXSIZE;

      for (size_t i = 0; i < n_details; i++)
        {
          IcdDetails *details = details_arr[i];
          const PvModulePerArch *details_arch;
          g_autofree gchar *pattern = NULL;
          struct stat stat_buf;
          glnx_autofd int fd = -1;

          details_arch = icd_details_get_architecture (details, arch->tuple_quark);

          if (details_arch == NULL
              || details_arch->kind != ICD_KIND_ABSOLUTE)
            continue;

          fd = _srt_sysroot_open (arch->provider->in_current_ns,
                                  details_arch->resolved_library,
                                  SRT_RESOLVE_FLAGS_NONE,
                                  NULL, NULL);

          if (fd >= 0 && fstat (fd, &stat_buf) == 0)
            {
              gpointer value;

              if (g_hash_table_lookup_extended (unique_drivers, &stat_buf,
                                                NULL, &value))
                {
                  gsize other = GPOINTER_TO_SIZE (value);

                  /* @details points to a different name (hard link or
                   * symlink) for the same file as @driver, so we can
                   * capture it just once (with the name driver->captured_as),
                   * and then duplicate that symlink for the other items
                   * of driver->other_names. */
                  g_assert (other < i);
                  captured_instead[i] = other;
                  continue;
                }

              g_hash_table_replace (unique_drivers,
                                    g_memdup2 (&stat_buf, sizeof (struct stat)),
                                    GSIZE_TO_POINTER (i));
            }
          else
            {
              g_warning ("Unable to look up resolved path \"%s\" in provider",
                         details_arch->resolved_library);
            }

          pattern = g_strdup_printf ("no-dependencies:even-if-older:%s:path:%s",
                                     options,
                                     details_arch->resolved_library);
          g_ptr_array_add (patterns, g_steal_pointer (&pattern));
        }

      if (patterns->len > 0
          && !pv_runtime_capture_libraries (self, arch,
                                            subdir_relative_to_overrides,
                                            subdir_relative_to_overrides,
                                            (const char * const *) patterns->pdata,
                                            patterns->len, error))
        return FALSE;
    }

  /* Finish the per-driver processing. If we're using numbered
   * subdirectories, this includes the actual captures; if not, this
   * is just cleanup. */
  for (size_t i = 0; i < n_details; i++)
    {
      IcdDetails *details = details_arr[i];
      PvModulePerArch *details_arch;
      g_autofree gchar *numbered_subdir = NULL;
      g_autofree gchar *dependency_pattern = NULL;
      g_autofree gchar *seq_str = NULL;
      g_autofree gchar *target = NULL;
      glnx_autofd int numbered_subdir_fd = -1;
      const char *dest_relative_to_overrides = NULL;
      const char *base;
      int dest_fd;
      struct stat stat_buf;

      details_arch = icd_details_get_architecture (details, arch->tuple_quark);

      if (details_arch == NULL
          || details_arch->kind != ICD_KIND_ABSOLUTE)
        continue;

      base = basenames[i];

      if (base == NULL)
        {
          base = glnx_basename (details_arch->resolved_library);
          basenames[i] = base;
        }

      if (captured_instead != NULL)
        {
          gsize other = captured_instead[i];

          /* We only do this if all the basenames are unique, and therefore
           * we are not using numbered subdirectories */
          g_assert (!*use_numbered_subdirs);

          /* If icd_details[i] is a hard link or symlink to the same
           * ICD_KIND_ABSOLUTE file as icd_details[other], then we can
           * treat it as equivalent. We don't need to run capsule-capture-libs
           * again, because it would create a symlink for icd_details[i]
           * if and only if it would have done so for icd_details[other]. */
          if (other != G_MAXSIZE)
            {
              g_assert (other < i);
              g_assert (basenames[other] != NULL);
              g_debug ("\"%s\" is the same driver as \"%s\"",
                       base, basenames[other]);
              target = glnx_readlinkat_malloc (subdir_fd,
                                               basenames[other],
                                               NULL, NULL);

              if (target == NULL)
                {
                  g_debug ("\"%s\" was not created: not creating \"%s\" either",
                           basenames[other], base);
                  details_arch->kind = ICD_KIND_NONEXISTENT;
                }
              else
                {
                  g_debug ("\"%s\" was created: making \"%s\" equivalent",
                           basenames[other], base);

                  if (!pv_runtime_symlinkat (target, subdir_fd, base, error))
                    return FALSE;
                }

              /* We don't need to capture the dependencies of icd_details[i],
               * because we are already going to capture the dependencies of
               * icd_details[other], and they are the same file */
              details_arch->path_in_container = g_steal_pointer (&target);
              continue;
            }
        }

      /* If we can't avoid the numbered subdirectory, or want to use one
       * to force a specific load order, create it. */
      if (*use_numbered_subdirs && subdir[0] != '\0')
        {
          g_autofree gchar *pattern = NULL;

          seq_str = g_strdup_printf ("%.*" G_GSIZE_FORMAT, digits, i);
          numbered_subdir = g_build_filename (subdir_relative_to_overrides,
                                              seq_str, NULL);

          if (!glnx_ensure_dir (subdir_fd, seq_str, 0700, error))
            {
              g_prefix_error (error, "Unable to create \"%s\": ",
                              numbered_subdir);
              return FALSE;
            }

          if (!glnx_opendirat (subdir_fd, seq_str, TRUE,
                               &numbered_subdir_fd, error))
            return FALSE;

          dest_relative_to_overrides = numbered_subdir;
          dest_fd = numbered_subdir_fd;
          pattern = g_strdup_printf ("no-dependencies:even-if-older:%s:path:%s",
                                     options,
                                     details_arch->resolved_library);

          if (!pv_runtime_capture_libraries (self, arch,
                                             dest_relative_to_overrides,
                                             pattern,
                                             (const char * const *) &pattern, 1, error))
            return FALSE;
        }
      else
        {
          dest_relative_to_overrides = subdir_relative_to_overrides;
          dest_fd = subdir_fd;
        }

      if (fstatat (dest_fd, base, &stat_buf, AT_SYMLINK_NOFOLLOW) < 0)
        {
          g_debug ("\"overrides/%s/%s\" was not created: %s",
                   dest_relative_to_overrides, base, g_strerror (errno));

          /* capsule-capture-libs didn't actually create the symlink,
           * which means the ICD is nonexistent or the wrong architecture.
           * We don't need to capture the dependencies in this case. */
          details_arch->kind = ICD_KIND_NONEXISTENT;
          /* If the directory is empty we can also remove it.
           * This is opportunistic, so ignore ENOTEMPTY. */
          if (numbered_subdir != NULL)
            g_rmdir (numbered_subdir);

          continue;
        }
      else
        {
          g_autoptr(GError) local_error = NULL;

          g_assert (target == NULL);
          target = glnx_readlinkat_malloc (dest_fd, base, NULL, &local_error);

          /* This is unexpected! capsule-capture-libs creates symlinks,
           * not any other sort of file, and their target should be
           * an absolute path. */
          if (target == NULL)
            g_warning ("Cannot read target of \"%s/%s/%s\": %s",
                       self->overrides, dest_relative_to_overrides, base,
                       local_error->message);
          else if (target[0] != '/')
            g_warning ("Target of \"%s/%s/%s\" is relative: \"%s\"",
                       self->overrides, dest_relative_to_overrides, base,
                       target);
        }

      /* Only add the numbered subdirectories to the search path. Their
       * parent is expected to be there already. */
      if (search_path != NULL && seq_str != NULL)
        {
          g_autofree gchar *in_container = NULL;

          in_container = g_build_filename (arch->libdir_in_container,
                                           subdir, seq_str, NULL);
          _srt_search_path_append (search_path, in_container);
        }

      dependency_pattern = g_strdup_printf ("only-dependencies:%s:path:%s",
                                            options,
                                            details_arch->resolved_library);
      g_ptr_array_add (libdir_patterns, g_steal_pointer (&dependency_pattern));

      if (G_LIKELY (target != NULL && target[0] == '/'))
        details_arch->path_in_container = g_steal_pointer (&target);
      else
        details_arch->path_in_container = g_build_filename (arch->libdir_in_container,
                                                            subdir,
                                                            seq_str ? seq_str : "",
                                                            base,
                                                                         NULL);
    }

success:
  for (size_t i = 0; i < n_details; i++)
    {
      IcdDetails *details = details_arr[i];
      const PvModulePerArch *details_arch;

      details_arch = icd_details_get_architecture (details, arch->tuple_quark);

      if (details_arch == NULL)
        continue;

      g_info ("Captured %s loadable module #%" G_GSIZE_FORMAT ": %s",
              subdir, i, details->debug_name);

      switch (details_arch->kind)
        {
          case ICD_KIND_ABSOLUTE:
          case ICD_KIND_SONAME:
            g_warn_if_fail (details_arch->resolved_library != NULL);
            g_info ("Path in container: %s", details_arch->path_in_container);
            g_warn_if_fail (details_arch->path_in_container != NULL);
            break;

          case ICD_KIND_META_LAYER:
            g_warn_if_fail (details_arch->path_in_container == NULL);
            break;

          case ICD_KIND_NONEXISTENT:
          case ICD_KIND_IGNORED:
          case ICD_KIND_UNDECIDED:
          default:
            g_warn_if_reached ();
        }
    }

  return TRUE;
}

static gboolean
bind_gfx_provider (PvGraphicsProvider *provider,
                   FlatpakBwrap *bwrap,
                   const char *prepend_path,
                   GError **error)
{
  g_autofree gchar *provider_etc = NULL;
  g_autofree gchar *mount_point = NULL;

  mount_point = g_build_filename (prepend_path,
                                  provider->path_in_container_ns,
                                  NULL);

  if (!pv_bwrap_bind_usr (bwrap,
                          provider->path_in_host_ns,
                          provider->in_current_ns->fd,
                          mount_point,
                          error))
    return FALSE;

  provider_etc = g_build_filename (provider->in_current_ns->path,
                                   "etc", NULL);

  if (g_file_test (provider_etc, G_FILE_TEST_IS_DIR))
    {
      g_autofree gchar *in_host = NULL;
      g_autofree gchar *in_container = NULL;

      in_host = g_build_filename (provider->path_in_host_ns,
                                  "etc", NULL);
      in_container = g_build_filename (mount_point, "etc", NULL);
      /* The caller is expected to handle possible use of an interpreter root
       * via prepend_path, so only act on the real root */
      flatpak_bwrap_add_args (bwrap,
                              "--ro-bind", in_host, in_container,
                              NULL);
    }

  return TRUE;
}

static FlatpakBwrap *
pv_runtime_import_ca_certs (PvRuntime *self,
                            GError **error)
{
  static const char ca_path[] = "/etc/ssl/certs";
  static const char * const required_names[] =
  {
    /* /etc/ssl/certs/ca-certificates.crt is assumed to be an
     * OpenSSL-compatible CAfile (concatenation of all trusted root certs),
     * also used by other TLS libraries like GNUTLS */
    "ca-certificates.crt",
    /* /etc/ssl/certs/ is assumed to be an OpenSSL-compatible CApath
     * (one file per trusted root cert with names based on a truncated
     * hash), mainly only used by OpenSSL. This is the hash for
     * "ISRG Root X1", the root CA behind Let's Encrypt, which happens
     * to be the CA used to sign repo.steampowered.com at the time
     * of writing... */
    "4042bcee.0",
    /* ... and this is the hash for "DigiCert High Assurance EV Root CA"
     * which happens to be the CA used to sign store.steampowered.com.
     * If both are present, then we assume all the other common CAs
     * are too. */
    "244b5494.0",
    /* Get these hashes from:
     * openssl x509 -noout -subject_hash -in /path/to/cert.crt */
  };
  gboolean found[G_N_ELEMENTS (required_names)] = { FALSE };
  g_autoptr(FlatpakBwrap) bwrap = flatpak_bwrap_new (flatpak_bwrap_empty_env);
  g_auto(SrtDirIter) iter = SRT_DIR_ITER_CLEARED;
  glnx_autofd int dirfd = -1;
  struct dirent *dent;

  flatpak_bwrap_add_args (bwrap,
                          "--tmpfs", ca_path,
                          NULL);

  /* This is a developer-facing rather than end-user-facing flag, so
   * for simplicity this assumes that the runtime is Debian-based, and
   * that the host OS has also been set up to be compatible with
   * Debian's layout for CA certificates (like Arch is). */
  dirfd = _srt_sysroot_open (self->host_root,
                             ca_path,
                             (SRT_RESOLVE_FLAGS_MUST_BE_DIRECTORY
                              | SRT_RESOLVE_FLAGS_READABLE),
                             NULL,
                             error);

  if (dirfd < 0)
    return NULL;

  /* Check that we have a minimal Debian-compatible layout. If we don't,
   * we'll just fail and the caller will have to deal with that. */

  if (!_srt_dir_iter_init_take_fd (&iter, &dirfd,
                                   SRT_DIR_ITER_FLAGS_NONE,
                                   self->arbitrary_dirent_order,
                                   error))
    return NULL;

  while (_srt_dir_iter_next_dent (&iter, &dent, NULL, NULL) && dent != NULL)
    {
      const char *member = dent->d_name;

      if (g_str_equal (member, "ca-certificates.crt")
          || g_str_has_suffix (member, ".0"))
        {
          g_autoptr(GError) local_error = NULL;
          g_autofree gchar *logical_path = NULL;
          g_autofree gchar *resolved = NULL;
          glnx_autofd int fd = -1;

          logical_path = g_build_filename (ca_path, member, NULL);
          fd = _srt_sysroot_open (self->host_root,
                                  logical_path,
                                  (SRT_RESOLVE_FLAGS_READABLE
                                   | SRT_RESOLVE_FLAGS_MUST_BE_REGULAR
                                   | SRT_RESOLVE_FLAGS_RETURN_ABSOLUTE),
                                  &resolved,
                                  &local_error);

          if (fd < 0)
            {
              g_warning ("%s", local_error->message);
              continue;
            }

          if (!pv_runtime_bind_into_container (self, bwrap,
                                               resolved, NULL, 0,
                                               logical_path,
                                               PV_RUNTIME_EMULATION_ROOTS_BOTH,
                                               error))
            return NULL;

          for (size_t i = 0; i < G_N_ELEMENTS (required_names); i++)
            {
              if (g_str_equal (member, required_names[i]))
                found[i] = TRUE;
            }
        }
    }

  for (size_t i = 0; i < G_N_ELEMENTS (required_names); i++)
    {
      if (!found[i])
        return glnx_null_throw (error, "Required filename %s/%s not found",
                                ca_path, required_names[i]);
    }

  return g_steal_pointer (&bwrap);
}

static gboolean
bind_runtime_base (PvRuntime *self,
                   FlatpakExports *exports,
                   FlatpakBwrap *bwrap,
                   SrtEnvOverlay *container_env,
                   GError **error)
{
  static const char * const bind_mutable[] =
  {
    "etc",
    "var/cache",
    "var/lib"
  };
  static const char * const dont_bind[] =
  {
    "/etc/asound.conf",
    "/etc/ld.so.cache",
    "/etc/ld.so.conf",
    "/etc/localtime",
    "/etc/machine-id",
    "/var/cache/ldconfig",
    "/var/lib/dbus",
    "/var/lib/dhcp",
    "/var/lib/sudo",
    "/var/lib/urandom",
    "/var/pressure-vessel",
    NULL
  };
  static const char * const from_host[] =
  {
    "/etc/host.conf",
    "/etc/hosts",
    "/etc/resolv.conf",
    NULL
  };
  static const char * const from_provider[] =
  {
    "/etc/amd",
    "/etc/drirc",
    "/etc/nvidia",
    "/run/bumblebee.socket",
    NULL
  };
  static const char * const redirect_into_interpreter_root[] =
  {
    "/etc/alternatives",
    "/etc/ld.so.conf.d",
    NULL
  };
  g_autofree gchar *xrd = g_strdup_printf ("/run/user/%ld", (long) geteuid ());
  gboolean have_machine_id = FALSE;

  g_return_val_if_fail (PV_IS_RUNTIME (self), FALSE);
  g_return_val_if_fail (exports != NULL, FALSE);
  g_return_val_if_fail (!pv_bwrap_was_finished (bwrap), FALSE);
  g_return_val_if_fail (container_env != NULL, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  if (self->flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT)
    {
      static const char * const needed_in_real_root[] =
      {
        "/etc/alternatives",
        "/etc/ld.so.cache",
        "/etc/ld.so.conf",
        "/etc/ld.so.conf.d",
      };

      /* If we're in an emulator like FEX-Emu, we need to use the host
       * OS's /usr as our real root directory, and set the runtime up
       * in a different directory. */

      if (!pv_bwrap_bind_usr (bwrap, "/", self->real_root->fd, "/", error))
        return FALSE;

      /* We need at least a subset of the host's /etc, for ld.so.cache
       * and so on. For now, we only support host OSs that use the
       * interoperable path; OS-specific variant paths like the ones in
       * ClearLinux and Exherbo could be added later if required. */
      for (size_t i = 0; i < G_N_ELEMENTS (needed_in_real_root); i++)
        {
          const char *path = needed_in_real_root[i];
          g_autofree char *target = g_build_filename ("/run/interpreter-host",
                                                      path, NULL);

          if (!pv_runtime_make_symlink_in_container (self,
                                                     bwrap,
                                                     target,
                                                     path,
                                                     PV_RUNTIME_EMULATION_ROOTS_REAL_ONLY,
                                                     error))
            g_return_val_if_reached (FALSE);
        }

      if (!pv_bwrap_bind_usr (bwrap,
                              self->runtime_files_on_host,
                              self->runtime_files_fd,
                              PV_RUNTIME_PATH_INTERPRETER_ROOT, error))
        g_return_val_if_reached (FALSE);

      /* Force FEX-Emu to use this root filesystem instead of the one
       * it would "naturally" have used. Parts of it will be symlinks
       * into /var/pressure-vessel/gfx, which contains bind-mounts from
       * FEX-Emu's original rootfs.
       *
       * We cannot do this via _srt_env_overlay_set(), since that sets the
       * environment in which we execute pv-bwrap, but that needs to be
       * using the old environment to find the rootfs, since it has not
       * pivoted its root directory yet.
       *
       * TODO: Generalize this to other interpreters/emulators */
      flatpak_bwrap_add_args (bwrap,
                              "--setenv", "FEX_ROOTFS", PV_RUNTIME_PATH_INTERPRETER_ROOT,
                              NULL);
    }
  else
    {
      if (!pv_bwrap_bind_usr (bwrap,
                              self->runtime_files_on_host,
                              self->runtime_files_fd,
                              "/", error))
        return FALSE;
    }

  /* In the case where we have a mutable sysroot, we mount the overrides
   * as part of /usr. Make /overrides a symbolic link, to be nice to
   * older steam-runtime-tools versions. */

  if (self->mutable_sysroot != NULL)
    {
      g_autoptr(GError) local_error = NULL;

      g_assert (self->overrides_in_container[0] == '/');
      g_assert (g_strcmp0 (self->overrides_in_container, "/overrides") != 0);

      if (!pv_runtime_make_symlink_in_container (self, bwrap,
                                                 &self->overrides_in_container[1],
                                                 "/overrides",
                                                 PV_RUNTIME_EMULATION_ROOTS_INTERPRETER_ONLY,
                                                 &local_error))
        g_warning ("%s", local_error->message);

      /* Also make a matching symbolic link on disk, to make it easier
       * to inspect the sysroot. */
      if (TEMP_FAILURE_RETRY (symlinkat (&self->overrides_in_container[1],
                                         self->mutable_sysroot->fd,
                                         "overrides")) != 0)
        return glnx_throw_errno_prefix (error,
                                        "Unable to create symlink \"%s/overrides\" -> \"%s\"",
                                        self->mutable_sysroot->path,
                                        &self->overrides_in_container[1]);
    }

  flatpak_bwrap_add_args (bwrap,
                          "--dir", "/tmp",
                          "--dir", "/var",
                          /* When using an interpreter root, these are not
                           * created in $FEX_ROOTFS/{run,tmp}, but that's
                           * consistent with the situation without
                           * pressure-vessel: readdir() on /var doesn't
                           * list run or tmp, but reading /var/run/ or
                           * /var/tmp/ works anyway. */
                          "--dir", "/var/tmp",
                          "--symlink", "../run", "/var/run",
                          NULL);

  _srt_env_overlay_set (container_env, "XDG_RUNTIME_DIR", xrd);

  if (self->providers != NULL)
    {
      for (size_t i = 0; i < self->providers->len; i++)
        {
          PvGraphicsProvider *provider = g_ptr_array_index (self->providers, i);

          /* The interpreter host graphics provider is mounted at the
           * real root, so it doesn't need to be bind-mounted specifically */
          if (provider->flags & PV_GRAPHICS_PROVIDER_FLAGS_INTERPRETER_HOST)
            continue;

          /* We always mount / on /run/host (in main()) so we don't need
           * to do it here */
          if (g_strcmp0 (provider->path_in_host_ns, "/") == 0
              && g_strcmp0 (provider->path_in_container_ns, "/run/host") == 0)
            continue;

          /* If a graphics provider is mounted at a different mount point
           * such as /run/gfx, then we do need to mount it specifically */
          if (!bind_gfx_provider (provider, bwrap, "/", error))
            return FALSE;

          /* Symlinks in the FEX-Emu rootfs are resolved as if it was
           * chrooted into that rootfs, so the graphics-stack provider needs
           * to exist inside the rootfs too. */
          if (self->flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT
              && !bind_gfx_provider (provider, bwrap,
                                     PV_RUNTIME_PATH_INTERPRETER_ROOT,
                                     error))
            return FALSE;
        }
    }

  for (size_t i = 0; i < G_N_ELEMENTS (bind_mutable); i++)
    {
      g_autofree gchar *path = g_build_filename (self->runtime_files,
                                                 bind_mutable[i],
                                                 NULL);
      g_auto(SrtDirIter) dir = SRT_DIR_ITER_CLEARED;
      struct dirent *dent;

      g_assert (pv_runtime_path_belongs_in_interpreter_root (self, bind_mutable[i]));

      if (!_srt_dir_iter_init_at (&dir, AT_FDCWD, path,
                                  SRT_DIR_ITER_FLAGS_FOLLOW,
                                  self->arbitrary_dirent_order,
                                  NULL))
        continue;

      while (_srt_dir_iter_next_dent (&dir, &dent, NULL, NULL) && dent != NULL)
        {
          const char *member = dent->d_name;
          g_autofree gchar *dest = g_build_filename ("/", bind_mutable[i],
                                                     member, NULL);
          g_autofree gchar *full = NULL;
          g_autofree gchar *target = NULL;
          PvRuntimeEmulationRoots roots = PV_RUNTIME_EMULATION_ROOTS_BOTH;

          if (g_strv_contains (dont_bind, dest))
            continue;

          if (g_strv_contains (from_host, dest))
            continue;

          if (self->providers != NULL && g_strv_contains (from_provider, dest))
            continue;

          if ((self->flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT)
              && g_str_has_prefix (dest, "/etc")
              && g_strv_contains (redirect_into_interpreter_root, dest))
            {
              /* We have to distinguish between the real /etc, used for
               * FEX-Emu or a similar interpreter/emulator, and the /etc
               * used for the emulated process. The former is a 1:1 copy
               * of the real /etc, but the latter is controlled by us. */
              roots = PV_RUNTIME_EMULATION_ROOTS_INTERPRETER_ONLY;
            }

          full = g_build_filename (self->runtime_files,
                                   bind_mutable[i],
                                   member,
                                   NULL);
          target = glnx_readlinkat_malloc (-1, full, NULL, NULL);

          if (target != NULL)
            {
              if (!pv_runtime_make_symlink_in_container (self, bwrap,
                                                         target, dest,
                                                         roots, error))
                g_return_val_if_reached (FALSE);
            }
          else
            {
              /* We will run bwrap in the host system, so translate the path
               * if necessary */
              g_autofree gchar *on_host = pv_current_namespace_path_to_host_path (full);

              if (!pv_runtime_bind_into_container (self, bwrap,
                                                   on_host, NULL, 0,
                                                   dest, roots, error))
                g_return_val_if_reached (FALSE);
            }
        }
    }

  /* If we are in a Flatpak environment, we need to test if these files are
   * available in the host, and not in the current environment, because we will
   * run bwrap in the host system */
  if (_srt_sysroot_test (self->host_root, "/etc/machine-id",
                         SRT_RESOLVE_FLAGS_NONE, NULL))
    {
      if (!pv_runtime_bind_into_container (self, bwrap,
                                           "/etc/machine-id", NULL, 0,
                                           "/etc/machine-id",
                                           PV_RUNTIME_EMULATION_ROOTS_BOTH,
                                           error))
        g_return_val_if_reached (FALSE);

      have_machine_id = TRUE;
    }
  /* We leave this for completeness but in practice we do not expect to have
   * access to the "/var" host directory because Flatpak usually just binds
   * the host's "etc" and "usr". */
  else if (_srt_sysroot_test (self->host_root, "/var/lib/dbus/machine-id",
                              SRT_RESOLVE_FLAGS_NONE, NULL))
    {
      if (!pv_runtime_bind_into_container (self, bwrap,
                                           "/var/lib/dbus/machine-id", NULL, 0,
                                           "/etc/machine-id",
                                           PV_RUNTIME_EMULATION_ROOTS_BOTH,
                                           error))
        g_return_val_if_reached (FALSE);

      have_machine_id = TRUE;
    }

  if (have_machine_id
      && !pv_runtime_make_symlink_in_container (self, bwrap,
                                                "/etc/machine-id",
                                                "/var/lib/dbus/machine-id",
                                                PV_RUNTIME_EMULATION_ROOTS_BOTH,
                                                error))
    g_return_val_if_reached (FALSE);

  for (size_t i = 0; from_host[i] != NULL; i++)
    {
      const char *item = from_host[i];

      g_assert (pv_runtime_path_belongs_in_interpreter_root (self, item));

      if (_srt_sysroot_test (self->host_root, item,
                             SRT_RESOLVE_FLAGS_NONE, NULL)
          && !pv_runtime_bind_into_container (self, bwrap,
                                              item, NULL, 0,
                                              item,
                                              PV_RUNTIME_EMULATION_ROOTS_BOTH,
                                              error))
        g_return_val_if_reached (FALSE);
    }

    {
      g_autofree gchar *content = pv_generate_etc_passwd (self->real_root, NULL);

      g_assert (content != NULL);

      if (!pv_runtime_bind_into_container (self, bwrap,
                                           "etc-passwd", content, -1,
                                           "/etc/passwd",
                                           PV_RUNTIME_EMULATION_ROOTS_BOTH,
                                           error))
        return FALSE;
    }

    {
      g_autofree gchar *content = pv_generate_etc_group (self->real_root, NULL);

      g_assert (content != NULL);

      if (!pv_runtime_bind_into_container (self, bwrap,
                                           "etc-group", content, -1,
                                           "/etc/group",
                                           PV_RUNTIME_EMULATION_ROOTS_BOTH,
                                           error))
        return FALSE;
    }

  if (self->providers != NULL)
    {
      for (size_t i = 0; from_provider[i] != NULL; i++)
        {
          const char *item = from_provider[i];
          gsize provider_index;
          PvRuntimeEmulationRoots roots;

          /* In FEX-Emu or similar, the graphics provider is only used for
           * the emulated architecture, so we put it in the interpreter's
           * overlay rather than in the real root directory - unless it's
           * outside the scope of the overlay (like sockets in /run)
           * in which case we want it to be in the root. */
          if (pv_runtime_path_belongs_in_interpreter_root (self, item))
            roots = PV_RUNTIME_EMULATION_ROOTS_INTERPRETER_ONLY;
          else
            roots = PV_RUNTIME_EMULATION_ROOTS_REAL_ONLY;

          /* We look for /etc/drirc, etc. in each graphics stack provider
           * in turn, in priority order, stopping if we find them. */
          for (provider_index = 0;
               provider_index < self->providers->len;
               provider_index++)
            {
              g_autoptr(GError) local_error = NULL;
              g_autofree char *path_in_provider = NULL;
              glnx_autofd int fd = -1;
              PvGraphicsProvider *provider;

              provider = g_ptr_array_index (self->providers, provider_index);

              if (provider->flags & PV_GRAPHICS_PROVIDER_FLAGS_INTERPRETER_HOST)
                continue;

              fd = _srt_sysroot_open (provider->in_current_ns, item,
                                      SRT_RESOLVE_FLAGS_NONE,
                                      &path_in_provider, &local_error);

              if (fd >= 0)
                {
                  g_autofree char *host_path = NULL;

                  host_path = g_build_filename (provider->path_in_host_ns,
                                                path_in_provider, NULL);

                  if (!pv_runtime_bind_into_container (self, bwrap,
                                                       host_path, NULL, 0, item,
                                                       roots, error))
                    g_return_val_if_reached (FALSE);

                  break;
                }

              if (!g_error_matches (local_error, G_IO_ERROR, G_IO_ERROR_NOT_FOUND))
                g_debug ("Cannot resolve \"%s\" in \"%s\": %s",
                         item, provider->in_current_ns->path,
                         local_error->message);
            }

          if (provider_index >= self->providers->len)
            g_debug ("Cannot resolve \"%s\" in any graphics provider", item);
        }
    }

  if ((self->flags & PV_RUNTIME_FLAGS_IMPORT_CA_CERTS)
      && !(self->workarounds & PV_WORKAROUND_FLAGS_STEAMSNAP_397))
    {
      g_autoptr(FlatpakBwrap) ca_args = NULL;
      g_autoptr(GError) local_error = NULL;

      ca_args = pv_runtime_import_ca_certs (self, &local_error);

      if (ca_args != NULL)
        flatpak_bwrap_append_bwrap (bwrap, ca_args);
      else
        g_warning ("Not importing host CA certificates: %s",
                   local_error->message);
    }

  return TRUE;
}

/*
 * Exactly as symlinkat(2), except that if the destination already exists,
 * it will be removed.
 */
static gboolean
pv_runtime_symlinkat (const gchar *target,
                      int destination_dirfd,
                      const gchar *destination,
                      GError **error)
{
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  if (!glnx_shutil_rm_rf_at (destination_dirfd, destination, NULL, error))
    return FALSE;

  if (TEMP_FAILURE_RETRY (symlinkat (target, destination_dirfd, destination)) != 0)
    return glnx_throw_errno_prefix (error,
                                    "Unable to create symlink \".../%s\" -> \"%s\"",
                                    destination, target);

  return TRUE;
}

/*
 * symlink_each_ld_so_file:
 * @self: The runtime
 * @bwrap: (nullable): bubblewrap arguments or %NULL
 * @target: Target for symlinks
 * @symlinks_relative_to: (nullable): If non-%NULL, each item in @symlinks
 *  is relative to this path, which in turn is relative to the root of
 *  the container
 * @symlinks: (nullable): Zero or more symlinks to create, relative
 *  to @symlinks_relative_to or to the root of the container
 */
static void
symlink_each_ld_so_file (PvRuntime *self,
                         FlatpakBwrap *bwrap,
                         const char *target,
                         const char *symlinks_relative_to,
                         const char * const *symlinks)
{
  if (symlinks == NULL)
    return;

  for (size_t j = 0; symlinks[j] != NULL; j++)
    {
      g_autoptr(GError) local_error = NULL;
      g_autofree gchar *joined = NULL;
      const char *name = symlinks[j];
      const char *path;

      if (symlinks_relative_to != NULL)
        path = joined = g_build_filename (symlinks_relative_to, name, NULL);
      else
        path = name;

      if (!pv_runtime_make_symlink_in_container (self,
                                                 bwrap,
                                                 target,
                                                 path,
                                                 PV_RUNTIME_EMULATION_ROOTS_INTERPRETER_ONLY,
                                                 &local_error))
        _srt_log_warning ("%s", local_error->message);
    }
}

static gboolean
bind_runtime_ld_so (PvRuntime *self,
                    FlatpakBwrap *bwrap,
                    SrtEnvOverlay *container_env,
                    GError **error)
{
  g_return_val_if_fail (PV_IS_RUNTIME (self), FALSE);
  g_return_val_if_fail (bwrap == NULL || !pv_bwrap_was_finished (bwrap), FALSE);
  g_return_val_if_fail (self->is_flatpak_env || bwrap != NULL, FALSE);
  g_return_val_if_fail (self->mutable_sysroot != NULL || !self->is_flatpak_env, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  if (self->is_flatpak_env)
    {
      const gchar *xrd = NULL;
      g_autofree gchar *ldso_runtime_dir = NULL;
      g_autofree gchar *xrd_ld_so_conf = NULL;
      g_autofree gchar *xrd_ld_so_cache = NULL;
      glnx_autofd int sysroot_etc_dirfd = -1;
      glnx_autofd int ldso_runtime_dirfd = -1;

      sysroot_etc_dirfd = _srt_resolve_in_sysroot (self->mutable_sysroot->fd,
                                                   "/etc",
                                                   SRT_RESOLVE_FLAGS_MKDIR_P,
                                                   NULL, error);
      if (sysroot_etc_dirfd < 0)
        return FALSE;

      /* Because we're running under Flatpak in this code path,
       * we expect that there is a XDG_RUNTIME_DIR even if the host system
       * doesn't provide one; and because we require Flatpak 1.11.1,
       * we can assume it's shared between our current sandbox and the
       * game's subsandbox, with the same path in both. */
      xrd = g_environ_getenv (self->original_environ, "XDG_RUNTIME_DIR");
      if (xrd == NULL)
        {
          g_warning ("The environment variable XDG_RUNTIME_DIR is not set, skipping regeneration of ld.so");
          return TRUE;
        }

      ldso_runtime_dir = g_build_filename (xrd, "pressure-vessel", "ldso", NULL);
      if (g_mkdir_with_parents (ldso_runtime_dir, 0700) != 0)
        return glnx_throw_errno_prefix (error, "Unable to create %s",
                                        ldso_runtime_dir);

      xrd_ld_so_conf = g_build_filename (ldso_runtime_dir, "ld.so.conf", NULL);
      xrd_ld_so_cache = g_build_filename (ldso_runtime_dir, "ld.so.cache", NULL);

      if (!glnx_opendirat (-1, ldso_runtime_dir, TRUE, &ldso_runtime_dirfd, error))
        return FALSE;

      /* Rename the original ld.so.cache and conf because we will create
       * symlinks in their places */
      if (!glnx_renameat (self->mutable_sysroot->fd, "etc/ld.so.cache",
                          self->mutable_sysroot->fd, "etc/runtime-ld.so.cache", error))
        return FALSE;
      if (!glnx_renameat (self->mutable_sysroot->fd, "etc/ld.so.conf",
                          self->mutable_sysroot->fd, "etc/runtime-ld.so.conf", error))
        return FALSE;

      if (!pv_runtime_symlinkat (xrd_ld_so_cache, self->mutable_sysroot->fd,
                                 "etc/ld.so.cache", error))
        return FALSE;
      if (!pv_runtime_symlinkat (xrd_ld_so_conf, self->mutable_sysroot->fd,
                                 "etc/ld.so.conf", error))
        return FALSE;

      /* Create a symlink to the runtime's version */
      if (!pv_runtime_symlinkat ("/etc/runtime-ld.so.cache", ldso_runtime_dirfd,
                                 "runtime-ld.so.cache", error))
        return FALSE;
      if (!pv_runtime_symlinkat ("/etc/runtime-ld.so.conf", ldso_runtime_dirfd,
                                 "runtime-ld.so.conf", error))
        return FALSE;

      /* Initially it's a symlink to the runtime's version and we rely on
       * LD_LIBRARY_PATH for our overrides, but -adverb will overwrite this
       * symlink */
      if (!pv_runtime_symlinkat ("runtime-ld.so.cache", ldso_runtime_dirfd,
                                 "ld.so.cache", error))
        return FALSE;
      if (!pv_runtime_symlinkat ("runtime-ld.so.conf", ldso_runtime_dirfd,
                                 "ld.so.conf", error))
        return FALSE;

      /* Initially we have the following situation:
       * ($XRD is an abbreviation for $XDG_RUNTIME_DIR)
       * ${mutable_sysroot}/etc/ld.so.cache -> $XRD/pressure-vessel/ldso/ld.so.cache
       * $XRD/pressure-vessel/ldso/ld.so.cache -> runtime-ld.so.cache
       * $XRD/pressure-vessel/ldso/runtime-ld.so.cache -> ${mutable_sysroot}/etc/runtime-ld.so.cache
       * ${mutable_sysroot}/etc/runtime-ld.so.cache is the original runtime's ld.so.cache
       *
       * After exectuting -adverb we expect the symlink $XRD/pressure-vessel/ldso/ld.so.cache
       * to be replaced with a newly generated ld.so.cache that incorporates the
       * necessary paths from LD_LIBRARY_PATH */
    }
  else
    {
      g_assert (bwrap != NULL);

      const char *mutable_ldso_dir;
      /* The absolute path to our modifiable ld.so.cache/.conf symlink,
       * as seen from inside the container and (if applicable) the
       * interpreter root. */
      g_autofree gchar *mutable_cache_path = NULL;
      g_autofree gchar *mutable_conf_path = NULL;
      /* The locations where we will bind-mount the runtime's
       * ld.so.cache/.conf, as seen from inside the container and
       * (if applicable) the interpreter root. */
      g_autofree gchar *runtime_cache_path = NULL;
      g_autofree gchar *runtime_conf_path = NULL;
      /* The location of the runtime's ld.so.cache/.conf, as seen by
       * bwrap in /oldroot */
      g_autofree gchar *ld_so_cache_on_host = NULL;
      g_autofree gchar *ld_so_conf_on_host = NULL;

      if (self->workarounds & PV_WORKAROUND_FLAGS_STEAMSNAP_356)
        mutable_ldso_dir = MUTABLE_LDSO_DIR_SNAP;
      else
        mutable_ldso_dir = MUTABLE_LDSO_DIR_NORMAL;

      mutable_cache_path = g_build_filename (mutable_ldso_dir, "ld.so.cache", NULL);
      mutable_conf_path = g_build_filename (mutable_ldso_dir, "ld.so.conf", NULL);
      runtime_cache_path = g_build_filename (mutable_ldso_dir, "runtime-ld.so.cache", NULL);
      runtime_conf_path = g_build_filename (mutable_ldso_dir, "runtime-ld.so.conf", NULL);

      /* We only support runtimes that include /etc/ld.so.cache and
        * /etc/ld.so.conf at their interoperable path. */
      ld_so_cache_on_host = g_build_filename (self->runtime_files_on_host,
                                              "etc", "ld.so.cache", NULL);
      ld_so_conf_on_host = g_build_filename (self->runtime_files_on_host,
                                              "etc", "ld.so.conf", NULL);

      /* Unlike the rest of /etc, if we are running under an interpreter
       * like FEX-Emu, we put our ld.so.cache, ld.so.conf in the target
       * directory, not the root filesystem. This is because we need the
       * interpreter's overlay behaviour: for example, if running FEX-Emu
       * on aarch64, we need aarch64 processes like FEX-Emu itself to be
       * able to see the real host OS's aarch64 ld.so.cache, but the
       * emulated x86 executable that it's running needs to see our x86
       * ld.so.cache in the overlay.
       *
       * Similarly, the targets of all symlinks in the FEX-Emu rootfs
       * must themselves be in the FEX-Emu rootfs.
       *
       * Otherwise, they're the same as for the non-FEX code path, below. */
      if (self->flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT)
        {
          /* To make it a little easier to understand what's going on,
           * make mutable_ldso_dir a symlink to the mutable_ldso_dir inside
           * the rootfs. */
          g_autofree gchar *in_interpreter_root = g_strconcat (PV_RUNTIME_PATH_INTERPRETER_ROOT,
                                                               mutable_ldso_dir,
                                                               NULL);

          flatpak_bwrap_add_args (bwrap,
                                  "--tmpfs", in_interpreter_root,
                                  "--symlink", in_interpreter_root, mutable_ldso_dir,
                                  NULL);
        }
      else
        {
          flatpak_bwrap_add_args (bwrap,
                                  "--tmpfs", mutable_ldso_dir,
                                  NULL);
        }

      const struct
      {
        const char *target;
        const char *dest;
        PvRuntimeEmulationRoots roots;
      } symlinks[] =
      {
          /* We put the ld.so.cache somewhere that we can overwrite from
           * inside the container by replacing the symlink. */
          { mutable_cache_path, "/etc/ld.so.cache" },
          /* ... and the same for its configuration */
          { mutable_conf_path, "/etc/ld.so.conf" },

          /* Initially it's a symlink to the runtime's version and we rely
           * on LD_LIBRARY_PATH for our overrides, but -adverb will
           * overwrite this symlink. */
          { "runtime-ld.so.cache", mutable_cache_path },
          { "runtime-ld.so.conf", mutable_conf_path },
      };

      const struct
      {
        const char *host_path;
        const char *dest;
        PvRuntimeEmulationRoots roots;
      } binds[] =
      {
          { ld_so_cache_on_host, runtime_cache_path },
          { ld_so_conf_on_host, runtime_conf_path },
      };

      for (size_t i = 0; i < G_N_ELEMENTS (symlinks); i++)
        {
          if (!pv_runtime_make_symlink_in_container (self, bwrap,
                                                     symlinks[i].target,
                                                     symlinks[i].dest,
                                                     PV_RUNTIME_EMULATION_ROOTS_INTERPRETER_ONLY,
                                                     error))
            return FALSE;
        }

      for (size_t i = 0; i < G_N_ELEMENTS (binds); i++)
        {
          if (!pv_runtime_bind_into_container (self, bwrap,
                                               binds[i].host_path, NULL, 0,
                                               binds[i].dest,
                                               PV_RUNTIME_EMULATION_ROOTS_INTERPRETER_ONLY,
                                               error))
            g_return_val_if_reached (FALSE);
        }

      /* glibc from some distributions will want to load the ld.so cache from
       * a distribution-specific path, e.g. Clear Linux uses
       * /var/cache/ldconfig/ld.so.cache. For simplicity, we make all these paths
       * symlinks, so that we only have to populate the cache in one place. */
      symlink_each_ld_so_file (self,
                               bwrap,
                               mutable_cache_path,
                               NULL,
                               _srt_get_extra_ld_so_cache_filenames ());

      /* Similar, but for ld.so.conf, for example on Solus. */
      symlink_each_ld_so_file (self,
                               bwrap,
                               mutable_conf_path,
                               NULL,
                               _srt_get_extra_ld_so_conf_filenames ());

      /* glibc from some distributions will want to load the ld.so cache from
       * a distribution- and architecture-specific path, e.g. Exherbo
       * does this. Again, for simplicity we direct all these to the same path:
       * it's OK to mix multiple architectures' libraries into one cache,
       * as done in upstream glibc (and Debian, Arch, etc.). */
      for (size_t i = 0; i < self->tuples->len; i++)
        {
          GQuark tuple_quark = g_array_index (self->tuples, GQuark, i);
          const char *tuple = g_quark_to_string (tuple_quark);
          const SrtKnownArchitecture *known;

          known = _srt_architecture_get_by_tuple (tuple);

          if (known == NULL)
            continue;

          symlink_each_ld_so_file (self,
                                   bwrap,
                                   mutable_cache_path,
                                   "etc",
                                   known->extra_ld_so_caches);
          symlink_each_ld_so_file (self,
                                   bwrap,
                                   mutable_conf_path,
                                   "etc",
                                   known->extra_ld_so_confs);
        }
    }

  return TRUE;
}

static gboolean
bind_runtime_finish (PvRuntime *self,
                     FlatpakExports *exports,
                     FlatpakBwrap *bwrap,
                     GError **error)
{
  g_return_val_if_fail (PV_IS_RUNTIME (self), FALSE);
  g_return_val_if_fail (exports != NULL, FALSE);
  g_return_val_if_fail (!pv_bwrap_was_finished (bwrap), FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  pv_export_symlink_targets (exports, self->overrides, "overrides");

  if (self->mutable_sysroot == NULL)
    {
      /* self->overrides is in a temporary directory that will be
       * cleaned up before we enter the container, so we need to convert
       * it into a series of --dir and --symlink instructions.
       *
       * We have to do this late, because it adds data fds. */
      pv_bwrap_copy_tree (bwrap, self->overrides, self->overrides_in_container);
    }

  /* /etc/localtime and /etc/resolv.conf can not exist (or be symlinks to
   * non-existing targets), in which case we don't want to attempt to create
   * bogus symlinks or bind mounts, as that will cause flatpak run to fail.
   */
  if (_srt_sysroot_test (self->host_root, "/etc/localtime",
                         SRT_RESOLVE_FLAGS_NONE, NULL))
    {
      g_autoptr(GError) local_error = NULL;
      g_autofree char *target = NULL;
      gboolean is_reachable = FALSE;
      g_autofree char *tz = flatpak_get_timezone ();
      g_autofree char *timezone_content = g_strdup_printf ("%s\n", tz);
      g_autofree char *localtime_in_current_namespace =
        g_build_filename (self->host_root->path, "/etc/localtime", NULL);

      target = glnx_readlinkat_malloc (-1, localtime_in_current_namespace, NULL, NULL);

      if (target != NULL)
        {
          g_autoptr(GFile) base_file = NULL;
          g_autoptr(GFile) target_file = NULL;
          g_autofree char *target_canonical = NULL;

          base_file = g_file_new_for_path ("/etc");
          target_file = g_file_resolve_relative_path (base_file, target);
          target_canonical = g_file_get_path (target_file);

          is_reachable = g_str_has_prefix (target_canonical, "/usr/");
        }

      if (is_reachable)
        {
          if (!pv_runtime_make_symlink_in_container (self, bwrap,
                                                     target, "/etc/localtime",
                                                     PV_RUNTIME_EMULATION_ROOTS_BOTH,
                                                     error))
            g_return_val_if_reached (FALSE);
        }
      else
        {
          if (!pv_runtime_bind_into_container (self, bwrap,
                                               "/etc/localtime", NULL, 0,
                                               "/etc/localtime",
                                               PV_RUNTIME_EMULATION_ROOTS_BOTH,
                                               error))
            g_return_val_if_reached (FALSE);
        }

      /* Historically we completely ignored errors here, so just warn
       * instead of bailing out. */
      if (!pv_runtime_bind_into_container (self, bwrap,
                                           "timezone", timezone_content, -1,
                                           "/etc/timezone",
                                           PV_RUNTIME_EMULATION_ROOTS_BOTH,
                                           &local_error))
        {
          g_warning ("%s", local_error->message);
          g_clear_error (&local_error);
        }
    }

  return TRUE;
}

typedef enum
{
  TAKE_FROM_PROVIDER_FLAGS_IF_DIR = (1 << 0),
  TAKE_FROM_PROVIDER_FLAGS_IF_EXISTS = (1 << 1),
  TAKE_FROM_PROVIDER_FLAGS_IF_CONTAINER_COMPATIBLE = (1 << 2),
  TAKE_FROM_PROVIDER_FLAGS_COPY_FALLBACK = (1 << 3),
  TAKE_FROM_PROVIDER_FLAGS_IF_REGULAR = (1 << 4),
  TAKE_FROM_PROVIDER_FLAGS_REALPATH = (1 << 5),
  TAKE_FROM_PROVIDER_FLAGS_LOCALES = (1 << 6),
  TAKE_FROM_PROVIDER_FLAGS_NONE = 0
} TakeFromProviderFlags;

#define TAKE_FROM_PROVIDER_TESTS \
  (TAKE_FROM_PROVIDER_FLAGS_IF_DIR \
   | TAKE_FROM_PROVIDER_FLAGS_IF_EXISTS \
   | TAKE_FROM_PROVIDER_FLAGS_IF_REGULAR)

/*
 * pv_runtime_take_from_provider:
 * @self: the runtime
 * @bwrap: bubblewrap arguments
 * @source_in_provider: source path in the graphics stack provider's
 *  namespace, either absolute or relative to the root
 * @dest_in_container: destination path in the container we are creating,
 *  either absolute or relative to the root
 * @flags: flags affecting how we do it
 * @error: used to report error
 *
 * Try to arrange for @source_in_provider to be made available at the
 * path @dest_in_container in the container we are creating.
 *
 * Note that neither @source_in_provider nor @dest_in_container is
 * guaranteed to be an absolute path.
 */
static gboolean
pv_runtime_take_from_provider (PvRuntime *self,
                               PvGraphicsProvider *provider,
                               const char *source_in_provider,
                               FlatpakBwrap *bwrap,
                               const char *dest_in_container,
                               TakeFromProviderFlags flags,
                               GError **error)
{
  g_autoptr(GError) resolve_error = NULL;
  g_autofree gchar *realpath_in_provider = NULL;
  SrtResolveFlags resolve_flags = SRT_RESOLVE_FLAGS_NONE;
  glnx_autofd int source_fd = -1;

  g_return_val_if_fail (PV_IS_RUNTIME (self), FALSE);
  g_return_val_if_fail (provider != NULL, FALSE);
  g_return_val_if_fail (bwrap == NULL || !pv_bwrap_was_finished (bwrap), FALSE);
  g_return_val_if_fail (bwrap != NULL || self->mutable_sysroot != NULL, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  g_return_val_if_fail (__builtin_popcount (flags & TAKE_FROM_PROVIDER_TESTS) <= 1,
                        FALSE);

  if (flags & TAKE_FROM_PROVIDER_FLAGS_LOCALES)
    {
      SrtGraphicsProviderFeatureFlags features =
        _srt_graphics_provider_get_features (provider->details);

      /* pv_runtime_take_any_from_provider should have prevented this */
      if (!(features & SRT_GRAPHICS_PROVIDER_FEATURE_FLAGS_LOCALES))
        g_critical ("Should not be taking %s from %s",
                    source_in_provider,
                    _srt_graphics_provider_describe (provider->details));
    }

  if (flags & TAKE_FROM_PROVIDER_FLAGS_IF_DIR)
    resolve_flags |= SRT_RESOLVE_FLAGS_MUST_BE_DIRECTORY;

  /* IF_EXISTS doesn't need any special flags passed in */

  if (flags & TAKE_FROM_PROVIDER_FLAGS_IF_REGULAR)
    resolve_flags |= SRT_RESOLVE_FLAGS_MUST_BE_REGULAR;

  source_fd = _srt_sysroot_open (provider->in_current_ns,
                                 source_in_provider, resolve_flags,
                                 &realpath_in_provider, &resolve_error);

  if (flags & TAKE_FROM_PROVIDER_FLAGS_IF_DIR)
    {
      if (source_fd < 0)
        {
          g_debug ("Not replacing \"${container}/%s\" with \"%s/%s\": "
                   "source is not a directory: %s",
                   dest_in_container,
                   provider->in_current_ns->path, source_in_provider,
                   resolve_error->message);
          return TRUE;
        }
    }

  if (flags & TAKE_FROM_PROVIDER_FLAGS_IF_REGULAR)
    {
      if (source_fd < 0)
        {
          g_debug ("Not replacing \"${container}/%s\" with \"%s/%s\": "
                   "source is not a regular file: %s",
                   dest_in_container,
                   provider->in_current_ns->path, source_in_provider,
                   resolve_error->message);
          return TRUE;
        }
    }

  if (flags & TAKE_FROM_PROVIDER_FLAGS_IF_EXISTS)
    {
      if (source_fd < 0)
        {
          g_debug ("Not replacing \"${container}/%s\" with \"%s/%s\": "
                   "source does not exist: %s",
                   dest_in_container,
                   provider->in_current_ns->path, source_in_provider,
                   resolve_error->message);
          return TRUE;
        }
    }

  if ((flags & TAKE_FROM_PROVIDER_FLAGS_REALPATH)
      && realpath_in_provider != NULL)
    source_in_provider = realpath_in_provider;

  if (self->mutable_sysroot != NULL)
    {
      /* Replace ${mutable_sysroot}/usr/lib/locale with a symlink to
       * /run/host/usr/lib/locale, or similar */
      g_autofree gchar *parent_in_container = NULL;
      g_autofree gchar *target = NULL;
      const char *base;
      glnx_autofd int parent_dirfd = -1;

      parent_in_container = g_path_get_dirname (dest_in_container);
      parent_dirfd = _srt_resolve_in_sysroot (self->mutable_sysroot->fd,
                                              parent_in_container,
                                              SRT_RESOLVE_FLAGS_MKDIR_P,
                                              NULL, error);

      if (parent_dirfd < 0)
        return FALSE;

      base = glnx_basename (dest_in_container);

      g_debug ("Removing \"${container}/%s\"", dest_in_container);

      if (!glnx_shutil_rm_rf_at (parent_dirfd, base, NULL, error))
        return FALSE;

      /* If it isn't in /usr, /lib, etc., then the symlink will be
       * dangling and this probably isn't going to work. */
      if (path_visible_in_provider_namespace (self->flags, source_in_provider))
        {
          target = g_build_filename (provider->path_in_container_ns,
                                     source_in_provider, NULL);
        }
      /* A few paths are always available as-is in the container, such
       * as /nix and /gnu/store */
      else if (path_visible_in_container_namespace (self->flags,
                                                    self->workarounds,
                                                    source_in_provider))
        {
          target = g_build_filename ("/", source_in_provider, NULL);
        }
      else
        {
          if (flags & TAKE_FROM_PROVIDER_FLAGS_COPY_FALLBACK)
            {
              g_autofree char *proc_fd_name = g_strdup_printf ("/proc/self/fd/%d",
                                                               source_fd);
              glnx_autofd int file_fd = -1;
              glnx_autofd int dest_fd = -1;

              g_debug ("Creating \"${container}/%s\" by copying \"%s/%s\"",
                       dest_in_container,
                       provider->in_current_ns->path,
                       source_in_provider);

              if (source_fd < 0)
                {
                  g_warn_if_fail (resolve_error != NULL);
                  g_propagate_error (error, g_steal_pointer (&resolve_error));
                  return FALSE;
                }

              if (!glnx_openat_rdonly (-1, proc_fd_name, TRUE, &file_fd, error))
                {
                  g_prefix_error (error,
                                  "Unable to make \"%s\" available in container: ",
                                  source_in_provider);
                  return FALSE;
                }

              /* We already deleted ${parent_dirfd}/${base}, and we don't
               * care about atomicity or durability here, so we can just
               * write in-place. The permissions are uninteresting because
               * we're not expecting other users to read this temporary
               * sysroot anyway, so use 0600 just in case the source file
               * has restrictive permissions. */
              dest_fd = TEMP_FAILURE_RETRY (openat (parent_dirfd, base,
                                                    O_WRONLY|O_CLOEXEC|O_NOCTTY|O_CREAT|O_EXCL,
                                                    0600));

              if (dest_fd < 0)
                return glnx_throw_errno_prefix (error,
                                                "Unable to open \"%s\" for writing",
                                                dest_in_container);

              if (glnx_regfile_copy_bytes (file_fd, dest_fd, (off_t) -1) < 0)
                return glnx_throw_errno_prefix (error,
                                                "Unable to copy contents of \"%s/%s\" to \"%s\"",
                                                provider->in_current_ns->path,
                                                source_in_provider,
                                                dest_in_container);

              return TRUE;
            }

          g_warning ("\"%s\" is unlikely to appear in \"%s\"",
                     source_in_provider, provider->path_in_container_ns);
          /* We might as well try *something*.
           * path_visible_in_provider_namespace() covers all the paths
           * that are going to appear in /run/host or similar, so try with
           * no special prefix here, as though
           * path_visible_in_container_namespace() had returned true:
           * that way, even if we're on a non-FHS distro that puts
           * ld.so in /some/odd/path, it will be possible to use
           * PRESSURE_VESSEL_FILESYSTEMS_RO=/some/odd/path
           * as a workaround until pressure-vessel can be adjusted. */
          target = g_build_filename ("/", source_in_provider, NULL);
        }

      /* By now, all code paths should have ensured it starts with '/' */
      g_return_val_if_fail (target != NULL, FALSE);
      g_return_val_if_fail (target[0] == '/', FALSE);

      g_debug ("Creating symlink \"${container}/%s\" -> \"%s\"",
               dest_in_container, target);

      if (TEMP_FAILURE_RETRY (symlinkat (target, parent_dirfd, base)) != 0)
        return glnx_throw_errno_prefix (error,
                                        "Unable to create symlink \"%s/%s\" -> \"%s\"",
                                        self->mutable_sysroot->path,
                                        dest_in_container, target);
    }
  else
    {
      g_autofree gchar *source_in_current_ns = NULL;
      g_autofree gchar *abs_dest = NULL;

      /* We can't edit the runtime in-place, so tell bubblewrap to mount
       * a new version over the top */
      g_assert (bwrap != NULL);

      /* When setting up an interpreter root, for simplicity we require
       * the easier mutable sysroot code-path. */
      g_return_val_if_fail (!(self->flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT),
                            FALSE);

      g_debug ("Trying to replace \"${container}/%s\" with \"%s/%s\" via "
               "bind mount",
               dest_in_container, provider->in_current_ns->path,
               source_in_provider);

      if (source_fd < 0)
        {
          g_warn_if_fail (resolve_error != NULL);
          g_propagate_error (error, g_steal_pointer (&resolve_error));
          return FALSE;
        }

      if (flags & TAKE_FROM_PROVIDER_FLAGS_IF_CONTAINER_COMPATIBLE)
        {
          g_autofree gchar *dest = NULL;
          struct stat stat_buf;

          if (g_str_has_prefix (dest_in_container, "/usr/"))
            dest = g_build_filename (self->runtime_usr,
                                     dest_in_container + strlen ("/usr/"),
                                     NULL);
          else if (g_str_has_prefix (dest_in_container, "usr/"))
            dest = g_build_filename (self->runtime_usr,
                                     dest_in_container + strlen ("usr/"),
                                     NULL);
          else
            dest = g_build_filename (self->runtime_files,
                                     dest_in_container,
                                     NULL);

          if (fstat (source_fd, &stat_buf) != 0)
            return glnx_throw_errno_prefix (error,
                                            "fstat \"%s/%s\"",
                                            provider->in_current_ns->path,
                                            realpath_in_provider);

          if (S_ISDIR (stat_buf.st_mode))
            {
              if (!g_file_test (dest, G_FILE_TEST_IS_DIR))
                {
                  g_warning ("Not mounting \"%s/%s\" over "
                             "non-directory file or nonexistent path \"%s\"",
                             provider->in_current_ns->path,
                             source_in_provider, dest);
                  return TRUE;
                }
            }
          else
            {
              if (g_file_test (dest, G_FILE_TEST_IS_DIR) ||
                  !g_file_test (dest, G_FILE_TEST_EXISTS))
                {
                  g_warning ("Not mounting \"%s/%s\" over directory or "
                             "nonexistent path \"%s\"",
                             provider->in_current_ns->path,
                             source_in_provider, dest);
                  return TRUE;
                }
            }
        }

      /* This is not 100% robust against the provider sysroot being
       * modified while we're looking at it, but it's the best we can do. */
      source_in_current_ns = g_build_filename (provider->in_current_ns->path,
                                               realpath_in_provider,
                                               NULL);
      abs_dest = g_build_filename ("/", dest_in_container, NULL);
      /* By the time we get here, we know we are not using an interpreter
       * root, so it's OK to use --ro-bind directly */
      flatpak_bwrap_add_args (bwrap,
                              "--ro-bind", source_in_current_ns, abs_dest,
                              NULL);
    }

  return TRUE;
}

/*
 * pv_runtime_take_any_from_provider:
 * @self: the runtime
 * @bwrap: bubblewrap arguments
 * @sources_in_provider: (array zero-terminated=1): source paths in the
 *  graphics stack provider's namespace, either absolute or relative
 *  to the root
 * @dest_in_container: destination path in the container we are creating,
 *  either absolute or relative to the root
 * @flags: flags affecting how we do it
 * @error: used to report error
 *
 * Try to arrange for one of @sources_in_provider to be made available
 * at the path @dest_in_container in the container we are creating.
 *
 * Unlike pv_runtime_take_from_provider(), all graphics stack providers
 * are searched.
 *
 * Note that neither @source_in_provider nor @dest_in_container is
 * guaranteed to be an absolute path.
 *
 * %TAKE_FROM_PROVIDER_FLAGS_IF_EXISTS is implied.
 */
static gboolean
pv_runtime_take_any_from_provider (PvRuntime *self,
                                   FlatpakBwrap *bwrap,
                                   const char * const *sources_in_provider,
                                   const char *dest_in_container,
                                   TakeFromProviderFlags flags,
                                   GError **error)
{
  SrtResolveFlags resolve_flags = SRT_RESOLVE_FLAGS_NONE;
  gsize provider_index;

  g_return_val_if_fail (PV_IS_RUNTIME (self), FALSE);
  g_return_val_if_fail (self->providers != NULL, FALSE);
  g_return_val_if_fail (bwrap == NULL || !pv_bwrap_was_finished (bwrap), FALSE);
  g_return_val_if_fail (bwrap != NULL || self->mutable_sysroot != NULL, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  /* _srt_sysroot_open() will only return true if it exists, so we
   * won't need to check again */
  flags &= ~TAKE_FROM_PROVIDER_FLAGS_IF_EXISTS;

  /* Delegate responsibility for this to _srt_sysroot_open() */
  if (flags & TAKE_FROM_PROVIDER_FLAGS_IF_DIR)
    {
      resolve_flags |= SRT_RESOLVE_FLAGS_MUST_BE_DIRECTORY;
      flags &= ~TAKE_FROM_PROVIDER_FLAGS_IF_DIR;
    }

  if (flags & TAKE_FROM_PROVIDER_FLAGS_IF_REGULAR)
    {
      resolve_flags |= SRT_RESOLVE_FLAGS_MUST_BE_REGULAR;
      flags &= ~TAKE_FROM_PROVIDER_FLAGS_IF_REGULAR;
    }

  for (provider_index = 0;
       provider_index < self->providers->len;
       provider_index++)
    {
      PvGraphicsProvider *provider;
      gsize source_index;

      provider = g_ptr_array_index (self->providers, provider_index);

      if (provider->flags & PV_GRAPHICS_PROVIDER_FLAGS_INTERPRETER_HOST)
        continue;

      if (flags & TAKE_FROM_PROVIDER_FLAGS_LOCALES)
        {
          SrtGraphicsProviderFeatureFlags features =
            _srt_graphics_provider_get_features (provider->details);

          if (!(features & SRT_GRAPHICS_PROVIDER_FEATURE_FLAGS_LOCALES))
            {
              g_debug ("Not considering %s for locales",
                       _srt_graphics_provider_describe (provider->details));
              continue;
            }
        }

      for (source_index = 0;
           sources_in_provider[source_index] != NULL;
           source_index++)
        {
          const char *source_in_provider = sources_in_provider[source_index];
          glnx_autofd int fd = -1;
          g_autoptr(GError) local_error = NULL;

          fd = _srt_sysroot_open (provider->in_current_ns,
                                  source_in_provider, resolve_flags,
                                  NULL, &local_error);

          if (fd < 0)
            {
              if (!g_error_matches (local_error, G_IO_ERROR, G_IO_ERROR_NOT_FOUND))
                g_debug ("\"%s/%s\": %s",
                         provider->in_current_ns->path,
                         source_in_provider, local_error->message);

              continue;
            }

          if (!pv_runtime_take_from_provider (self,
                                              provider, source_in_provider,
                                              bwrap, dest_in_container,
                                              flags, error))
            return FALSE;

          return TRUE;
        }
    }

  /* None of the possibilities matched */
  g_debug ("Did not find a suitable \"%s\" in any provider, ignoring",
           dest_in_container);
  return TRUE;
}

static gboolean
pv_runtime_remove_overridden_libraries (PvRuntime *self,
                                        RuntimeArchitecture *arch,
                                        GError **error)
{
  g_autoptr(GPtrArray) dirs = NULL;
  G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) timer = NULL;
  /* Array of hash tables, same length as dirs
   * Keys: basename of a file in dirs[i] to delete
   * Values: path relative to /overrides indicating why we delete the key */
  GHashTable **delete = NULL;
  SrtDirIter *iters = NULL;
  gboolean ret = FALSE;

  g_return_val_if_fail (PV_IS_RUNTIME (self), FALSE);
  g_return_val_if_fail (arch != NULL, FALSE);
  g_return_val_if_fail (arch->ld_so != NULL, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  /* Not applicable/possible if we don't have a mutable sysroot */
  g_return_val_if_fail (self->mutable_sysroot != NULL, FALSE);

  timer = _srt_profiling_start ("Removing overridden %s libraries", arch->tuple);

  dirs = _srt_known_architecture_get_libdirs (arch->tuple,
                                              arch->known_arch,
                                              SRT_LIBDIRS_FLAGS_INCLUDE_NON_STANDARD);
  delete = g_new0 (GHashTable *, dirs->len);
  iters = g_new0 (SrtDirIter, dirs->len);

  for (size_t i = 0; i < dirs->len; i++)
    g_assert (g_path_is_absolute (g_ptr_array_index (dirs, i)));

  /* We have to figure out what we want to delete before we delete anything,
   * because we can't tell whether a symlink points to a library of a
   * particular SONAME if we already deleted the library. */
  for (size_t i = 0; i < dirs->len; i++)
    {
      const char *libdir = g_ptr_array_index (dirs, i);
      glnx_autofd int libdir_fd = -1;
      struct dirent *dent;
      gsize j;

      /* Mostly ignore error: if the library directory cannot be opened,
       * presumably we don't need to do anything with it... */
        {
          g_autoptr(GError) local_error = NULL;

          libdir_fd = _srt_sysroot_open (self->mutable_sysroot, libdir,
                                         (SRT_RESOLVE_FLAGS_READABLE |
                                          SRT_RESOLVE_FLAGS_MUST_BE_DIRECTORY),
                                         NULL, &local_error);

          if (libdir_fd < 0)
            {
              g_debug ("Cannot resolve \"%s\" in mutable sysroot, so no "
                       "need to delete libraries from it: %s",
                       libdir, local_error->message);
              g_clear_error (&local_error);
              continue;
            }

          for (j = 0; j < i; j++)
            {
              /* No need to inspect a directory if it's one we already
               * looked at (perhaps via symbolic links) */
              if (iters[j].real_iter.initialized
                  && _srt_fstatat_is_same_file (libdir_fd, "",
                                                iters[j].real_iter.fd, ""))
                break;
            }

          if (j < i)
            {
              g_debug ("%s is the same directory as %s, skipping it",
                       libdir, (const char *) g_ptr_array_index (dirs, j));
              continue;
            }
        }

      g_debug ("Removing overridden %s libraries from \"%s\" in mutable sysroot...",
               arch->tuple, libdir);

      if (!_srt_dir_iter_init_take_fd (&iters[i], &libdir_fd,
                                       SRT_DIR_ITER_FLAGS_ENSURE_DTYPE,
                                       self->arbitrary_dirent_order,
                                       error))
        {
          glnx_prefix_error (error, "Unable to start iterating \"%s%s\"",
                             self->mutable_sysroot->path,
                             libdir);
          goto out;
        }

      delete[i] = g_hash_table_new_full (g_str_hash, g_str_equal,
                                         g_free, g_free);

      while (TRUE)
        {
          g_autofree gchar *target = NULL;
          const char *target_base;
          struct stat stat_buf;

          if (!_srt_dir_iter_next_dent (&iters[i], &dent, NULL, error))
            {
              glnx_prefix_error (error, "Unable to iterate over \"%s%s\"",
                                 self->mutable_sysroot->path, libdir);
              goto out;
            }

          if (dent == NULL)
            break;

          switch (dent->d_type)
            {
              case DT_REG:
              case DT_LNK:
                break;

              case DT_BLK:
              case DT_CHR:
              case DT_DIR:
              case DT_FIFO:
              case DT_SOCK:
              case DT_UNKNOWN:
              default:
                continue;
            }

          if (!g_str_has_prefix (dent->d_name, "lib"))
            continue;

          if (!g_str_has_suffix (dent->d_name, ".so") &&
              strstr (dent->d_name, ".so.") == NULL)
            continue;

          target = glnx_readlinkat_malloc (iters[i].real_iter.fd, dent->d_name,
                                           NULL, NULL);
          if (target != NULL)
            target_base = glnx_basename (target);
          else
            target_base = NULL;

          /* Suppose we have a shared library libcurl.so.4 -> libcurl.so.4.2.0
           * in the container and libcurl.so.4.7.0 in the provider,
           * with a backwards-compatibility alias libcurl.so.3.
           * dent->d_name might be any of those strings. */

          /* scope for soname_link */
          if (TRUE)   /* to avoid -Wmisleading-indentation */
            {
              g_autofree gchar *soname_link = NULL;

              /* If we're looking at
               * /usr/lib/MULTIARCH/libcurl.so.4 -> libcurl.so.4.2.0, and a
               * symlink .../overrides/lib/MULTIARCH/libcurl.so.4 exists, then
               * we want to delete /usr/lib/MULTIARCH/libcurl.so.4 and
               * /usr/lib/MULTIARCH/libcurl.so.4.2.0. */
              soname_link = g_build_filename (arch->libdir_relative_to_overrides,
                                              dent->d_name, NULL);

              if (fstatat (self->overrides_fd, soname_link, &stat_buf, AT_SYMLINK_NOFOLLOW) == 0
                  && S_ISLNK (stat_buf.st_mode))
                {
                  if (target_base != NULL)
                    g_hash_table_replace (delete[i],
                                          g_strdup (target_base),
                                          g_strdup (soname_link));

                  g_hash_table_replace (delete[i],
                                        g_strdup (dent->d_name),
                                        g_steal_pointer (&soname_link));
                  continue;
                }
            }

          /* scope for alias_link */
          if (TRUE)   /* to avoid -Wmisleading-indentation */
            {
              g_autofree gchar *alias_link = NULL;
              g_autofree gchar *alias_target = NULL;

              /* If we're looking at
               * /usr/lib/MULTIARCH/libcurl.so.3 -> libcurl.so.4, and a
               * symlink .../aliases/libcurl.so.3 exists and points to
               * e.g. .../overrides/lib/$MULTIARCH/libcurl.so.4, then
               * /usr/lib/MULTIARCH/libcurl.so.3 was overridden and should
               * be deleted; /usr/lib/MULTIARCH/libcurl.so.4 should also
               * be deleted.
               *
               * However, if .../aliases/libcurl.so.3 points to
               * e.g. /usr/lib/MULTIARCH/libcurl.so.4, then the container's
               * library was not overridden and we should not delete
               * anything. */
              alias_link = g_build_filename (arch->aliases_relative_to_overrides,
                                             dent->d_name, NULL);
              alias_target = glnx_readlinkat_malloc (self->overrides_fd,
                                                     alias_link,
                                                     NULL, NULL);

              if (alias_target != NULL
                  && flatpak_has_path_prefix (alias_target,
                                              self->overrides_in_container))
                {
                  if (target_base != NULL)
                    g_hash_table_replace (delete[i],
                                          g_strdup (target_base),
                                          g_strdup (alias_link));

                  g_hash_table_replace (delete[i],
                                        g_strdup (dent->d_name),
                                        g_steal_pointer (&alias_link));
                  continue;
                }
            }

          g_assert ((target != NULL) == (target_base != NULL));

          if (target_base != NULL)
            {
              g_autofree gchar *soname_link = NULL;

              /* If we're looking at
               * /usr/lib/MULTIARCH/libcurl.so -> libcurl.so.4, and a
               * symlink .../overrides/lib/MULTIARCH/libcurl.so.4 exists,
               * then we want to delete /usr/lib/MULTIARCH/libcurl.so
               * and /usr/lib/MULTIARCH/libcurl.so.4. */
              soname_link = g_build_filename (arch->libdir_relative_to_overrides,
                                              target_base, NULL);

              if (fstatat (self->overrides_fd, soname_link, &stat_buf, AT_SYMLINK_NOFOLLOW) == 0
                  && S_ISLNK (stat_buf.st_mode))
                {
                  g_hash_table_replace (delete[i],
                                        g_strdup (target_base),
                                        g_strdup (soname_link));
                  g_hash_table_replace (delete[i],
                                        g_strdup (dent->d_name),
                                        g_steal_pointer (&soname_link));
                  continue;
                }
            }

          if (target_base != NULL)
            {
              g_autofree gchar *alias_link = NULL;
              g_autofree gchar *alias_target = NULL;

              /* If we're looking at
               * /usr/lib/MULTIARCH/libcurl.so.3 -> libcurl.so.4, and a
               * symlink .../aliases/libcurl.so.3 exists and points to
               * e.g. .../overrides/lib/$MULTIARCH/libcurl.so.4, then
               * /usr/lib/MULTIARCH/libcurl.so.3 was overridden and should
               * be deleted; /usr/lib/MULTIARCH/libcurl.so.4 should also
               * be deleted.
               *
               * However, if .../aliases/libcurl.so.3 points to
               * e.g. /usr/lib/MULTIARCH/libcurl.so.4, then the container's
               * library was not overridden and we should not delete it. */
              alias_link = g_build_filename (arch->aliases_relative_to_overrides,
                                             target_base, NULL);
              alias_target = glnx_readlinkat_malloc (self->overrides_fd,
                                                     alias_link,
                                                     NULL, NULL);

              if (alias_target != NULL
                  && flatpak_has_path_prefix (alias_target,
                                              self->overrides_in_container))
                {
                  g_hash_table_replace (delete[i],
                                        g_strdup (target_base),
                                        g_strdup (alias_link));
                  g_hash_table_replace (delete[i],
                                        g_strdup (dent->d_name),
                                        g_steal_pointer (&alias_link));
                  continue;
                }
            }
        }

      /* Iterate over the directory again, to clean up dangling development
       * symlinks */
      _srt_dir_iter_rewind (&iters[i]);

      while (TRUE)
        {
          g_autofree gchar *target = NULL;
          gpointer reason;

          if (!_srt_dir_iter_next_dent (&iters[i], &dent, NULL, error))
            {
              glnx_prefix_error (error, "Unable to iterate over \"%s%s\"",
                                 self->mutable_sysroot->path, libdir);
              goto out;
            }

          if (dent == NULL)
            break;

          if (dent->d_type != DT_LNK)
            continue;

          /* If we were going to delete it anyway, ignore */
          if (g_hash_table_lookup_extended (delete[i], dent->d_name, NULL, NULL))
            continue;

          target = glnx_readlinkat_malloc (iters[i].real_iter.fd, dent->d_name,
                                           NULL, NULL);

          /* If we're going to delete the target, also delete the symlink
           * rather than leaving it dangling */
          if (g_hash_table_lookup_extended (delete[i], target, NULL, &reason))
            g_hash_table_replace (delete[i], g_strdup (dent->d_name),
                                  g_strdup (reason));
        }
    }

  for (size_t i = 0; i < dirs->len; i++)
    {
      g_auto(SrtHashTableIter) iter = SRT_HASH_TABLE_ITER_CLEARED;
      const char *libdir = g_ptr_array_index (dirs, i);
      const char *name;
      const char *reason;

      if (delete[i] == NULL)
        continue;

      g_assert (iters[i].real_iter.initialized);
      g_assert (iters[i].real_iter.fd >= 0);

      _srt_hash_table_iter_init_sorted (&iter, delete[i],
                                        self->arbitrary_str_order);

      while (_srt_hash_table_iter_next (&iter, &name, &reason))
        {
          g_autoptr(GError) local_error = NULL;

          g_debug ("Deleting tmp-*%s/%s because overrides/%s replaces it",
                   libdir, name, reason);

          if (!glnx_unlinkat (iters[i].real_iter.fd, name, 0, &local_error))
            {
              g_warning ("Unable to delete %s%s/%s: %s",
                         self->mutable_sysroot->path, libdir,
                         name, local_error->message);
              g_clear_error (&local_error);
            }
        }
    }

  ret = TRUE;

out:
  if (dirs != NULL)
    {
      g_assert (delete != NULL);
      g_assert (iters != NULL);

      for (size_t i = 0; i < dirs->len; i++)
        {
          g_clear_pointer (&delete[i], g_hash_table_unref);
          _srt_dir_iter_clear (&iters[i]);
        }
    }

  g_free (delete);
  g_free (iters);
  return ret;
}

static gboolean
pv_runtime_take_ld_so_from_provider (PvRuntime *self,
                                     RuntimeArchitecture *arch,
                                     const gchar *ld_so_in_runtime,
                                     FlatpakBwrap *bwrap,
                                     GError **error)
{
  glnx_autofd int path_fd = -1;
  g_autofree gchar *ld_so_relative_to_provider = NULL;

  g_return_val_if_fail (arch->provider != NULL, FALSE);
  g_return_val_if_fail (bwrap != NULL || self->mutable_sysroot != NULL, FALSE);

  g_debug ("Making provider's ld.so visible in container");

  path_fd = _srt_sysroot_open (arch->provider->in_current_ns, arch->ld_so,
                               SRT_RESOLVE_FLAGS_READABLE,
                               &ld_so_relative_to_provider, error);

  if (path_fd < 0)
    {
      g_prefix_error (error, "Unable to determine provider path to %s: ",
                      arch->ld_so);
      return FALSE;
    }

  g_debug ("Provider path: %s -> %s", arch->ld_so, ld_so_relative_to_provider);
  /* Might be either absolute, or relative to the root */
  g_debug ("Container path: %s -> %s", arch->ld_so, ld_so_in_runtime);

  /* If we have a mutable sysroot, we can delete the interoperable path
   * and replace it with a symlink to what we want.
   * For example, overwrite /lib/ld-linux.so.2 with a symlink to
   * /run/host/lib/i386-linux-gnu/ld-2.30.so, or similar. This avoids
   * having to dereference a long chain of symlinks every time we run
   * an executable. */
  if (self->mutable_sysroot != NULL &&
      !pv_runtime_take_from_provider (self,
                                      arch->provider, ld_so_relative_to_provider,
                                      bwrap, arch->ld_so,
                                      TAKE_FROM_PROVIDER_FLAGS_NONE, error))
    return FALSE;

  /* If we don't have a mutable sysroot, we cannot replace symlinks,
   * and we also cannot mount onto symlinks (they get dereferenced),
   * so our only choice is to bind-mount
   * /lib/i386-linux-gnu/ld-2.30.so onto
   * /lib/i386-linux-gnu/ld-2.15.so and so on.
   *
   * In the mutable sysroot case, we don't strictly need to
   * overwrite /lib/i386-linux-gnu/ld-2.15.so with a symlink to
   * /run/host/lib/i386-linux-gnu/ld-2.30.so, but we might as well do
   * it anyway, for extra robustness: if we ever run a ld.so that
   * doesn't match the libc we are using (perhaps via an OS-specific,
   * non-standard path), that's pretty much a disaster, because it will
   * just crash. However, all of those (chains of) non-standard symlinks
   * will end up pointing to ld_so_in_runtime. */
  return pv_runtime_take_from_provider (self,
                                        arch->provider, ld_so_relative_to_provider,
                                        bwrap, ld_so_in_runtime,
                                        TAKE_FROM_PROVIDER_FLAGS_NONE, error);
}

/*
 * @json_set: Ignored and may be %NULL for OpenXR runtimes,
 *  OpenXR layers and Vulkan layers.
 *  Required for other file types.
 */
static char *
get_manifest_relative_to_overrides (PvRuntime *self,
                                    gpointer icd,
                                    const char *sub_dir,
                                    const SrtKnownArchitecture *arch,
                                    int digits,
                                    gsize seq,
                                    const char *json_basename,
                                    GHashTable *json_set)
{
  /* For layers, we know that the filename doesn't matter - choice
   * of layers is based on manifest["layer"]["name"] - but we have
   * to make sure they're all unique and in the same directory.
   * This is because OpenXR has no equivalent of XR_API_LAYER_PATH for
   * implicit layers,
   * and similarly Vulkan-Loader before 1.3.296 didn't have
   * VK_IMPLICIT_LAYER_PATH (and we can't rely on having a version that new).
   * This means that the only thing we can
   * do is to add our directory to XDG_DATA_DIRS. Because we have
   * to do this for implicit layers anyway, for simplicity we do
   * the same thing for explicit layers. */
  if (SRT_IS_VULKAN_LAYER (icd)
      || SRT_IS_OPENXR_1_LAYER (icd))
    {
      if (arch != NULL)
        return g_strdup_printf ("%s/%.*" G_GSIZE_FORMAT "-%s.json",
                                sub_dir, digits, seq, arch->multiarch_tuple);
      else
        return g_strdup_printf ("%s/%.*" G_GSIZE_FORMAT ".json",
                                sub_dir, digits, seq);
    }
  /* OpenXR 1 runtimes need to be in a fixed location, but each architecture has
   * at most one active runtime, so they can't collide with each other. */
  else if (SRT_IS_OPENXR_1_RUNTIME (icd)
           && arch != NULL
           && arch->openxr_1_architecture != NULL)
    {
      GQuark primary_arch;

      g_assert (self->tuples->len > 0);
      primary_arch = g_array_index (self->tuples, GQuark, 0);

      /* Older versions of the OpenXR loader don't support architecture-specific
       * filenames, so name the primary architecture as the default instead,
       * that way at least it can be loaded as expected. */
      if (g_str_equal (arch->multiarch_tuple, g_quark_to_string (primary_arch)))
        return g_strdup_printf ("%s/active_runtime.json", sub_dir);
      else
        return g_strdup_printf ("%s/active_runtime.%s.json",
                                sub_dir, arch->openxr_1_architecture);
    }
  else
    {
      g_assert (json_set != NULL);
      return pv_generate_unique_filepath (sub_dir, digits, seq, json_basename,
                                          arch ? arch->multiarch_tuple : NULL,
                                          json_set);
    }
}

/*
 * setup_json_manifest:
 * @self: The runtime
 * @bwrap: Append arguments to this bubblewrap invocation to make files
 *  available in the container
 * @sub_dir: `share/vulkan/icd.d`, `share/glvnd/egl_vendor.d` or similar,
 *  relative to `/overrides`
 * @details: An #IcdDetails holding a #SrtVulkanLayer or #SrtVulkanIcd,
 *  whichever is appropriate for @sub_dir
 * @digits: Number of digits to pad length of numeric prefix
 * @seq: Sequence number of @details, used to make unique filenames
 * @json_set: (element-type filename ignored) (nullable): A map
 *  `{ owned string => itself }` representing the set
 *  of JSON manifests already created. Used internally to notice when
 *  to use unique sub directories to avoid naming conflicts. Ignored and may be
 *  %NULL for OpenXR runtimes and Vulkan layers. Required for other file types.
 * @search_path: Used to build `$VK_DRIVER_FILES` or a similar search path
 * @error: Used to raise an error on failure
 *
 * Make a single Vulkan layer or ICD available in the container.
 */
static gboolean
setup_json_manifest (PvRuntime *self,
                     FlatpakBwrap *bwrap,
                     const gchar *sub_dir,
                     IcdDetails *details,
                     int digits,
                     gsize seq,
                     GHashTable *json_set,
                     GString *search_path,
                     GError **error)
{
  SrtBaseGraphicsModule *base = NULL;
  SrtBaseJsonGraphicsModule *module = NULL;
  SrtVulkanLayer *layer = NULL;
  SrtVulkanIcd *icd = NULL;
  SrtEglIcd *egl = NULL;
  SrtEglExternalPlatform *ext_platform = NULL;
  SrtOpenXr1Runtime *xr_rt = NULL;
  SrtOpenXr1Layer *xr_layer = NULL;
  gboolean need_provider_json = FALSE;
  const SrtKnownArchitecture *provider_json_arch = NULL;
  g_autofree gchar *json_basename = NULL;
  const char *json_in_provider = NULL;
  const char *library_arch = NULL;

  g_return_val_if_fail (details->provider != NULL, FALSE);
  g_return_val_if_fail (bwrap != NULL || self->mutable_sysroot != NULL, FALSE);
  g_return_val_if_fail (sub_dir != NULL, FALSE);

  module = SRT_BASE_JSON_GRAPHICS_MODULE (details->icd);
  base = &module->parent;
  g_return_val_if_fail (base->error == NULL, FALSE);

  json_in_provider = module->json_path;
  library_arch = module->library_arch;

  if (SRT_IS_VULKAN_LAYER (details->icd))
    {
      layer = SRT_VULKAN_LAYER (details->icd);
    }
  else if (SRT_IS_VULKAN_ICD (details->icd))
    {
      icd = SRT_VULKAN_ICD (details->icd);
    }
  else if (SRT_IS_EGL_ICD (details->icd))
    {
      egl = SRT_EGL_ICD (details->icd);
    }
  else if (SRT_IS_EGL_EXTERNAL_PLATFORM (details->icd))
    {
      ext_platform = SRT_EGL_EXTERNAL_PLATFORM (details->icd);
    }
  else if (SRT_IS_OPENXR_1_RUNTIME (details->icd))
    {
      xr_rt = SRT_OPENXR_1_RUNTIME (details->icd);
    }
  else if (SRT_IS_OPENXR_1_LAYER (details->icd))
    {
      xr_layer = SRT_OPENXR_1_LAYER (details->icd);
    }
  else
    {
      g_return_val_if_reached (FALSE);
    }

  json_basename = g_path_get_basename (json_in_provider);

  g_debug ("Setting up JSON manifest for \"%s\" loadable module \"%s\": \"%s\"",
           sub_dir, json_basename, details->debug_name);

  for (size_t i = 0; i < self->tuples->len; i++)
    {
      GQuark tuple_quark = g_array_index (self->tuples, GQuark, i);
      const char *tuple = g_quark_to_string (tuple_quark);
      const PvModulePerArch *details_arch;
      const SrtKnownArchitecture *arch;
      g_autofree gchar *arch_bits = NULL;
      gboolean write_per_architecture;

      details_arch = icd_details_get_architecture (details, tuple_quark);

      if (details_arch == NULL)
        {
          g_debug ("%s[%s]: not applicable", details->debug_name, tuple);
          continue;
        }

      switch (details_arch->kind)
        {
          case ICD_KIND_ABSOLUTE:
            /* We need to generate a new JSON manifest with the
             * library_path updated to its in-container value */
            g_debug ("%s[%s]: absolute path, will generate new manifest",
                     details->debug_name, tuple);
            write_per_architecture = TRUE;
            break;

          case ICD_KIND_SONAME:
            if (details->in_n_providers == self->providers->len)
              {
                g_debug ("%s[%s]: exists in every provider with same content, "
                         "can use first provider's manifest as-is",
                         details->debug_name, tuple);
                write_per_architecture = FALSE;
              }
            else
              {
                g_debug ("%s[%s]: not the same in all providers, "
                         "will generate new manifest",
                         details->debug_name, tuple);
                write_per_architecture = TRUE;
              }
            break;

          case ICD_KIND_META_LAYER:
            /* There is no library_path that we can rewrite,
             * and no other way to make it architecture-specific */
            g_debug ("%s[%s]: meta-layer, must use manifest as-is",
                     details->debug_name, tuple);
            write_per_architecture = FALSE;
            break;

          case ICD_KIND_NONEXISTENT:
          case ICD_KIND_IGNORED:
          case ICD_KIND_UNDECIDED:
          default:
            /* icd_details_get_architecture() should not
             * return these types */
            g_warn_if_reached ();
            continue;
        }

      arch = _srt_architecture_get_by_tuple (tuple);

      if (arch != NULL && arch->sizeof_pointer > 0)
        arch_bits = g_strdup_printf ("%u", arch->sizeof_pointer * 8);

      if (write_per_architecture)
        {
          g_autofree gchar *write_to_file = NULL;
          g_autofree gchar *write_to_dir = NULL;
          g_autofree gchar *json_in_container = NULL;
          g_autofree gchar *relative_to_overrides = NULL;

          g_assert (details_arch->path_in_container != NULL);

          relative_to_overrides = get_manifest_relative_to_overrides (self,
                                                                      details->icd,
                                                                      sub_dir,
                                                                      arch,
                                                                      digits,
                                                                      seq,
                                                                      json_basename,
                                                                      json_set);

          write_to_file = g_build_filename (self->overrides,
                                            relative_to_overrides, NULL);
          write_to_dir = g_path_get_dirname (write_to_file);
          json_in_container = g_build_filename (self->overrides_in_container,
                                                relative_to_overrides, NULL);

          if (g_mkdir_with_parents (write_to_dir, 0700) != 0)
            {
              glnx_throw_errno_prefix (error, "Unable to create %s", write_to_dir);
              return FALSE;
            }

          g_debug ("Generating \"overrides/%s\" with path \"%s\"",
                   relative_to_overrides, details_arch->path_in_container);

          if (layer != NULL)
            {
              g_autoptr(SrtVulkanLayer) replacement = NULL;
              replacement = srt_vulkan_layer_new_replace_library_path (layer,
                                                                       details_arch->path_in_container);

              if (arch_bits != NULL && library_arch == NULL)
                _srt_vulkan_layer_set_library_arch (replacement, arch_bits);

              if (!srt_vulkan_layer_write_to_file (replacement, write_to_file, error))
                return FALSE;
            }
          else if (egl != NULL)
            {
              g_autoptr(SrtEglIcd) replacement = NULL;

              replacement = srt_egl_icd_new_replace_library_path (egl,
                                                                  details_arch->path_in_container);

              if (!srt_egl_icd_write_to_file (replacement, write_to_file,
                                              error))
                return FALSE;
            }
          else if (ext_platform != NULL)
            {
              g_autoptr(SrtEglExternalPlatform) replacement = NULL;

              replacement = srt_egl_external_platform_new_replace_library_path (ext_platform,
                                                                                details_arch->path_in_container);

              if (!srt_egl_external_platform_write_to_file (replacement, write_to_file, error))
                return FALSE;
            }
          else if (icd != NULL)
            {
              g_autoptr(SrtVulkanIcd) replacement = NULL;
              replacement = srt_vulkan_icd_new_replace_library_path (icd,
                                                                     details_arch->path_in_container);

              if (arch_bits != NULL && library_arch == NULL)
                _srt_vulkan_icd_set_library_arch (replacement, arch_bits);

              if (!srt_vulkan_icd_write_to_file (replacement, write_to_file, error))
                return FALSE;
            }
          else if (xr_rt != NULL)
            {
              g_autoptr(SrtOpenXr1Runtime) replacement = NULL;
              replacement = srt_openxr_1_runtime_new_replace_library_path (xr_rt,
                                                                           details_arch->path_in_container);

              if (!srt_openxr_1_runtime_write_to_file (replacement, write_to_file, error))
                return FALSE;
            }
          else if (xr_layer != NULL)
            {
              g_autoptr(SrtOpenXr1Layer) replacement = NULL;
              replacement = srt_openxr_1_layer_new_replace_library_path (xr_layer,
                                                                         details_arch->path_in_container);

              if (!srt_openxr_1_layer_write_to_file (replacement, write_to_file, error))
                return FALSE;
            }
          else
            {
              g_return_val_if_reached (FALSE);
            }

          _srt_search_path_append (search_path, json_in_container);
        }
      else
        {
          g_debug ("Will use graphics stack provider JSON as-is for %s/%s",
                   sub_dir, json_basename);
          need_provider_json = TRUE;

          if (xr_rt != NULL)
            {
              /* We bind in an OpenXR runtime *per architecture*, so only one
               * architecture at most should be here. */
              g_warn_if_fail (provider_json_arch == NULL);
              provider_json_arch = arch;
            }
        }
    }

  if (need_provider_json)
    {
      g_autofree gchar *relative_to_overrides = NULL;
      g_autofree gchar *json_in_container = NULL;

      relative_to_overrides = get_manifest_relative_to_overrides (self,
                                                                  details->icd,
                                                                  sub_dir,
                                                                  provider_json_arch,
                                                                  digits,
                                                                  seq,
                                                                  json_basename,
                                                                  json_set);
      json_in_container = g_build_filename (self->overrides_in_container,
                                            relative_to_overrides, NULL);

      g_debug ("Copying \"%s\" as-is to implement \"%s\" in container",
               json_in_provider, json_in_container);

      if (!pv_runtime_take_from_provider (self,
                                          details->provider, json_in_provider,
                                          bwrap, json_in_container,
                                          (TAKE_FROM_PROVIDER_FLAGS_COPY_FALLBACK
                                           | TAKE_FROM_PROVIDER_FLAGS_REALPATH),
                                          error))
        return FALSE;

      _srt_search_path_append (search_path, json_in_container);
    }

  return TRUE;
}

/*
 * setup_each_json_manifest:
 * @self: The runtime
 * @bwrap: Append arguments to this bubblewrap invocation to make files
 *  available in the container
 * @sub_dir: `share/vulkan/icd.d` or similar, relative to `/overrides`
 * @details: (element-type IcdDetails): A list of #IcdDetails
 *  holding #SrtVulkanLayer, #SrtVulkanIcd or #SrtEglIcd, as appropriate
 *  for @sub_dir
 * @search_path: Used to build `$VK_DRIVER_FILES` or a similar search path
 * @error: Used to raise an error on failure
 *
 * Make a list of Vulkan layers or ICDs available in the container.
 * We do this by rewriting their JSON manifests with the library_path
 * replaced by a path appropriate for the container, and dropping the
 * rewritten manifests into ${overrides}. Later, we'll set the search-path
 * environment variables to search ${overrides}.
 */
static gboolean
setup_each_json_manifest (PvRuntime *self,
                          FlatpakBwrap *bwrap,
                          const gchar *sub_dir,
                          GPtrArray *details,
                          GString *search_path,
                          GError **error)
{
  g_autoptr(GHashTable) json_set = NULL;
  g_auto(PvManifestDeduplicator) deduplicator = PV_MANIFEST_DEDUPLICATOR_INIT;
  int digits = pv_count_decimal_digits (details->len);

  g_return_val_if_fail (self->providers != NULL, FALSE);
  g_return_val_if_fail (bwrap != NULL || self->mutable_sysroot != NULL, FALSE);

  json_set = g_hash_table_new_full (g_str_hash, g_str_equal, g_free, NULL);
  pv_manifest_deduplicator_init (&deduplicator);

  /* If we are using more than one graphics stack provider, we could see
   * more than one identical copy of files like nvidia_icd.json, each
   * listing a SONAME which can be loaded equally well by more than one
   * architecture. Deduplicate them by their content.
   *
   * Similarly, in a Flatpak environment with i386 multiarch compatibility,
   * we can see two identical copies of files like nvidia_icd.json,
   * each listing a SONAME which can be loaded equally well by both
   * word sizes.
   *
   * Layers don't need this treatment, because Vulkan-Loader will
   * deduplicate those by their names anyway.
   *
   * Mesa also doesn't need (or get) this treatment, because it installs
   * per-architecture filenames like radeon_icd.x86_64.json, which
   * contain absolute paths that will only work for the appropriate
   * architecture. */
  pv_manifest_deduplicator_populate (&deduplicator,
                                     (IcdDetails **) details->pdata,
                                     details->len);

  for (size_t j = 0; j < details->len; j++)
    {
      IcdDetails *d = g_ptr_array_index (details, j);

      if (!d->is_duplicate
          && !setup_json_manifest (self, bwrap, sub_dir, d,
                                   digits, j, json_set,
                                   search_path, error))
        return FALSE;
    }

  return TRUE;
}

/*
 * @details_arr: (element-type IcdDetails):
 * @patterns: (element-type filename):
 */
static gboolean
collect_json_based_drivers (PvRuntime *self,
                            RuntimeArchitecture *arch,
                            const char *description,
                            const GPtrArray *details_arr,
                            const gchar *bind_icds_subdir,
                            GPtrArray *libdir_patterns,
                            GError **error)
{
  /* We don't have to use multiple directories unless there are
   * filename collisions, because the order of the JSON manifests
   * might matter, but the order of the actual libraries does not
   * (this is true for all the JSON-based driver families we currently
   * support). */
  gboolean use_numbered_subdirs = FALSE;
  G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) timer =
    _srt_profiling_start ("Collecting %s", description);

  g_return_val_if_fail (arch->provider != NULL, FALSE);
  g_return_val_if_fail (details_arr != NULL, FALSE);
  g_return_val_if_fail (libdir_patterns != NULL, FALSE);
  g_return_val_if_fail (bind_icds_subdir != NULL, FALSE);

  g_debug ("Collecting %s %s from provider...", arch->tuple, description);

  for (size_t j = 0; j < details_arr->len; j++)
    {
      IcdDetails *details = g_ptr_array_index (details_arr, j);

      icd_details_populate_architecture (details,
                                         arch->tuple_quark,
                                         arch->known_arch);
    }

  if (!bind_icds (self, arch, bind_icds_subdir,
                  (IcdDetails **) details_arr->pdata,
                  details_arr->len,
                  &use_numbered_subdirs, libdir_patterns, NULL, error))
    return FALSE;

  return TRUE;
}

/*
 * @openxr_1_runtime_details: (element-type utf8 IcdDetails):
 *   { multiarch tuple => IcdDetails containing an SrtOpenXr1Runtime }
 * @patterns: (element-type filename):
 */
static gboolean
collect_openxr_1_runtime (PvRuntime *self,
                          RuntimeArchitecture *arch,
                          GHashTable *openxr_1_runtime_details,
                          GPtrArray *patterns,
                          GError **error)
{
  G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) timer =
    _srt_profiling_start ("Collecting OpenXR 1 runtimes");
  SrtOpenXr1Runtime *rt;
  IcdDetails *details;
  /* We don't have to use multiple directories because there is at most one
   * active runtime per architecture, so filenames cannot collide */
  gboolean use_numbered_subdirs = FALSE;

  g_debug ("Collecting %s OpenXR 1 runtime from provider...", arch->tuple);

  details = g_hash_table_lookup (openxr_1_runtime_details, arch->tuple);
  if (details == NULL)
    return TRUE;

  rt = SRT_OPENXR_1_RUNTIME (details->icd);

  g_return_val_if_fail (srt_openxr_1_runtime_check_error (rt, NULL), TRUE);

  icd_details_populate_architecture (details,
                                     arch->tuple_quark,
                                     arch->known_arch);

  if (!bind_icds (self, arch, "openxr/1", &details, 1, &use_numbered_subdirs,
                  patterns, NULL, error))
    return FALSE;

  return TRUE;
}

/*
 * @self: the runtime
 * @arch: An architecture
 * @ld_so_in_runtime: (out) (nullable) (not optional): Used to return
 *  the path to the architecture's ld.so in the runtime, or to
 *  return %NULL if there is none.
 * @error: Used to raise an error on failure
 *
 * Get the path to the ld.so in the runtime, which is either absolute
 * or relative to the sysroot.
 *
 * Returns: %TRUE on success (possibly yielding %NULL via @ld_so_in_runtime)
 */
static gboolean
pv_runtime_get_ld_so (PvRuntime *self,
                      RuntimeArchitecture *arch,
                      gchar **ld_so_in_runtime,
                      GError **error)
{
  if (self->mutable_sysroot != NULL)
    {
      G_GNUC_UNUSED glnx_autofd int fd = -1;

      fd = _srt_sysroot_open (self->mutable_sysroot, arch->ld_so,
                              SRT_RESOLVE_FLAGS_NONE,
                              ld_so_in_runtime, NULL);

      /* Ignore fd, and just let it close: we're resolving
       * the path for its side-effect of populating
       * ld_so_in_runtime. */
    }
  else
    {
      g_autoptr(SrtSubprocessRunner) runner = NULL;
      g_autoptr(FlatpakBwrap) temp_bwrap = NULL;
      g_autofree gchar *etc = NULL;

      /* When setting up an interpreter root, for simplicity we require
       * the easier mutable sysroot code-path. */
      g_return_val_if_fail (!(self->flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT), FALSE);

      if (self->bubblewrap == NULL)
        return glnx_throw (error,
                           "Cannot run bubblewrap to set up runtime");

      /* Do it the hard way, by asking a process running in the
       * container (or at least a container resembling the one we
       * are going to use) to resolve it for us */
      temp_bwrap = flatpak_bwrap_new (NULL);
      flatpak_bwrap_add_args (temp_bwrap,
                              self->bubblewrap,
                              NULL);

      if (!pv_bwrap_bind_usr (temp_bwrap,
                              self->runtime_files_on_host,
                              self->runtime_files_fd,
                              "/",
                              error))
        return FALSE;

      etc = g_build_filename (self->runtime_files_on_host,
                              "etc", NULL);
      /* Intentionally not using pv_runtime_bind_into_container for this
       * temporary adverb command; by the time we get here, we know we
       * are not using an interpreter root anyway */
      flatpak_bwrap_add_args (temp_bwrap,
                              "--ro-bind",
                              etc,
                              "/etc",
                              NULL);

      if (arch->provider != NULL)
        {
          g_autofree gchar *provider_etc = NULL;
          g_autofree gchar *provider_etc_dest = NULL;

          if (!pv_bwrap_bind_usr (temp_bwrap,
                                  arch->provider->path_in_host_ns,
                                  arch->provider->in_current_ns->fd,
                                  arch->provider->path_in_container_ns,
                                  error))
            return FALSE;

          provider_etc = g_build_filename (arch->provider->path_in_host_ns,
                                           "etc", NULL);
          provider_etc_dest = g_build_filename (arch->provider->path_in_container_ns,
                                                "etc", NULL);
          /* Using --ro-bind directly, as above */
          flatpak_bwrap_add_args (temp_bwrap,
                                  "--ro-bind",
                                  provider_etc,
                                  provider_etc_dest,
                                  NULL);
        }

      flatpak_bwrap_set_env (temp_bwrap, "PATH", "/usr/bin:/bin", TRUE);
      flatpak_bwrap_add_args (temp_bwrap,
                              "readlink", "-e", arch->ld_so,
                              NULL);
      flatpak_bwrap_finish (temp_bwrap);

      /* We can't use arch->runner directly, because we
       * altered the PATH above */
      runner = _srt_subprocess_runner_new_swap_envp (arch->runner,
                                                     _srt_const_strv (temp_bwrap->envp));
      /* Assume bwrap can be run without a special emulator (native
       * executable or transparent emulation) */
      pv_run_sync (runner,
                   SRT_ARCHITECTURE_QUARK_NONE,
                   (const char * const *) temp_bwrap->argv->pdata,
                   NULL,    /* wait status */
                   ld_so_in_runtime,
                   NULL);
    }

  return TRUE;
}

/*
 * @patterns: (inout) (not nullable):
 */
static void
collect_graphics_libraries_patterns (PvRuntime *self,
                                     RuntimeArchitecture *arch,
                                     GPtrArray *patterns)
{
  static const char * const literal_patterns[] =
  {
    /* Mesa GLX, etc. */
    "gl:",
  };
  static const char * const sonames[] =
  {
    /* Vulkan */
    "libvulkan.so.1",

    /* VDPAU */
    "libvdpau.so.1",

    /* VA-API */
    "libva.so.1",
    "libva-drm.so.1",
    "libva-glx.so.1",
    "libva-x11.so.1",
    "libva.so.2",
    "libva-drm.so.2",
    "libva-glx.so.2",
    "libva-x11.so.2",

    /* Dependencies that might come in via dlopen() */
    "libdrm.so.2",
    "libdrm_amdgpu.so.1",
    "libdrm_etnaviv.so.1",
    "libdrm_freedreno.so.1",
    "libdrm_intel.so.1",
    "libdrm_nouveau.so.2",
    "libdrm_radeon.so.1",
    "libdrm_tegra.so.0",

  };
  static const char * const sonames_even_if_older[] =
  {
    /* Vendor-neutral (GLVND) */
    "libEGL.so.1",
    "libGL.so.1",
    "libGLESv1_CM.so.1",
    "libGLESv2.so.2",
    "libGLX.so.0",
    "libGLX_indirect.so.0",
    "libGLdispatch.so.0",
    "libOpenCL.so.1",
    "libOpenGL.so.0",

    /* Mesa open-source stack */
    "libEGL_mesa.so.0",
    "libGLX_mesa.so.0",

    /* NVIDIA proprietary stack: this is only the app-facing entry points,
     * and not the driver internals with no stable SONAME like -glcore
     * (which are listed in nvidia_private[] below).
     * TODO: It would be better if these came from some sort of manifest:
     * https://gitlab.steamos.cloud/steamrt/steam-runtime-tools/-/issues/123 */
    "libEGL_nvidia.so.0",
    "libGLESv1_CM_nvidia.so.1",
    "libGLESv2_nvidia.so.2",
    "libGLX_nvidia.so.0",
    "libXNVCtrl.so.0",
    "libcuda.so.1",
    "libcudadebugger.so.1",
    "libnvcuvid.so.1",
    "libnvidia-allocator.so.1",
    "libnvidia-api.so.1",
    "libnvidia-cfg.so.1",
    "libnvidia-egl-gbm.so.1",
    "libnvidia-egl-wayland.so.1",
    "libnvidia-egl-wayland2.so.1",
    "libnvidia-egl-xcb.so.1",
    "libnvidia-egl-xlib.so.1",
    "libnvidia-encode.so.1",
    "libnvidia-fbc.so.1",
    "libnvidia-ifr.so.1",
    "libnvidia-ml.so.1",
    "libnvidia-ngx.so.1",
    "libnvidia-nvvm.so.4",
    "libnvidia-nvvm70.so.4",
    "libnvidia-opencl.so.1",
    "libnvidia-opticalflow.so.1",
    "libnvidia-ptxjitcompiler.so.1",
    "libnvoptix.so.1",
    "libvdpau_nvidia.so.1",
  };
  /*
   * In principle we could have another array soname_globs[]
   * here, but in practice the libraries that we want to match with
   * wildcards are the same ones we want to take from the host even if
   * they're older than the ones in the runtime: games are expected to
   * look up symbols in all of these libraries with dlsym(), except for
   * a few core symbols that have existed since time immemorial.
   */
  static const char * const soname_globs_even_if_older[] =
  {
    /* Vendor-neutral (GLVND) */
    "libEGL.so.*",
    "libGL.so.*",
    "libGLESv1_CM.so.*",
    "libGLESv2.so.*",
    "libGLX.so.*",
    "libGLX_indirect.so.*",
    "libGLdispatch.so.*",
    "libOpenCL.so.*",
    "libOpenGL.so.*",

    /* NVIDIA proprietary stack */
    "libEGL_nvidia.so.*",
    "libGLESv1_CM_nvidia.so.*",
    "libGLESv2_nvidia.so.*",
    "libGLX_nvidia.so.*",
    "libXNVCtrl.so.*",
    "libcuda.so.*",
    "libcudadebugger.so.*",
    "libglx.so.*",
    "libnvcuvid.so.*",
    "libnvidia-allocator.so.*",
    "libnvidia-api.so.*",
    "libnvidia-cbl.so.*",
    "libnvidia-cfg.so.*",
    "libnvidia-compiler.so.*",
    "libnvidia-egl-*.so.*",
    "libnvidia-eglcore.so.*",
    "libnvidia-encode.so.*",
    "libnvidia-fatbinaryloader.so.*",
    "libnvidia-fbc.so.*",
    "libnvidia-glcore.so.*",
    "libnvidia-glsi.so.*",
    "libnvidia-glvkspirv.so.*",
    "libnvidia-gpucomp.so.*",
    "libnvidia-ifr.so.*",
    "libnvidia-ml.so.*",
    "libnvidia-ngx.so.*",
    "libnvidia-nvvm*.so.*",
    "libnvidia-opencl.so.*",
    "libnvidia-opticalflow.so.*",
    "libnvidia-present.so.*",
    "libnvidia-ptxjitcompiler.so.*",
    "libnvidia-rtcore.so.*",
    "libnvidia-tileiras.so.*",
    "libnvidia-tls.so.*",
    "libnvidia-vulkan-producer.so.*",
    "libnvoptix.so.*",
    "libvdpau_nvidia.so.*",
  };
  /* Each of these is substituted into libnvidia-NAME.so.VERSION.
   * TODO: It would be better if these came from some sort of manifest:
   * https://gitlab.steamos.cloud/steamrt/steam-runtime-tools/-/issues/123 */
  static const char * const nvidia_private[] =
  {
    "eglcore",
    "glcore",
    "glsi",
    "glvkspirv",
    "gpucomp",
    "rtcore",
    "tls",
    "vulkan-producer",
  };
  /*
   * Nvidia libraries that we intentionally do not include:
   * libnvidia-gtk* (nvidia-settings): depends on GLib, GTK
   * libnvidia-sandboxutils.so.1: believed to be only useful on the host
   * libnvidia-vksc-core.so.1: Vulkan-safety-critical ICD, not relevant for gaming
   * libnvidia-wayland-client.so.* (nvidia-settings): assumed only relevant on host
   */
  g_autofree gchar *nvidia_version = NULL;

  g_return_if_fail (patterns != NULL);

  for (size_t i = 0; i < G_N_ELEMENTS (literal_patterns); i++)
    g_ptr_array_add (patterns, g_strdup (literal_patterns[i]));

  for (size_t i = 0; i < G_N_ELEMENTS (sonames); i++)
    g_ptr_array_add (patterns,
                     g_strdup_printf ("if-exists:if-same-abi:soname:%s",
                                      sonames[i]));

  for (size_t i = 0; i < G_N_ELEMENTS (sonames_even_if_older); i++)
    g_ptr_array_add (patterns,
                     g_strdup_printf ("if-exists:even-if-older:if-same-abi:soname:%s",
                                      sonames_even_if_older[i]));

  for (size_t i = 0; i < G_N_ELEMENTS (soname_globs_even_if_older); i++)
    g_ptr_array_add (patterns,
                     g_strdup_printf ("if-exists:even-if-older:soname-match:%s",
                                      soname_globs_even_if_older[i]));

  if (g_file_get_contents ("/sys/module/nvidia/version",
                           &nvidia_version, NULL, NULL))
    {
      g_strstrip (nvidia_version);

      for (size_t i = 0; i < G_N_ELEMENTS (nvidia_private); i++)
        g_ptr_array_add (patterns,
                         g_strdup_printf ("if-exists:even-if-older:soname:libnvidia-%s.so.%s",
                                          nvidia_private[i], nvidia_version));
    }
}

static void
collect_core_libraries_patterns (PvRuntime *self,
                                 RuntimeArchitecture *arch,
                                 GPtrArray *patterns)
{
  /* libudev.so.0 and libudev.so.1 have an ABI that is so close that people
   * sometimes create a symlink libudev.so.0 -> libudev.so.1, even though
   * that's technically incorrect. However, if we capture that library into
   * the container, it breaks our use of ldconfig. */
  static const char * const exact_sonames[] =
  {
    /* We dlopen libsystemd.so.0 for logging to the Journal.
     * In principle we could skip this if the runtime already has it
     * (in practice all since soldier do) and the architecture of pv-adverb
     * is one of the architectures of the runtime, but there's no real reason
     * to go to a lot of effort not to import this. */
    "libsystemd.so.0",
    /* If we have libudev from the graphics-stack provider (in practice
     * the host system), it's a lot more likely to be able to understand
     * the data in /run/udev, which is private to the version of udevd
     * and its corresponding libudev. However, it's only safe to do this
     * if it's equal to or newer than the version in the runtime. */
    "libudev.so.1",
    /* Some newer distributions (at least Arch and Debian) have a
     * libudev.so.0 shim implemented in terms of libudev.so.1, which
     * we'll want to use if available. Meanwhile, some older distributions
     * genuinely used libudev.so.0. */
    "libudev.so.0",
  };
  SrtEmulator *emulator;

  g_return_if_fail (patterns != NULL);

  emulator = _srt_subprocess_runner_get_emulator (self->run_in_current_context);

  if (emulator != NULL)
    {
      const GQuark *required_archs;
      size_t n;

      required_archs = _srt_emulator_get_required_architectures (emulator, &n);

      for (size_t i = 0; i < n; i++)
        {
          if (required_archs[i] == arch->tuple_quark)
            {
              /* If we can't find the library, we err on the side of
               * just failing to capture it and trying to continue anyway.
               * The worst that can happen is that the emulator doesn't work,
               * and that's no worse than pressure-vessel failing to work. */
              static const char mode[] = "if-exists:if-same-abi";
              const char * const *libraries;

              libraries = _srt_emulator_get_required_libraries (emulator);

              /* Assume we will always need glibc for emulators,
               * if only for its ELF interpreter,
               * even if not explicitly declared.
               * This automatically pulls in the rest of its family:
               * libm.so.6, libdl.so.1 and so on. */
              if (libraries == NULL
                  || !g_strv_contains (libraries, "libc.so.6"))
                g_ptr_array_add (patterns,
                                 g_strdup_printf ("%s:libc.so.6", mode));

              if (libraries != NULL && libraries[0] != NULL)
                {
                  for (size_t j = 0; libraries[j] != NULL; j++)
                    {
                      g_debug ("Emulator requires %s", libraries[j]);
                      g_ptr_array_add (patterns,
                                       g_strdup_printf ("%s:%s",
                                                        mode, libraries[j]));
                    }
                }
              else
                {
                  g_debug ("Emulator requires no libraries except maybe libc");
                }

              break;
            }
        }
    }

  for (size_t i = 0; i < G_N_ELEMENTS (exact_sonames); i++)
    g_ptr_array_add (patterns,
                     g_strdup_printf ("if-exists:if-same-abi:exact-soname:%s",
                                      exact_sonames[i]));
}

typedef struct
{
  /* SONAME of "main" library.
   * This is assumed to add new ABI with each new version (or with each
   * new version that matters), and the relatives[] are assumed to
   * depend on it. */
  const char *soname;
  /* capsule-capture-libs patterns matching closely related libraries. */
  const char * relatives[10];
} LibraryFamily;

static const LibraryFamily library_families[] =
{
  /* We assume elsewhere that libc.so.6 is the first entry */
  {
    "libc.so.6",
    {
      "if-exists:libidn2.so.0",
      "if-exists:even-if-older:soname:libnss_compat.so.2",
      "if-exists:even-if-older:soname-match:libnss_compat.so.*",
      "if-exists:even-if-older:soname:libnss_db.so.2",
      "if-exists:even-if-older:soname-match:libnss_db.so.*",
      "if-exists:even-if-older:soname:libnss_dns.so.2",
      "if-exists:even-if-older:soname-match:libnss_dns.so.*",
      "if-exists:even-if-older:soname:libnss_files.so.2",
      "if-exists:even-if-older:soname-match:libnss_files.so.*",
      NULL
    },
  },
  /* Other library families of interest */
  {
    "libcrypto.so.3",
    {
      "if-exists:soname:libssl.so.3",
      NULL
    }
  },
  {
    "libxkbcommon.so.0",
    {
      "if-exists:soname:libxkbcommon-x11.so.0",
      NULL
    }
  },
};

static void
pv_runtime_capture_relatives (PvRuntime *self,
                              RuntimeArchitecture *arch,
                              const LibraryFamily *family,
                              gchar **soname_symlink_out,
                              gboolean *was_captured_out)
{
  g_autoptr(GError) local_error = NULL;
  g_autofree gchar *soname_symlink = NULL;
  gboolean was_captured = FALSE;
  gsize n;
  struct stat stat_buf;

  soname_symlink = g_build_filename (arch->libdir_relative_to_overrides,
                                     family->soname, NULL);

  if (fstatat (self->overrides_fd, soname_symlink, &stat_buf,
               AT_SYMLINK_NOFOLLOW) != 0
      || !S_ISLNK (stat_buf.st_mode))
    goto out;

  was_captured = TRUE;

  for (n = 0; n < G_N_ELEMENTS (family->relatives); n++)
    {
      if (family->relatives[n] == NULL)
        break;
    }

  if (!pv_runtime_capture_libraries (self, arch,
                                     arch->libdir_relative_to_overrides,
                                     family->soname,
                                     family->relatives, n,
                                     &local_error))
    g_warning ("Unable to collect libraries related to %s: %s",
               family->soname, local_error->message);

out:
  if (soname_symlink_out != NULL)
    *soname_symlink_out = g_steal_pointer (&soname_symlink);

  if (was_captured_out != NULL)
    *was_captured_out = was_captured;
}

/*
 * pv_runtime_collect_libc_family:
 * @self: The runtime
 * @arch: Architecture of @libc_symlink
 * @bwrap:
 * @libc_symlink: The symlink created by capsule-capture-libs,
 *  relative to /overrides.
 *  Its target is either `arch->provider->path_in_container_ns`
 *  followed by the path to glibc in the graphics stack provider
 *  namespace, or the path to glibc in a non-standard directory such
 *  as /opt with no special prefix.
 * @gconv_in_provider: Collection of directories like usr/lib/gconv
 * @error: Used to raise an error on failure
 */
static gboolean
pv_runtime_collect_libc_family (PvRuntime *self,
                                RuntimeArchitecture *arch,
                                FlatpakBwrap *bwrap,
                                const char *libc_symlink,
                                const char *ld_so_in_runtime,
                                PvRuntimeLibraryData *gconv_in_provider,
                                GError **error)
{
  G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) libc_timer =
    _srt_profiling_start ("glibc");
  g_autoptr(GError) local_error = NULL;
  g_autofree char *libc_target = NULL;
  g_autofree char *libdl_lib = NULL;
  const char *gconv_path;

  g_return_val_if_fail (arch->provider != NULL, FALSE);
  g_return_val_if_fail (bwrap != NULL || self->mutable_sysroot != NULL, FALSE);

  if (!pv_runtime_take_ld_so_from_provider (self, arch,
                                            ld_so_in_runtime,
                                            bwrap, error))
    return FALSE;

  gconv_path =
    _srt_graphics_provider_architecture_get_gconv_path (arch->provider_arch_details);

  if (gconv_path != NULL)
    {
      /* The graphics provider directly told us what directory to use,
       * so we don't need to spend time figuring it out automatically. */

      /* In practice this always starts with a slash, but
       * pv_runtime_library_data_try() wants paths with no slash */
      if (G_LIKELY (gconv_path[0] == '/'))
        gconv_path++;

      if (!pv_runtime_library_data_try (gconv_in_provider,
                                        gconv_path,
                                        arch->provider,
                                        "graphics provider manifest",
                                        _srt_graphics_provider_describe (arch->provider_details),
                                        NULL))
        g_warning ("Graphics provider %s declared gconv directory %s "
                   "but it was not found",
                   _srt_graphics_provider_describe (arch->provider_details),
                   gconv_path);

      /* Don't second-guess what we were told, even if it was wrong */
      return TRUE;
    }

  libdl_lib = srt_system_info_dup_libdl_lib (arch->system_info,
                                             arch->tuple,
                                             &local_error);

  if (libdl_lib == NULL)
    {
      g_debug ("Unable to determine libdl ${LIB}: %s", local_error->message);
      g_clear_error (&local_error);
    }
  else
    {
      g_autofree gchar *dir = g_build_filename ("usr", libdl_lib, "gconv", NULL);

      /* On some host OSs, the hard-coded path used to dlopen gconv modules
       * does not actually match the realpath() of the directory containing
       * libc.so.6 (for example on Void Linux, /usr/lib64 -> lib is a symlink,
       * but 64-bit gconv modules are loaded via /usr/lib64 and not /usr/lib).
       * Use /usr/${LIB}/gconv as a better guess at what the hard-coded path
       * might be. For example, this resolves to /usr/lib64/gconv on
       * Void Linux, which would mean we mount both /usr/lib64/gconv (here)
       * and /usr/lib/gconv (below), ensuring that whichever one glibc
       * actually wants to load, it'll work. */
      pv_runtime_library_data_try (gconv_in_provider, dir, arch->provider,
                                   "libdl ${LIB}", libdl_lib, NULL);
    }

  libc_target = glnx_readlinkat_malloc (self->overrides_fd, libc_symlink,
                                        NULL, NULL);
  if (libc_target != NULL)
    {
      g_autofree gchar *dir = NULL;
      g_autofree gchar *gconv_dir_in_provider = NULL;
      gboolean found = FALSE;
      const char *target_in_provider;
      const char *gconv_prefix;
      gsize n_slashes = 0;

      /* As with pv_runtime_collect_lib_symlink_data(), we need to remove the
       * provider prefix if present. Note that after this, target_in_provider
       * can either be absolute, or relative to the root of the provider. */
      target_in_provider = _srt_get_path_after (libc_target,
                                                arch->provider->path_in_container_ns);

      if (target_in_provider == NULL)
        target_in_provider = libc_target;

      /* Either absolute, or relative to the root of the provider */
      dir = g_path_get_dirname (target_in_provider);

      /* Normalize to be relative to the root so we have fewer cases
       * to consider */
      while (dir[n_slashes] == '/')
        n_slashes++;

      if (n_slashes)
        memmove (dir, dir + n_slashes, strlen (dir) - n_slashes + 1);

      g_debug ("glibc directory relative to provider root: %s", dir);

      /* We are assuming that in the glibc "Makeconfig", $(libdir) was the same as
       * $(slibdir) (this is the upstream default) or the same as "/usr$(slibdir)"
       * (like in Debian without the mergerd /usr). We also assume that $(gconvdir)
       * had its default value "$(libdir)/gconv".
       * We prefer /usr because otherwise, if the host is merged-/usr and the
       * container is not, we might end up binding /lib instead of /usr/lib
       * and that could cause issues.
       * Note that this special case is intentionally using g_str_has_prefix()
       * and not flatpak_has_path_prefix(), so that it matches "lib64"
       * or "lib/x86_64-linux-gnu" or similar. */
      if (g_str_has_prefix (dir, "lib"))
        gconv_prefix = "/usr/";
      else
        gconv_prefix = "/";

      /* This always starts with a slash, but pv_runtime_library_data_try()
       * wants paths with no slash, hence the +1 below. */
      gconv_dir_in_provider = g_build_filename (gconv_prefix, dir, "gconv", NULL);

      if (pv_runtime_library_data_try (gconv_in_provider,
                                       gconv_dir_in_provider + 1,
                                       arch->provider,
                                       "glibc directory", dir, NULL))
        found = TRUE;

      if (!found)
        {
          /* Try again without hwcaps subdirectories.
           * For example, libc6-i386 on SteamOS 2 'brewmaster'
           * contains /lib/i386-linux-gnu/i686/cmov/libc.so.6,
           * for which we want gconv modules from
           * /usr/lib/i386-linux-gnu/gconv, not from
           * /usr/lib/i386-linux-gnu/i686/cmov/gconv. */
          while (g_str_has_suffix (dir, "/cmov") ||
                 g_str_has_suffix (dir, "/i686") ||
                 g_str_has_suffix (dir, "/sse2") ||
                 g_str_has_suffix (dir, "/tls") ||
                 g_str_has_suffix (dir, "/x86_64"))
            {
              char *slash = strrchr (dir, '/');

              g_assert (slash != NULL);
              *slash = '\0';
            }

          g_clear_pointer (&gconv_dir_in_provider, g_free);
          gconv_dir_in_provider = g_build_filename (gconv_prefix, dir, "gconv", NULL);

          if (pv_runtime_library_data_try (gconv_in_provider,
                                           gconv_dir_in_provider + 1,
                                           arch->provider,
                                           "glibc directory without hwcaps",
                                           dir, NULL))
            found = TRUE;
        }

      if (!found)
        {
          g_info ("We were expecting the gconv modules directory in the provider "
                  "to be located in \"%s\", but instead it is missing",
                  gconv_dir_in_provider);
        }
    }

  return TRUE;
}

/*
 * PvRuntimeDataFlags:
 * @PV_RUNTIME_DATA_FLAGS_USR_SHARE_FIRST: If set, look in /usr/share
 *  before attempting to derive a data directory from ${libdir}.
 *  Use this for drivers like the NVIDIA proprietary driver that hard-code
 *  /usr/share rather than having a build-time-configurable prefix.
 * @PV_RUNTIME_DATA_FLAGS_IGNORE_MISSING: Don't log warnings if we can't
 *  find the data. Use this for Vulkan drivers, for which we don't know
 *  which ones came from Mesa.
 * @PV_RUNTIME_DATA_FLAGS_NONE: None of the above.
 *
 * Flags affecting pv_runtime_collect_lib_data().
 */
typedef enum
{
  PV_RUNTIME_DATA_FLAGS_USR_SHARE_FIRST = (1 << 0),
  PV_RUNTIME_DATA_FLAGS_IGNORE_MISSING = (1 << 1),
  PV_RUNTIME_DATA_FLAGS_NONE = 0
} PvRuntimeDataFlags;

/*
 * pv_runtime_collect_lib_data:
 * @self: The runtime
 * @arch: Architecture of @lib_in_provider
 * @dir_basename: Directory in ${datadir}, e.g. `drirc.d`
 * @lib_in_provider: A library in the graphics stack provider, either
 *  absolute or relative to the root of the provider namespace
 * @extra_suffix: (nullable): Subdirectory of ${libdir} where we expect
 *  the library to be located, e.g. `/dri`, or %NULL if none
 * @flags: Flags
 * @data_in_provider: Collection of data directories to update
 *
 * Populate @data_in_provider with paths to data directories,
 * either in the hard-coded path `/usr/share` or located by constructing
 * a path relative to @lib_in_provider.
 *
 * Given a library in the graphics provider, use its target to guess what
 * the installation `${prefix}` would probably have been, then use that to
 * guess a corresponding `${datadir}`. Fill @data_in_provider with the
 * location of `${datadir}/@dir_basename`, if found.
 *
 * To guess the `${prefix}`, this function is aware of several common
 * conventions for how `${libdir}` is formed: Debian-style multiarch,
 * FHS multilib and so on.
 *
 * If @extra_suffix is %NULL, assume that @lib_in_provider was installed
 * directly inside the `${libdir}`, like `${libdir}/libGLX_mesa.so.0`.
 *
 * If @extra_suffix is non-%NULL, instead assume that @lib_in_provider
 * was installed in a subdirectory of `${libdir}`, for example
 * `${libdir}/dri/swrast_dri.so` with `extra_suffix = "/dri"`,
 * or `${libdir}/gbm/dri_gbm.so` with `extra_suffix = "/gbm"`.
 */
static void
pv_runtime_collect_lib_data (PvRuntime *self,
                             RuntimeArchitecture *arch,
                             const char *dir_basename,
                             const char *lib_in_provider,
                             const char *extra_suffix,
                             PvRuntimeDataFlags flags,
                             PvRuntimeLibraryData *data_in_provider)
{
  const char *libdir_suffixes[] =
  {
    "/lib/<multiarch>",   /* placeholder, will be replaced */
    "/lib64",
    "/lib32",
    "/lib",
  };
  g_autofree gchar *dir = NULL;
  g_autofree gchar *lib_multiarch = NULL;
  g_autofree gchar *dir_in_provider = NULL;
  g_autofree gchar *dir_in_provider_usr_share = NULL;

  g_return_if_fail (PV_IS_RUNTIME (self));
  g_return_if_fail (arch->provider != NULL);
  g_return_if_fail (runtime_architecture_check_valid (arch));
  g_return_if_fail (dir_basename != NULL);
  g_return_if_fail (lib_in_provider != NULL);
  g_return_if_fail (data_in_provider != NULL);

  /* If we are unable to find the lib data in the provider, we try as
   * a last resort `usr/share`. This should help for example Exherbo
   * that uses the unusual `usr/${gnu_tuple}/lib` path for shared
   * libraries.
   *
   * Some libraries, like the NVIDIA proprietary driver, hard-code
   * /usr/share even if they are installed in some other location.
   * For these libraries, we look in this /usr/share-based path
   * *first*. */
  dir_in_provider_usr_share = g_build_filename ("usr", "share", dir_basename, NULL);

  if ((flags & PV_RUNTIME_DATA_FLAGS_USR_SHARE_FIRST)
      && pv_runtime_library_data_try (data_in_provider,
                                      dir_in_provider_usr_share,
                                      arch->provider,
                                      "hard-coded", "/usr/share", NULL))
    return;

  /* lib_in_provider can either be absolute, or relative to the root of
   * the provider: normalize it to relative so we only have to deal with
   * one code path. */
  while (lib_in_provider[0] == '/')
    lib_in_provider++;

  /* Always relative to the root of the provider */
  dir = g_path_get_dirname (lib_in_provider);
  g_return_if_fail (dir[0] != '/');

  /* The logic below works a bit better if we represent the root of the
   * provider (unlikely, but possible) as the empty string */
  if (G_UNLIKELY (strcmp (dir, ".") == 0))
    dir[0] = '\0';

  /* Go up from something like ${libdir}/dri to ${libdir} if necessary */
  if (extra_suffix != NULL && g_str_has_suffix (dir, extra_suffix))
    dir[strlen (dir) - strlen (extra_suffix)] = '\0';

  /* Try to walk up the directory hierarchy from the library directory
   * to find the ${exec_prefix}. We assume that the library directory is
   * either ${exec_prefix}/lib/${multiarch_tuple}, ${exec_prefix}/lib64,
   * ${exec_prefix}/lib32, or ${exec_prefix}/lib.
   *
   * Note that if the library is in /lib, /lib64, etc., this will
   * leave dir empty, but that's OK: dir_in_provider will become
   * something like "share/drirc.d" which will be looked up in the
   * provider namespace. */
  lib_multiarch = g_build_filename ("/lib", arch->tuple, NULL);
  libdir_suffixes[0] = lib_multiarch;

  for (gsize i = 0; i < G_N_ELEMENTS (libdir_suffixes); i++)
    {
      if (g_str_has_suffix (dir, libdir_suffixes[i]))
        {
          /* dir might be usr/lib64: truncate to usr. */
          dir[strlen (dir) - strlen (libdir_suffixes[i])] = '\0';
          break;
        }

      if (g_strcmp0 (dir, libdir_suffixes[i] + 1) == 0)
        {
          /* dir is something like lib64: truncate to empty. */
          dir[0] = '\0';
          break;
        }
    }

  /* If ${prefix} and ${exec_prefix} are different, we have no way
   * to predict what the ${prefix} really is; so we are also assuming
   * that the ${exec_prefix} is the same as the ${prefix}.
   *
   * Go back down from the ${prefix} to the data directory,
   * which we assume is ${prefix}/share. (If it isn't, then we have
   * no way to predict what it would be.)
   *
   * As a special exception, if ${exec_prefix} is / then assume the
   * ${datadir} is /usr/share, because there is no /share in the FHS. */
  if (strcmp (dir, "") == 0)
    dir_in_provider = g_build_filename ("usr", "share", dir_basename, NULL);
  else
    dir_in_provider = g_build_filename (dir, "share", dir_basename, NULL);

  g_return_if_fail (dir_in_provider[0] != '/');

  if (pv_runtime_library_data_try (data_in_provider, dir_in_provider,
                                   arch->provider,
                                   "library path", lib_in_provider, NULL))
    return;

  if (!(flags & PV_RUNTIME_DATA_FLAGS_USR_SHARE_FIRST)
      && strcmp (dir_in_provider, dir_in_provider_usr_share) != 0)
    {
      g_autofree gchar *because = NULL;

      because = g_strdup_printf (", because \"/%s\" based on \"/%s\" is not a directory",
                                 dir_in_provider,
                                 lib_in_provider);

      if (pv_runtime_library_data_try (data_in_provider,
                                       dir_in_provider_usr_share,
                                       arch->provider,
                                       "fallback to", "usr/share", because))
        return;
    }

  if (flags & PV_RUNTIME_DATA_FLAGS_IGNORE_MISSING)
    {
      g_debug ("Did not find %s adjacent to \"%s\", probably not a problem",
               dir_basename, lib_in_provider);
      return;
    }

  if (g_strcmp0 (dir_in_provider, dir_in_provider_usr_share) == 0)
    g_info ("We were expecting the %s directory in the provider to "
            "be located in \"/%s\" based on \"/%s\", but instead it is missing",
            dir_basename, dir_in_provider, lib_in_provider);
  else
    g_info ("We were expecting the %s directory in the provider to "
            "be located in \"/%s\" or \"/%s\" based on \"/%s\", but "
            "instead it is missing",
            dir_basename, dir_in_provider, dir_in_provider_usr_share,
            lib_in_provider);
}

/*
 * pv_runtime_collect_lib_symlink_data:
 * @self: The runtime
 * @arch: Architecture of @lib_symlink
 * @dir_basename: Directory in ${datadir}, e.g. `drirc.d`
 * @lib_symlink: The symlink created by capsule-capture-libs,
 *  relative to /overrides.
 *  Its target is either `arch->provider->path_in_container_ns`
 *  followed by the path to a library in the graphics stack provider
 *  namespace, or the path to a library in a non-standard directory such
 *  as /opt with no special prefix.
 * @flags: Flags
 * @data_in_provider: Collection of data directories to update
 *
 * Given a symlink in `/overrides`, use its target to determine what
 * the path in the graphics provider is, then fill @data_in_provider
 * as for pv_runtime_collect_lib_data().
 *
 * Returns: %TRUE if @lib_symlink exists and is a symlink
 */
static gboolean
pv_runtime_collect_lib_symlink_data (PvRuntime *self,
                                     RuntimeArchitecture *arch,
                                     const char *dir_basename,
                                     const char *lib_symlink,
                                     PvRuntimeDataFlags flags,
                                     PvRuntimeLibraryData *data_in_provider)
{
  g_autofree char *target = NULL;
  const char *target_in_provider;

  g_return_val_if_fail (PV_IS_RUNTIME (self), FALSE);
  g_return_val_if_fail (runtime_architecture_check_valid (arch), FALSE);
  g_return_val_if_fail (dir_basename != NULL, FALSE);
  g_return_val_if_fail (lib_symlink != NULL, FALSE);
  g_return_val_if_fail (data_in_provider != NULL, FALSE);

  target = glnx_readlinkat_malloc (self->overrides_fd, lib_symlink, NULL, NULL);

  if (target == NULL)
    return FALSE;

  /* There are two possibilities for a symlink created by
   * capsule-capture-libs.
   *
   * If capsule-capture-libs found a library in /app, /usr
   * or /lib* (as configured by --remap-link-prefix in
   * pv_runtime_get_capsule_capture_libs()), then the symlink will
   * point to something like /run/host/lib/libfoo.so or
   * /run/gfx/DIR/usr/lib64/libbar.so. To find the corresponding path
   * in the graphics stack provider, we can remove the /run/host,
   * /run/gfx/DIR or /var/pressure-vessel/gfx/DIR prefix.
   *
   * If capsule-capture-libs found a library elsewhere, for example
   * in $HOME or /opt, then we assume it will be visible at the same
   * path in both the graphics stack provider and the final container.
   * In practice this is unlikely to happen unless the graphics stack
   * provider is the same as the current namespace. We do not remove
   * any prefix in this case.
   *
   * Note that after this, target_in_provider can either be absolute,
   * or relative to the root of the provider. */

  target_in_provider = _srt_get_path_after (target,
                                            arch->provider->path_in_container_ns);

  if (target_in_provider == NULL)
    target_in_provider = target;

  pv_runtime_collect_lib_data (self, arch, dir_basename,
                               target_in_provider, NULL, flags,
                               data_in_provider);
  return TRUE;
}

/*
 * @details_arch: must be non-%NULL and of a kind that could be returned
 *  by icd_details_get_architecture().
 *
 * Helper for collect_mesa_drirc(), see that function for details of how
 * this works
 */
static void
collect_one_mesa_drirc (PvRuntime *self,
                        RuntimeArchitecture *arch,
                        const IcdDetails *details,
                        const PvModulePerArch *details_arch,
                        PvRuntimeDataFlags flags,
                        PvRuntimeLibraryData *drirc_data_in_provider)
{
  g_autofree gchar *symlink = NULL;
  const char *resolved;

  g_return_if_fail (details_arch != NULL);

  /* This is assumed to be called after collecting ICDs */
  resolved = details_arch->resolved_library;

  switch (details_arch->kind)
    {
      case ICD_KIND_ABSOLUTE:
        g_return_if_fail (resolved != NULL);
        pv_runtime_collect_lib_data (self, arch, "drirc.d", resolved,
                                     NULL, flags, drirc_data_in_provider);
        break;

      case ICD_KIND_SONAME:
        /* We already created a symlink in /overrides pointing to the
         * path in the container namespace, which is the same as the
         * path in the provider namespace, but with an optional prefix
         * that we already know how to remove (/run/host, /run/gfx/DIR or
         * /var/pressure-vessel/gfx/DIR). */
        g_return_if_fail (resolved != NULL);
        symlink = g_build_filename (arch->libdir_relative_to_overrides,
                                    glnx_basename (resolved), NULL);
        pv_runtime_collect_lib_symlink_data (self, arch, "drirc.d", symlink,
                                             flags, drirc_data_in_provider);
        break;

      case ICD_KIND_META_LAYER:
        /* Nothing to do - we can't know the path because there is none */
        break;

      case ICD_KIND_NONEXISTENT:
      case ICD_KIND_IGNORED:
      case ICD_KIND_UNDECIDED:
      default:
        g_return_if_reached ();
    }
}

/*
 * collect_mesa_drirc:
 *
 * For each driver provided by Mesa, other than GLX which is handled
 * elsewhere, look for share/drirc.d nearby.
 *
 * This currently means:
 * - The EGL ICD described in 50_mesa.json (libEGL_mesa.so.0), assumed
 *   to be in ${libdir}
 * - All Vulkan ICDs (we cannot tell which ones came from Mesa!)
 * - All DRI drivers (which are all implicitly from Mesa)
 *
 * In reality Mesa libraries find their drirc.d via a path that gets
 * hard-coded at Mesa build-time, but we have no way to discover what
 * that hard-coded path really is. The best we can do is to assume that
 * the library itself and its data are installed in a conventional layout
 * with a FHS-style common prefix, for example:
 *
 * - EGL ICD: `${prefix}/${LIB}/libEGL_mesa.so.0`
 * - Vulkan: `${prefix}/${LIB}/libvulkan_lvp.so`, etc.
 * - DRI: `${prefix}/${LIB}/dri/swrast_dri.so`, etc.
 * - GBM: `${prefix}/${LIB}/gbm/dri_gbm.so`
 * - data: `${prefix}/share/drirc.d`
 *
 * where `${LIB}` could typically be `lib64` or `lib/x86_64-linux-gnu`.
 */
static void
collect_mesa_drirc (PvRuntime *self,
                    RuntimeArchitecture *arch,
                    GPtrArray *egl_icd_details,
                    GPtrArray *vulkan_icd_details,
                    PvRuntimeLibraryData *drirc_data_in_provider)
{
  g_autoptr(SrtObjectList) dri_drivers = NULL;
  g_autoptr(SrtObjectList) gbm_backends = NULL;

  for (guint i = 0; i < egl_icd_details->len; i++)
    {
      IcdDetails *details = g_ptr_array_index (egl_icd_details, i);
      const PvModulePerArch *details_arch;
      const char *resolved;
      const char *base;

      details_arch = icd_details_get_architecture (details,
                                                   arch->tuple_quark);

      if (details_arch == NULL)
        continue;

      /* This is assumed to be called after collecting ICDs */
      resolved = details_arch->resolved_library;

      if (resolved == NULL)
        continue;

      base = glnx_basename (resolved);

      if (strstr (base, "libEGL_mesa.so") != NULL)
        collect_one_mesa_drirc (self, arch, details, details_arch,
                                PV_RUNTIME_DATA_FLAGS_NONE,
                                drirc_data_in_provider);
      else
        g_debug ("Assuming \"%s\" is not from Mesa", resolved);
    }

  for (guint i = 0; i < vulkan_icd_details->len; i++)
    {
      IcdDetails *details = g_ptr_array_index (vulkan_icd_details, i);
      const PvModulePerArch *details_arch;

      details_arch = icd_details_get_architecture (details, arch->tuple_quark);

      if (details_arch == NULL)
        continue;

      /* We don't know which Vulkan ICDs are from Mesa (currently
       * libvulkan_intel.so, libvulkan_lvp.so and libvulkan_radeon.so,
       * but there could be more in future), so we have to assume
       * that all of them are *potentially* Mesa. */
      collect_one_mesa_drirc (self, arch, details, details_arch,
                              PV_RUNTIME_DATA_FLAGS_IGNORE_MISSING,
                              drirc_data_in_provider);
    }

  /* We assume that by the time we get here, this is already cached,
   * so its time cost will be trivial and therefore there's no need to
   * do additional profiling */
  dri_drivers = srt_system_info_list_dri_drivers (arch->system_info,
                                                  arch->tuple,
                                                  SRT_DRIVER_FLAGS_NONE);

  for (const GList *icd_iter = dri_drivers;
       icd_iter != NULL;
       icd_iter = icd_iter->next)
    {
      g_autofree gchar *resolved = NULL;

      resolved = srt_dri_driver_resolve_library_path (icd_iter->data);
      g_return_if_fail (g_path_is_absolute (resolved));
      pv_runtime_collect_lib_data (self, arch, "drirc.d", resolved,
                                   "/dri", PV_RUNTIME_DATA_FLAGS_NONE,
                                   drirc_data_in_provider);
    }

  /* And since GBM backends can also trigger drirc parsing,
   * explicitly handle those too, in case they are in a path
   * different from where DRI drivers are.
   */
  gbm_backends = srt_system_info_list_gbm_backends (arch->system_info,
                                                    arch->tuple,
                                                    SRT_DRIVER_FLAGS_NONE);

  for (const GList *icd_iter = gbm_backends;
       icd_iter != NULL;
       icd_iter = icd_iter->next)
    {
      g_autofree gchar *resolved = NULL;

      resolved = srt_gbm_backend_resolve_library_path (icd_iter->data);
      g_return_if_fail (g_path_is_absolute (resolved));
      pv_runtime_collect_lib_data (self, arch, "drirc.d", resolved,
                                   "/gbm", PV_RUNTIME_DATA_FLAGS_NONE,
                                   drirc_data_in_provider);
    }
}

/*
 * pv_runtime_finish_lib_data:
 * @self: The runtime
 * @bwrap: Arguments for bubblewrap
 * @dir_basename: Name of a data directory below ${datadir}, such as
 *  `drirc.d`
 * @lib_name: Library we used to populate @data_in_provider, only used
 *  in diagnostic messages
 * @all_from_provider: %TRUE if the instances of @lib_name for all
 *  architectures came from the graphics stack provider
 * @data_in_provider: Data directories we previously collected
 * @error: Used to raise an error on failure
 *
 * Make each path in @data_in_provider available in the final container
 * at the same path.
 *
 * Additionally, make the highest-precedence of them available at
 * `usr/share/` + @dir_basename.
 *
 * Returns: %TRUE on success
 */
static gboolean
pv_runtime_finish_lib_data (PvRuntime *self,
                            FlatpakBwrap *bwrap,
                            const gchar *dir_basename,
                            const gchar *lib_name,
                            gboolean all_from_provider,
                            PvRuntimeLibraryData *data_in_provider,
                            GError **error)
{
  g_autofree gchar *canonical_path = NULL;
  const gchar *data_path = NULL;
  PvGraphicsProvider *provider = NULL;
  gsize iter;

  g_return_val_if_fail (self->providers != NULL, FALSE);
  g_return_val_if_fail (bwrap != NULL || self->mutable_sysroot != NULL, FALSE);
  g_return_val_if_fail (dir_basename != NULL, FALSE);

  canonical_path = g_build_filename ("usr", "share", dir_basename, NULL);

  if (data_in_provider->paths->len > 0 && !all_from_provider)
    {
      /* See the explanation in the similar
       * "any_libc_from_provider && !all_libc_from_provider" case, above */
      g_warning ("Using %s from provider system for some but not all "
                 "architectures! Will take /usr/share/%s from provider.",
                 lib_name, dir_basename);
    }

  /* We might have more than one data directory in the provider,
   * e.g. one for each supported multiarch tuple - and in more complex
   * scenarios, each one might come from a different graphics stack
   * provider. We prefer the one that was found first, which will have
   * come from the highest-precedence architecture. */
  pv_runtime_library_data_iter_init (data_in_provider, &iter);

  while (pv_runtime_library_data_iter_next (data_in_provider, &iter,
                                            &data_path, &provider))
    {
      g_warn_if_fail (data_path != NULL && data_path[0] != '/');

      /* If we found a library at foo/lib/libbar.so.0 and then found its
       * data in foo/share/bar, it's reasonable to expect that libbar
       * will still be looking for foo/share/bar in the container. */
      if (!pv_runtime_take_from_provider (self,
                                          provider, data_path,
                                          bwrap, data_path,
                                          (TAKE_FROM_PROVIDER_FLAGS_IF_DIR
                                           | TAKE_FROM_PROVIDER_FLAGS_IF_CONTAINER_COMPATIBLE),
                                          error))
        return FALSE;

      if (self->is_flatpak_env
          && g_str_has_prefix (data_path, "app/lib/"))
        {
          /* In a freedesktop.org runtime, for some multiarch, there is
           * a symlink usr/lib/${arch} that points to app/lib/${arch}
           * https://gitlab.com/freedesktop-sdk/freedesktop-sdk/-/blob/70cb5835/elements/multiarch/multiarch-platform.bst#L24
           * If we have a path in app/lib/ here, we also try to
           * replicate the symlink in usr/lib/ */
          g_autofree gchar *path_in_usr = NULL;
          path_in_usr = g_build_filename ("usr",
                                          data_path + strlen ("app"),
                                          NULL);
          if (_srt_fstatat_is_same_file (-1, data_path, -1, path_in_usr))
            {
              if (!pv_runtime_take_from_provider (self,
                                                  provider, data_path,
                                                  bwrap, path_in_usr,
                                                  TAKE_FROM_PROVIDER_FLAGS_IF_DIR,
                                                  error))
                return FALSE;
            }
        }
    }

  /* In the common case where data_in_provider contains canonical_path,
   * we have already made it available at canonical_path in the container.
   * Nothing more to do here. */
  if (pv_runtime_library_data_contains (data_in_provider, canonical_path))
    return TRUE;

  /* In the uncommon case where data_in_provider *does not* contain
   * canonical_path - for example data_in_provider = { usr/local/share/drirc.d }
   * but canonical_path is usr/share/drirc.d - we'll mount it over
   * canonical_path as well, just in case something has hard-coded
   * that path and is expecting to find something consistent there.
   *
   * If data_in_provider contains more than one - for example if we
   * found the x86_64 library in usr/lib/x86_64-linux-gnu but the
   * i386 library in app/lib/i386-linux-gnu, as we do in Flatpak -
   * then we don't have a great way to choose between them, so just
   * pick the one associated with the highest-priority architecture
   * and hope for the best. */

  pv_runtime_library_data_iter_init (data_in_provider, &iter);

  if (pv_runtime_library_data_iter_next (data_in_provider, &iter,
                                         &data_path, &provider))
    return pv_runtime_take_from_provider (self,
                                          provider, data_path,
                                          bwrap, canonical_path,
                                          TAKE_FROM_PROVIDER_FLAGS_IF_CONTAINER_COMPATIBLE,
                                          error);
  else
    return TRUE;
}

static gboolean
pv_runtime_take_misc_data_from_provider (PvRuntime *self,
                                         FlatpakBwrap *bwrap,
                                         GError **error)
{
  static const char * const pci_ids_paths[] =
    {
      "/usr/share/misc/pci.ids",
      "/usr/share/hwdata/pci.ids",
      "/usr/share/pci.ids",
      NULL
    };

  if (!pv_runtime_take_any_from_provider (self, bwrap, pci_ids_paths,
                                          "/usr/share/misc/pci.ids",
                                          TAKE_FROM_PROVIDER_FLAGS_IF_REGULAR,
                                          error))
    return FALSE;

  return TRUE;
}

static const SrtKnownArchitecture *
pv_runtime_get_provider_ldconfig_architecture (PvRuntime *self,
                                               PvGraphicsProvider *provider,
                                               const char *ldconfig,
                                               const char *ldconfig_real,
                                               GError **error)
{
  glnx_autofd int fd = -1;
  char buf[4] = { 0, 0, 0, 0 };
  size_t n_read;

  fd = _srt_sysroot_open (provider->in_current_ns, ldconfig,
                          SRT_RESOLVE_FLAGS_READABLE,
                          NULL, error);

  if (fd < 0)
    return NULL;

  if (!_srt_fd_read_loop (fd, buf, sizeof (buf), &n_read, error))
    return NULL;

  if (n_read < 4 || memcmp (buf, "\177ELF", 4) != 0)
    {
      g_debug ("ldconfig(8) \"%s\" in \"%s\" is not an ELF executable",
               ldconfig, provider->in_current_ns->path);

      if (ldconfig_real != NULL
          && n_read >= 2
          && memcmp (buf, "#!", 2) == 0)
        {
          g_debug ("ldconfig is a script and ldconfig.real exists, "
                   "trying to get architecture from ldconfig.real instead");
          g_clear_fd (&fd, NULL);
          fd = _srt_sysroot_open (provider->in_current_ns, ldconfig_real,
                                  SRT_RESOLVE_FLAGS_READABLE,
                                  NULL, error);

          if (fd < 0)
            return NULL;
        }
    }

  return _srt_architecture_guess_from_elf (fd, NULL, error);
}

typedef enum
{
  OPTIONAL,
  IMPORTANT,
  ESSENTIAL
} ComponentPriority;

typedef struct
{
  const char *executable;
  const char *target_path;
  ComponentPriority priority;
} GlibcExecutable;

static gboolean
pv_runtime_provide_glibc_executable (PvRuntime *self,
                                     const GlibcExecutable *exe,
                                     FlatpakBwrap *bwrap,
                                     GError **error)
{
  g_autoptr(GError) local_error = NULL;
  g_autofree char *provider_impl = NULL;
  g_autofree char *target_path_alloc = NULL;
  const char *target_path = exe->target_path;
  const gchar *search_paths = NULL;
  PvGraphicsProvider *provider = NULL;
  TakeFromProviderFlags flags;
  gsize provider_index;

  for (provider_index = 0;
       provider_index < self->providers->len;
       provider_index++)
    {
      provider = g_ptr_array_index (self->providers, provider_index);

      if (provider->flags & PV_GRAPHICS_PROVIDER_FLAGS_INTERPRETER_HOST)
        continue;

      if (_srt_sysroot_is_direct (provider->in_current_ns))
        search_paths = g_environ_getenv (self->original_environ, "PATH");
      else
        search_paths = NULL;

      provider_impl = pv_graphics_provider_search_in_path_and_bin (provider,
                                                                   search_paths,
                                                                   exe->executable);

      /* Leaves provider and search_paths set appropriately if a match was
       * found (we will use this later) */
      if (provider_impl != NULL)
        break;
    }

  if (target_path == NULL)
    {
      target_path_alloc = g_build_filename ("/usr/bin", exe->executable, NULL);
      target_path = target_path_alloc;
    }

  if (exe->priority >= ESSENTIAL)
    flags = TAKE_FROM_PROVIDER_FLAGS_NONE;
  else
    flags = TAKE_FROM_PROVIDER_FLAGS_IF_CONTAINER_COMPATIBLE;

  if (provider_impl == NULL)
    {
      if (exe->priority >= IMPORTANT)
        g_warning ("Cannot find %s", exe->executable);
      else
        g_debug ("Cannot find %s", exe->executable);

      /* TODO: If we can't find the implementation of an ESSENTIAL
       * executable like ldconfig, should we just fail? */
      return TRUE;
    }

  if (!pv_runtime_take_from_provider (self,
                                      provider, provider_impl,
                                      bwrap, target_path,
                                      flags,
                                      &local_error))
    {
      if (exe->priority >= IMPORTANT)
        {
          g_propagate_error (error, g_steal_pointer (&local_error));
          return FALSE;
        }
      else
        {
          g_debug ("Cannot take %s from provider, ignoring: %s",
                   provider_impl, local_error->message);
          g_clear_error (&local_error);
          return TRUE;
        }
    }

  if (g_str_equal (exe->executable, "ldconfig"))
    {
      /* In Ubuntu and very old Debian releases (Debian 8 or older),
       * /sbin/ldconfig is a shell script wrapper around the real binary
       * /sbin/ldconfig.real, working around lack of dpkg trigger support
       * in old library packages. This means we might need
       * /sbin/ldconfig.real as well. */
      g_autofree char *real_impl = NULL;

      real_impl = pv_graphics_provider_search_in_path_and_bin (provider,
                                                               search_paths,
                                                               "ldconfig.real");

      if (real_impl == NULL)
        {
          g_debug ("Did not find accompanying ldconfig.real in the same provider");
        }
      else if (pv_runtime_take_from_provider (self,
                                              provider, real_impl,
                                              bwrap, "/sbin/ldconfig.real",
                                              flags,
                                              &local_error))
        {
          g_debug ("Using accompanying ldconfig.real from the same provider");
        }
      else
        {
          g_debug ("Cannot take ldconfig.real from same provider, ignoring: %s",
                   local_error->message);
          g_clear_error (&local_error);
          g_clear_pointer (&real_impl, g_free);
        }

      self->ldconfig_architecture =
        pv_runtime_get_provider_ldconfig_architecture (self,
                                                       provider,
                                                       provider_impl,
                                                       real_impl,
                                                       &local_error);

      if (G_LIKELY (self->ldconfig_architecture != NULL))
        {
          g_debug ("provider %s ldconfig(8) is a %s executable",
                   provider->in_current_ns->path,
                   self->ldconfig_architecture->multiarch_tuple);
        }
      else
        {
          _srt_log_warning ("Unable to determine architecture of provider %s ldconfig: %s",
                            provider->in_current_ns->path,
                            local_error->message);
          g_clear_error (&local_error);
        }
    }

  return TRUE;
}

static gboolean
pv_runtime_finish_libc_family (PvRuntime *self,
                               FlatpakBwrap *bwrap,
                               PvRuntimeLibraryData *gconv_in_provider,
                               GError **error)
{
  PvGraphicsProvider *gconv_provider;
  const gchar *gconv_path;
  gsize i;
  /* List of paths where we expect to find "locale", sorted by the most
   * preferred to the least preferred.
   * If the canonical "/usr/lib/locale" is missing, we try the Exherbo's
   * "/usr/${gnu_tuple}/lib/locale" too, before giving up.
   * The locale directory is actually architecture-independent, so we just
   * arbitrarily prefer to use "x86_64-pc-linux-gnu" over the 32-bit couterpart */
  static const gchar * const lib_locale_path[] = {
    "/usr/lib/locale",
#if defined(__i386__) || defined(__x86_64__)
    "/usr/x86_64-pc-linux-gnu/lib/locale",
    "/usr/i686-pc-linux-gnu/lib/locale",
#elif defined(__aarch64__)
    "/usr/aarch64-unknown-linux-gnueabi/lib/locale",
#endif
    NULL
  };
  static const gchar * const share_i18n_path[] = {
    "/usr/share/i18n",
    NULL
  };
  static const GlibcExecutable glibc_executables[] =
  {
    /* This is basically the libc-bin Debian package, which is
     * marked Essential. At least ldd can fail to work if it is too
     * dissimilar to the libc.so.6 in use. */
    { "catchsegv" },
    { "getconf" },
    { "getent" },
    { "iconv" },
    { "ldconfig", .priority = ESSENTIAL, .target_path = "/sbin/ldconfig" },
    { "ldd", .priority = IMPORTANT },
    { "locale", .priority = IMPORTANT },
    { "localedef", .priority = IMPORTANT },
    { "pldd" },
    { "tzselect" },
    { "zdump" },
    /* We probably don't need developer tools gencat, rpcgen, memusage,
     * memusagestat, mtrace, sotruss, sprof from libc-dev-bin, libc-devtools
     * (and some have non-trivial dependencies). */
    /* We probably don't need sysadmin tools /usr/sbin/iconvconfig,
     * /usr/sbin/zic from libc-bin. */
  };

  g_return_val_if_fail (self->providers != NULL, FALSE);
  g_return_val_if_fail (bwrap != NULL || self->mutable_sysroot != NULL, FALSE);

  if (self->any_libc_from_provider && !self->all_libc_from_provider)
    {
      /*
       * This shouldn't happen. It would mean that there exist at least
       * two architectures (let's say aaa and bbb) for which we have:
       * provider libc6:aaa < container libc6 < provider libc6:bbb
       * (we know that the container's libc6:aaa and libc6:bbb are
       * constrained to be the same version because that's how multiarch
       * works).
       *
       * If the provider system locales work OK with both the aaa and bbb
       * versions, let's assume they will also work with the intermediate
       * version from the container...
       */
      g_warning ("Using glibc from provider system for some but not all "
                 "architectures! Arbitrarily using provider locales.");
    }

  if (self->any_libc_from_provider)
    {
      g_debug ("Making provider locale data visible in container");

      if (!pv_runtime_take_any_from_provider (self, bwrap, lib_locale_path,
                                              "/usr/lib/locale",
                                              (TAKE_FROM_PROVIDER_FLAGS_IF_DIR
                                               | TAKE_FROM_PROVIDER_FLAGS_LOCALES),
                                              error))
        return FALSE;

      if (!pv_runtime_take_any_from_provider (self, bwrap, share_i18n_path,
                                              "/usr/share/i18n",
                                              (TAKE_FROM_PROVIDER_FLAGS_IF_EXISTS
                                               | TAKE_FROM_PROVIDER_FLAGS_LOCALES),
                                              error))
        return FALSE;

      for (i = 0; i < G_N_ELEMENTS (glibc_executables); i++)
        {
          if (!pv_runtime_provide_glibc_executable (self,
                                                    &glibc_executables[i],
                                                    bwrap,
                                                    error))
            return FALSE;
        }

      g_debug ("Making provider gconv modules visible in container");

      pv_runtime_library_data_iter_init (gconv_in_provider, &i);

      while (pv_runtime_library_data_iter_next (gconv_in_provider, &i,
                                                &gconv_path, &gconv_provider))
        {
          if (!pv_runtime_take_from_provider (self,
                                              gconv_provider, gconv_path,
                                              bwrap, gconv_path,
                                              TAKE_FROM_PROVIDER_FLAGS_IF_DIR,
                                              error))
            return FALSE;
        }
    }
  else
    {
      g_debug ("Using included locale data from container");
      g_debug ("Using included gconv modules from container");
    }

  return TRUE;
}

static gboolean
pv_runtime_handle_alias (PvRuntime *self,
                         RuntimeArchitecture *arch,
                         const char *soname,
                         JsonArray *aliases_array,
                         GError **error)
{
  g_autofree gchar *soname_in_overrides = NULL;
  g_autofree gchar *soname_in_runtime = NULL;
  g_autofree gchar *soname_in_runtime_usr = NULL;
  g_autofree gchar *target = NULL;
  struct stat stat_buf;
  const char *target_base;
  GQuark primary_arch;

  g_assert (self->tuples->len > 0);
  primary_arch = g_array_index (self->tuples, GQuark, 0);

  soname_in_overrides = g_build_filename (arch->libdir_relative_to_overrides,
                                          soname, NULL);
  soname_in_runtime_usr = g_build_filename (self->runtime_usr, "lib",
                                            arch->tuple, soname, NULL);
  /* We are not always in a merged-/usr runtime, e.g. if we are using a
   * "sysroot" runtime. */
  soname_in_runtime = g_build_filename (self->runtime_files, "lib",
                                        arch->tuple, soname, NULL);

  if (fstatat (self->overrides_fd, soname_in_overrides, &stat_buf, AT_SYMLINK_NOFOLLOW) == 0
      && (S_ISLNK (stat_buf.st_mode) || S_ISREG (stat_buf.st_mode)))
    {
      g_info ("SONAME \"%s\" overridden by host system", soname);
      target = g_build_filename (arch->libdir_in_container, soname, NULL);
    }

  if (target == NULL)
    {
      /* On some operating systems, the alias is the canonical path, and the
       * path that we think ought to be canonical might or might not exist.
       * For example, Fedora patches bzip2 to have SONAME "libbz2.so.1"
       * instead of the upstream SONAME "libbz2.so.1.0": so from our
       * Debian-based perspective, libbz2.so.1.0 is canonical and libbz2.so.1
       * is the alias, but in Fedora the reverse is true. */
      for (guint j = 0; j < json_array_get_length (aliases_array); j++)
        {
          g_autofree gchar *alias_in_overrides = NULL;
          const char *alias = json_array_get_string_element (aliases_array, j);

          alias_in_overrides = g_build_filename (arch->libdir_relative_to_overrides,
                                                 alias, NULL);

          if (fstatat (self->overrides_fd, alias_in_overrides, &stat_buf, AT_SYMLINK_NOFOLLOW) == 0
              && (S_ISLNK (stat_buf.st_mode) || S_ISREG (stat_buf.st_mode)))
            {
              g_info ("SONAME \"%s\" is canonically \"%s\" on host system", soname, alias);
              target = g_build_filename (arch->libdir_in_container, alias, NULL);
            }
        }
    }

  if (target != NULL)
    {
      g_info ("Found override for %s: %s", soname, target);
    }
  else if (g_file_test (soname_in_runtime_usr,
                        (G_FILE_TEST_IS_REGULAR | G_FILE_TEST_IS_SYMLINK)))
    {
      target = g_build_filename ("/usr/lib", arch->tuple, soname, NULL);
      g_info ("Found %s in runtime's /usr/lib: %s", soname, target);
    }
  else if (g_file_test (soname_in_runtime,
                        (G_FILE_TEST_IS_REGULAR | G_FILE_TEST_IS_SYMLINK)))
    {
      target = g_build_filename ("/lib", arch->tuple, soname, NULL);
      g_info ("Found %s in runtime's /lib: %s", soname, target);
    }
  else if (arch->tuple_quark == primary_arch)
    {
      return glnx_throw (error, "The expected library %s is missing from both the runtime "
                         "and the \"overrides\" directory", soname);
    }
  else
    {
      /* Not an error: for runtimes that only have full coverage of the
       * primary architecture (in practice x86_64) and not secondary
       * architectures (in practice i386), it's OK that e.g. libbz2.so.1.0
       * only exists for the primary architecture */
      g_debug ("%s not supported on secondary architecture %s by this runtime",
               soname, arch->tuple);
      return TRUE;
    }

  target_base = glnx_basename (target);

  if (!g_str_equal (target_base, soname))
    {
      /* Our runtime thinks the canonical SONAME of this library is
       * @soname (for example libbz2.so.1.0) but the host OS thinks it's
       * @target_base. Create a symlink so that when a game compiled against
       * the runtime loads @soname, what it actually gets is @target. */
      g_autofree gchar *dest = g_build_filename (arch->aliases_relative_to_overrides,
                                                 soname, NULL);

      g_debug ("Creating alias symlink %s -> %s because runtime and host disagree about the SONAME",
               dest, target);

      if (symlinkat (target, self->overrides_fd, dest) != 0)
        return glnx_throw_errno_prefix (error,
                                        "Unable to create symlink %s -> %s",
                                        dest, target);
    }

  /* For each alternative name @alias, create a symlink so that if a program
   * compiled against neither the runtime nor the host OS tries to load
   * @alias, it will actually get @target. We do this even in the case
   * where the host OS's name for the library (@target_base) is in fact
   * the same as @alias: it's harmless to have slightly too many alias
   * symlinks. */
  for (guint j = 0; j < json_array_get_length (aliases_array); j++)
    {
      const char *alias = json_array_get_string_element (aliases_array, j);
      g_autofree gchar *dest = g_build_filename (arch->aliases_relative_to_overrides,
                                                 alias, NULL);

      g_debug ("Creating alias symlink %s -> %s", dest, target);

      if (symlinkat (target, self->overrides_fd, dest) != 0)
        return glnx_throw_errno_prefix (error,
                                        "Unable to create symlink %s -> %s",
                                        dest, target);
    }

  return TRUE;
}

static gboolean
pv_runtime_create_aliases (PvRuntime *self,
                           RuntimeArchitecture *arch,
                           GError **error)
{
  g_autoptr(JsonParser) parser = NULL;
  G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) timer =
    _srt_profiling_start ("Creating library aliases");
  JsonNode *node = NULL;
  JsonArray *libraries_array = NULL;
  JsonArray *aliases_array = NULL;
  JsonObject *object;

  if (self->runtime_abi_json == NULL)
    {
      g_info ("Runtime ABI JSON not present, not creating library aliases");
      return TRUE;
    }

  parser = json_parser_new ();
  if (!json_parser_load_from_file (parser, self->runtime_abi_json, error))
    return glnx_prefix_error (error, "Error parsing the expected JSON object in \"%s\"",
                              self->runtime_abi_json);

  node = json_parser_get_root (parser);
  object = json_node_get_object (node);

  if (!json_object_has_member (object, "shared_libraries"))
    return glnx_throw (error, "No \"shared_libraries\" in the JSON object \"%s\"",
                       self->runtime_abi_json);

  libraries_array = json_object_get_array_member (object, "shared_libraries");
  if (libraries_array == NULL || json_array_get_length (libraries_array) == 0)
    return TRUE;

  for (guint i = 0; i < json_array_get_length (libraries_array); i++)
    {
      const gchar *soname = NULL;
      g_autoptr(GError) local_error = NULL;
      g_autoptr(GList) members = NULL;

      node = json_array_get_element (libraries_array, i);
      if (!JSON_NODE_HOLDS_OBJECT (node))
        continue;

      object = json_node_get_object (node);

      members = json_object_get_members (object);
      if (members == NULL)
        continue;

      soname = members->data;

      object = json_object_get_object_member (object, soname);
      if (!json_object_has_member (object, "aliases"))
        continue;

      aliases_array = json_object_get_array_member (object, "aliases");
      if (aliases_array == NULL || json_array_get_length (aliases_array) == 0)
        continue;

      if (!pv_runtime_handle_alias (self, arch, soname, aliases_array, &local_error))
        {
          g_warning ("Unable to create library aliases for %s: %s",
                     soname, local_error->message);
          g_clear_error (&local_error);
        }
    }

  return TRUE;
}

/*
 * @patterns: (element-type filename):
 */
static gboolean
collect_vdpau_drivers (PvRuntime *self,
                       RuntimeArchitecture *arch,
                       GPtrArray *patterns,
                       GError **error)
{
  G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) timer =
    _srt_profiling_start ("Collecting VDPAU drivers");
  g_autoptr(GPtrArray) details_arr = NULL;
  g_autoptr(SrtObjectList) vdpau_drivers = NULL;
  /* The VDPAU loader looks up drivers by name, not by readdir(),
   * so order doesn't matter unless there are name collisions. */
  gboolean use_numbered_subdirs = FALSE;

  g_debug ("Enumerating %s VDPAU ICDs on provider...", arch->tuple);
    {
      G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) enum_timer =
        _srt_profiling_start ("Enumerating VDPAU drivers");

      vdpau_drivers = srt_system_info_list_vdpau_drivers (arch->system_info,
                                                          arch->tuple,
                                                          SRT_DRIVER_FLAGS_NONE);
    }

  if (vdpau_drivers == NULL)
    return TRUE;

  self->any_vdpau_drivers = TRUE;
  details_arr = icd_details_array_sized_new (g_list_length (vdpau_drivers));
  icd_details_fill_array_single_arch (details_arr,
                                      arch->tuple_quark,
                                      arch->provider,
                                      vdpau_drivers,
                                      arch->known_arch);

  /* In practice we won't actually use the sequence number for VDPAU
   * because they can only be located in a single directory,
   * so by definition we can't have collisions. Anything that
   * ends up in a numbered subdirectory won't get used. */
  if (!bind_icds (self, arch, "vdpau",
                  (IcdDetails **) details_arr->pdata,
                  details_arr->len,
                  &use_numbered_subdirs, patterns, NULL, error))
    return FALSE;

  return TRUE;
}

/*
 * @patterns: (element-type filename):
 */
static gboolean
collect_dri_drivers (PvRuntime *self,
                     RuntimeArchitecture *arch,
                     GPtrArray *patterns,
                     GString *dri_path,
                     GError **error)
{
  G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) timer =
    _srt_profiling_start ("Collecting DRI and VA-API drivers");
  g_autoptr(GPtrArray) details_arr = NULL;
  g_autoptr(SrtObjectList) dri_drivers = NULL;
  g_autoptr(SrtObjectList) va_api_drivers = NULL;
  /* The DRI loader looks up drivers by name, not by readdir(),
   * so order doesn't matter unless there are name collisions. */
  gboolean use_numbered_subdirs = FALSE;
  gsize j;

  g_debug ("Enumerating %s DRI drivers on provider...", arch->tuple);
    {
      G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) enum_timer =
        _srt_profiling_start ("Enumerating DRI drivers");

      dri_drivers = srt_system_info_list_dri_drivers (arch->system_info,
                                                      arch->tuple,
                                                      SRT_DRIVER_FLAGS_NONE);
    }

  if (arch->provider_features & SRT_GRAPHICS_PROVIDER_FEATURE_FLAGS_VA_API)
    {
      G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) enum_timer =
        _srt_profiling_start ("Enumerating VA-API drivers");

      g_debug ("Enumerating %s VA-API drivers on provider...", arch->tuple);
      va_api_drivers = srt_system_info_list_va_api_drivers (arch->system_info,
                                                            arch->tuple,
                                                            SRT_DRIVER_FLAGS_NONE);
    }

  details_arr = icd_details_array_sized_new (g_list_length (dri_drivers)
                                             + g_list_length (va_api_drivers));
  icd_details_fill_array_single_arch (details_arr,
                                      arch->tuple_quark,
                                      arch->provider,
                                      dri_drivers,
                                      arch->known_arch);
  icd_details_fill_array_single_arch (details_arr,
                                      arch->tuple_quark,
                                      arch->provider,
                                      va_api_drivers,
                                      arch->known_arch);
  j = 0;

  while (j < details_arr->len)
    {
      IcdDetails *details = g_ptr_array_index (details_arr, j);
      const PvModulePerArch *details_arch;
      const char *resolved;

      details_arch = icd_details_get_architecture (details, arch->tuple_quark);

      if (details_arch == NULL)
        continue;

      resolved = details_arch->resolved_library;

      if (SRT_IS_VA_API_DRIVER (details->icd)
          && g_str_has_suffix (resolved, "/nvidia_drv_video.so"))
        {
          /* https://github.com/elFarto/nvidia-vaapi-driver depends on
           * GStreamer, which is rather more than our dependency-handling
           * mechanisms are really prepared to deal with. */
          g_info ("Avoiding use of \"%s\" because it has a lot of dependencies",
                  resolved);
          g_ptr_array_remove_index (details_arr, j);
        }
      else
        {
          j++;
        }
    }

  if (!bind_icds (self, arch, "dri",
                  (IcdDetails **) details_arr->pdata,
                  details_arr->len,
                  &use_numbered_subdirs, patterns, dri_path, error))
    return FALSE;

  return TRUE;
}

/*
 * @search_path: (inout):
 */
static void
pv_append_host_dri_library_paths (PvRuntime *self,
                                  SrtSystemInfo *system_info,
                                  const char *multiarch_tuple,
                                  GString *search_path)
{
  g_autoptr(SrtObjectList) dri_drivers = NULL;
  g_autoptr(SrtObjectList) va_api_drivers = NULL;
  g_autoptr(GHashTable) drivers_set = NULL;
  g_auto(SrtHashTableIter) iter = SRT_HASH_TABLE_ITER_CLEARED;
  const gchar *drivers_path = NULL;

  g_return_if_fail (search_path != NULL);

  drivers_set = g_hash_table_new_full (g_str_hash, g_str_equal, g_free, NULL);

  g_debug ("Enumerating %s DRI drivers on host...", multiarch_tuple);
  {
    G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) enum_timer =
      _srt_profiling_start ("Enumerating host DRI drivers");

    dri_drivers = srt_system_info_list_dri_drivers (system_info,
                                                    multiarch_tuple,
                                                    SRT_DRIVER_FLAGS_NONE);
  }

  for (const GList *icd_iter = dri_drivers;
       icd_iter != NULL;
       icd_iter = icd_iter->next)
    {
      g_assert (SRT_IS_DRI_DRIVER (icd_iter->data));
      SrtDriDriver *driver = icd_iter->data;
      g_autofree gchar *driver_path = NULL;
      const gchar *lib_path = srt_dri_driver_get_library_path (driver);

      g_debug ("Found DRI driver: %s", lib_path);
      driver_path = g_path_get_dirname (lib_path);
      if (!g_hash_table_contains (drivers_set, driver_path))
        g_hash_table_add (drivers_set, g_steal_pointer (&driver_path));
    }

  g_debug ("Enumerating %s VA-API drivers on host...", multiarch_tuple);
    {
      G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) enum_timer =
        _srt_profiling_start ("Enumerating host VA-API drivers");

      va_api_drivers = srt_system_info_list_va_api_drivers (system_info,
                                                            multiarch_tuple,
                                                            SRT_DRIVER_FLAGS_NONE);
    }

  for (const GList *icd_iter = va_api_drivers;
       icd_iter != NULL;
       icd_iter = icd_iter->next)
    {
      g_assert (SRT_IS_VA_API_DRIVER (icd_iter->data));
      SrtVaApiDriver *driver = icd_iter->data;
      g_autofree gchar *driver_path = NULL;
      const gchar *lib_path = srt_va_api_driver_get_library_path (driver);

      g_debug ("Found VA-API driver: %s", lib_path);
      driver_path = g_path_get_dirname (lib_path);
      if (!g_hash_table_contains (drivers_set, driver_path))
        g_hash_table_add (drivers_set, g_steal_pointer (&driver_path));
    }

  _srt_hash_table_iter_init_sorted (&iter, drivers_set,
                                    self->arbitrary_str_order);

  while (_srt_hash_table_iter_next (&iter, &drivers_path, NULL))
    _srt_search_path_append (search_path, drivers_path);
}

/*
 * @patterns: (element-type filename):
 */
static gboolean
collect_gbm_backends (PvRuntime *self,
                      RuntimeArchitecture *arch,
                      GPtrArray *patterns,
                      GString *gbm_path,
                      GError **error)
{
  G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) timer =
    _srt_profiling_start ("Collecting GBM backends");
  g_autoptr(GPtrArray) details_arr = NULL;
  g_autoptr(SrtObjectList) gbm_backends = NULL;
  /* The GBM loader looks up backends by name, not by readdir(),
   * so order doesn't matter unless there are name collisions. */
  gboolean use_numbered_subdirs = FALSE;

  g_debug ("Enumerating %s GBM backends on provider...", arch->tuple);
    {
      G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) enum_timer =
        _srt_profiling_start ("Enumerating GBM backends");

      gbm_backends = srt_system_info_list_gbm_backends (arch->system_info,
                                                        arch->tuple,
                                                        SRT_DRIVER_FLAGS_NONE);
    }

  if (gbm_backends == NULL)
    return TRUE;

  details_arr = icd_details_array_sized_new (g_list_length (gbm_backends));
  icd_details_fill_array_single_arch (details_arr,
                                      arch->tuple_quark,
                                      arch->provider,
                                      gbm_backends,
                                      arch->known_arch);

  if (!bind_icds (self, arch, "gbm",
                  (IcdDetails **) details_arr->pdata,
                  details_arr->len,
                  &use_numbered_subdirs, patterns, gbm_path, error))
    return FALSE;

  return TRUE;
}

/*
 * @search_path: (inout):
 */
static void
pv_append_host_gbm_library_paths (PvRuntime *self,
                                  SrtSystemInfo *system_info,
                                  const char *multiarch_tuple,
                                  GString *search_path)
{
  g_autoptr(SrtObjectList) gbm_backends = NULL;
  g_autoptr(GHashTable) backends_set = NULL;
  g_auto(SrtHashTableIter) iter = SRT_HASH_TABLE_ITER_CLEARED;
  const gchar *backends_path = NULL;

  g_return_if_fail (search_path != NULL);

  backends_set = g_hash_table_new_full (g_str_hash, g_str_equal, g_free, NULL);

  g_debug ("Enumerating %s GBM backends on host...", multiarch_tuple);
  {
    G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) enum_timer =
      _srt_profiling_start ("Enumerating host GBM backends");

    gbm_backends = srt_system_info_list_gbm_backends (system_info,
                                                      multiarch_tuple,
                                                      SRT_DRIVER_FLAGS_NONE);
  }

  for (const GList *icd_iter = gbm_backends;
       icd_iter != NULL;
       icd_iter = icd_iter->next)
    {
      g_assert (SRT_IS_GBM_BACKEND (icd_iter->data));
      SrtGbmBackend *backend = icd_iter->data;
      g_autofree gchar *backend_path = NULL;
      const gchar *lib_path = srt_gbm_backend_get_library_path (backend);

      g_debug ("Found GBM backend: %s", lib_path);
      backend_path = g_path_get_dirname (lib_path);
      if (!g_hash_table_contains (backends_set, backend_path))
        g_hash_table_add (backends_set, g_steal_pointer (&backend_path));
    }

  _srt_hash_table_iter_init_sorted (&iter, backends_set,
                                    self->arbitrary_str_order);

  while (_srt_hash_table_iter_next (&iter, &backends_path, NULL))
    _srt_search_path_append (search_path, backends_path);
}

/* Prepend the given @new_entry to the colon-delimited directory list in the
 * original environment variable @var (in turn defaulting that to @default_)
 * if not given.
 *
 * Reference for the variables and defaults:
 * https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html
 */
static void
pv_runtime_prepend_to_xdg_dirs (PvRuntime *self,
                                SrtEnvOverlay *container_env,
                                const char *new_entry,
                                const char *var,
                                const char *default_)
{
  const gchar *current_dirs;
  g_autofree gchar *prepended_dirs = NULL;

  current_dirs = g_environ_getenv (self->original_environ, var) ?: default_;
  prepended_dirs = g_strdup_printf ("%s:%s", new_entry, current_dirs);
  _srt_env_overlay_set (container_env, var, prepended_dirs);
}

/* Set @var to ${prefix}/${suffix}, assumed to be the common prefix of
 * all colon-delimited entries in @path.
 *
 * If any colon-delimited entry in @path is not in
 * ${prefix}/${suffix}, log a warning.
 *
 * If @var is null, don't set anything but still do the checks.
 *
 * If @path is empty, mark @var to be unset instead. */
static void
env_overlay_set_common_directory (SrtEnvOverlay *container_env,
                                  const char *var,
                                  const GString *path,
                                  const char *prefix,
                                  const char *suffix)
{
  g_autofree char *dir = g_build_filename (prefix, suffix, NULL);
  g_auto(GStrv) entries = NULL;

  if (path->len == 0)
    {
      if (var != NULL)
        _srt_env_overlay_set (container_env, var, NULL);

      return;
    }

  entries = g_strsplit (path->str, ":", -1);

  if (entries == NULL)
    return;

  for (size_t i = 0; entries[i] != NULL; i++)
    {
      const char *after = _srt_get_path_after (entries[i], dir);

      if (after == NULL
          || strstr (after, "/") != NULL)
        g_critical ("%s is not in %s", entries[i], dir);
    }

  if (var != NULL)
    _srt_env_overlay_set (container_env, var, dir);
}

#define OPENXR_1_RUNTIME_OVERRIDES_PREFIX "etc/xdg"

/*
 * Set @var to @val in @overlay, except that if @val has a length of
 * zero, mark @var to be unset instead.
 */
static void
env_overlay_set_unset_zero_length (SrtEnvOverlay *overlay,
                                   const char *var,
                                   const GString *val)
{
  if (val->len != 0)
    _srt_env_overlay_set (overlay, var, val->str);
  else
    _srt_env_overlay_set (overlay, var, NULL);
}

static gboolean
pv_runtime_use_provider_graphics_stack (PvRuntime *self,
                                        FlatpakBwrap *bwrap,
                                        SrtEnvOverlay *container_env,
                                        GError **error)
{
  g_autoptr(GString) dri_path = g_string_new ("");
  g_autoptr(GString) gbm_path = g_string_new ("");
  g_autoptr(GString) egl_path = g_string_new ("");
  g_autoptr(GString) egl_ext_platform_path = g_string_new ("");
  g_autoptr(GString) vulkan_path = g_string_new ("");
  /* We are currently using the explicit and implicit Vulkan layer paths
   * and the OpenXR paths only to check if we binded at least a single layer */
  g_autoptr(GString) vulkan_exp_layer_path = g_string_new ("");
  g_autoptr(GString) vulkan_imp_layer_path = g_string_new ("");
  g_autoptr(GString) openxr_1_runtime_path = g_string_new ("");
  g_autoptr(GString) openxr_1_exp_layer_path = g_string_new ("");
  g_autoptr(GString) openxr_1_imp_layer_path = g_string_new ("");
  g_autoptr(GString) va_api_path = g_string_new ("");
  gboolean any_architecture_works = FALSE;
  g_autoptr(IcdStack) provider_stack = NULL;
  g_autoptr(IcdStack) host_stack = NULL;
  G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) timer = NULL;
  g_autoptr(SrtProfilingTimer) part_timer = NULL;
  gboolean all_libglx_from_provider = TRUE;
  gboolean all_libdrm_from_provider = TRUE;
  g_auto(PvRuntimeLibraryData) drirc_data_in_provider = {};
  g_auto(PvRuntimeLibraryData) libdrm_data_in_provider = {};
  g_auto(PvRuntimeLibraryData) nvidia_data_in_provider = {};
  g_auto(PvRuntimeLibraryData) gconv_in_provider = {};

  g_return_val_if_fail (PV_IS_RUNTIME (self), FALSE);
  g_return_val_if_fail (self->providers != NULL, FALSE);
  g_return_val_if_fail (bwrap != NULL || self->mutable_sysroot != NULL, FALSE);
  g_return_val_if_fail (bwrap == NULL || !pv_bwrap_was_finished (bwrap), FALSE);
  g_return_val_if_fail (container_env != NULL, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  timer = _srt_profiling_start ("Using graphics stack from provider(s)");

  if (!pv_runtime_provide_container_access (self, error))
    return FALSE;

  provider_stack = icd_stack_new ();

  for (size_t i = 0; i < self->providers->len; i++)
    {
      PvGraphicsProvider *provider = g_ptr_array_index (self->providers, i);

      if (provider->flags & PV_GRAPHICS_PROVIDER_FLAGS_INTERPRETER_HOST)
        {
          PvRuntimeFlags host_flags = self->flags;

          /* We currently assume there are no FEX thunks for OpenXR */
          host_flags &= ~PV_RUNTIME_FLAGS_IMPORT_OPENXR_1_RUNTIMES;
          host_flags &= ~PV_RUNTIME_FLAGS_IMPORT_OPENXR_1_LAYERS;

          if (host_stack == NULL)
            host_stack = icd_stack_new ();

          icd_stack_enumerate (host_stack,
                               host_flags,
                               provider,
                               "host");
        }
      else
        {
          icd_stack_enumerate (provider_stack,
                               self->flags,
                               provider,
                               "provider");
        }
    }

  /* We set this FALSE later if we decide not to use the provider libc
   * for some architecture. */
  self->all_libc_from_provider = TRUE;

  pv_runtime_library_data_init (&drirc_data_in_provider);
  pv_runtime_library_data_init (&libdrm_data_in_provider);
  pv_runtime_library_data_init (&nvidia_data_in_provider);
  pv_runtime_library_data_init (&gconv_in_provider);

  for (size_t i = 0; i < self->tuples->len; i++)
    {
      GQuark tuple_quark = g_array_index (self->tuples, GQuark, i);
      const char *tuple = g_quark_to_string (tuple_quark);
      g_autoptr(GError) local_error = NULL;
      g_auto (RuntimeArchitecture) arch_on_stack = { NULL };
      RuntimeArchitecture *arch = &arch_on_stack;

      part_timer = _srt_profiling_start ("%s libraries", tuple);
      g_debug ("Checking for %s libraries...", tuple);

      if (runtime_architecture_init (arch, self, tuple_quark, &local_error))
        {
          g_autoptr(GPtrArray) dirs = NULL;
          g_autofree gchar *this_dri_path_in_container = g_build_filename (arch->libdir_in_container,
                                                                           "dri", NULL);
          g_autofree gchar *this_gbm_path_in_container = g_build_filename (arch->libdir_in_container,
                                                                           "gbm", NULL);
          /* Can either be relative to the sysroot, or absolute */
          g_autofree gchar *ld_so_in_runtime = NULL;
          g_autofree gchar *libdrm = NULL;
          g_autofree gchar *libdrm_amdgpu = NULL;
          g_autofree gchar *libglx_mesa = NULL;
          g_autofree gchar *libglx_nvidia = NULL;
          g_autoptr(GPtrArray) patterns = NULL;

          if (!pv_runtime_get_ld_so (self, arch, &ld_so_in_runtime, error))
            return FALSE;

          if (ld_so_in_runtime == NULL)
            {
              g_info ("Container does not have %s, using interoperable path as-is",
                      arch->ld_so);
              ld_so_in_runtime = g_strdup (arch->ld_so);
            }

          /* Reserve a size of 128 to avoid frequent reallocation due to the
           * expected high number of patterns that will be added to the array. */
          patterns = g_ptr_array_new_full (128, g_free);

          any_architecture_works = TRUE;
          g_debug ("Container path: %s -> %s",
                   arch->ld_so, ld_so_in_runtime);

          _srt_search_path_append (dri_path, this_dri_path_in_container);
          _srt_search_path_append (gbm_path, this_gbm_path_in_container);
          _srt_search_path_append (va_api_path, this_dri_path_in_container);

          if (!glnx_shutil_mkdir_p_at (self->overrides_fd,
                                       arch->libdir_relative_to_overrides,
                                       0755, NULL, error))
            {
              g_prefix_error (error, "Unable to create \"%s/%s/\": ",
                              self->overrides,
                              arch->libdir_relative_to_overrides);
              return FALSE;
            }

          if (!glnx_shutil_mkdir_p_at (self->overrides_fd,
                                       arch->aliases_relative_to_overrides,
                                       0755, NULL, error))
            {
              g_prefix_error (error, "Unable to create and open \"%s/%s/\": ",
                              self->overrides,
                              arch->aliases_relative_to_overrides);
              return FALSE;
            }

          g_debug ("Collecting graphics drivers from provider system...");

          collect_core_libraries_patterns (self, arch, patterns);
          collect_graphics_libraries_patterns (self, arch, patterns);

          if (!collect_json_based_drivers (self,
                                           arch,
                                           "EGL drivers",
                                           provider_stack->egl_icd_details,
                                           "glvnd",
                                           patterns,
                                           error))
            return FALSE;

          if (!collect_json_based_drivers (self,
                                           arch,
                                           "EGL external platforms",
                                           provider_stack->egl_ext_platform_details,
                                           "egl_external_platform",
                                           patterns,
                                           error))
            return FALSE;

          if (!collect_json_based_drivers (self,
                                           arch,
                                           "Vulkan drivers",
                                           provider_stack->vulkan_icd_details,
                                           "vulkan",
                                           patterns,
                                           error))
            return FALSE;

          if (self->flags & PV_RUNTIME_FLAGS_IMPORT_VULKAN_LAYERS)
            {
              if (!collect_json_based_drivers (self,
                                               arch,
                                               "Vulkan explicit layers",
                                               provider_stack->vulkan_exp_layer_details,
                                               "vulkan_exp_layer",
                                               patterns,
                                               error))
                return FALSE;

              if (!collect_json_based_drivers (self,
                                               arch,
                                               "Vulkan implicit layers",
                                               provider_stack->vulkan_imp_layer_details,
                                               "vulkan_imp_layer",
                                               patterns,
                                               error))
                return FALSE;
            }

          if ((self->flags & PV_RUNTIME_FLAGS_IMPORT_OPENXR_1_RUNTIMES)
              && !collect_openxr_1_runtime (self, arch, provider_stack->openxr_1_runtime_details,
                                            patterns, error))
            return FALSE;

          if (self->flags & PV_RUNTIME_FLAGS_IMPORT_OPENXR_1_LAYERS)
            {
              if (!collect_json_based_drivers (self,
                                               arch,
                                               "OpenXR explicit layers",
                                               provider_stack->openxr_1_exp_layer_details,
                                               "openxr_1_exp_layer",
                                               patterns,
                                               error))
                return FALSE;

              if (!collect_json_based_drivers (self,
                                               arch,
                                               "OpenXR implicit layers",
                                               provider_stack->openxr_1_imp_layer_details,
                                               "openxr_1_imp_layer",
                                               patterns,
                                               error))
                return FALSE;
            }

          if (arch->provider_features & SRT_GRAPHICS_PROVIDER_FEATURE_FLAGS_VDPAU)
            {
              if (!collect_vdpau_drivers (self, arch, patterns, error))
                return FALSE;
            }

          if (!collect_dri_drivers (self, arch, patterns, dri_path, error))
            return FALSE;

          if (!collect_gbm_backends (self, arch, patterns, gbm_path, error))
            return FALSE;

          /* We always have at least one pattern, because
           * collect_graphics_libraries_patterns() unconditionally
           * adds some, so we don't need to conditionalize this call
           * to capsule-capture-libs */
          g_assert (patterns->len > 0);
          g_assert (patterns->pdata != NULL);

          if (!pv_runtime_capture_libraries (self, arch,
                                             arch->libdir_relative_to_overrides,
                                             "Main capsule-capture-libs call",
                                             (const char * const *) patterns->pdata,
                                             patterns->len, error))
            return FALSE;

          for (size_t j = 0; j < G_N_ELEMENTS (library_families); j++)
            {
              g_autofree gchar *soname_symlink = NULL;
              gboolean was_captured = FALSE;

              pv_runtime_capture_relatives (self, arch, &library_families[j],
                                            &soname_symlink, &was_captured);

              if (j == 0)
                {
                  /* We assume libc.so.6 is the first entry */
                  g_assert (g_str_equal (library_families[j].soname, "libc.so.6"));
                  self->any_libc_from_provider |= was_captured;
                  self->all_libc_from_provider &= was_captured;

                  /* If we are using the provider's glibc (likely) then
                   * we must also use its ld.so, and ideally its
                   * gconv modules too. */
                  if (was_captured
                      && !pv_runtime_collect_libc_family (self, arch,
                                                          bwrap,
                                                          soname_symlink,
                                                          ld_so_in_runtime,
                                                          &gconv_in_provider,
                                                          error))
                    return FALSE;
                }
            }

          libdrm = g_build_filename (arch->libdir_relative_to_overrides,
                                     "libdrm.so.2", NULL);
          libdrm_amdgpu = g_build_filename (arch->libdir_relative_to_overrides,
                                            "libdrm_amdgpu.so.1", NULL);

          /* If we have libdrm_amdgpu.so.1 in overrides we also want to mount
           * ${prefix}/share/libdrm from the provider. ${prefix} is derived from
           * the absolute path of libdrm_amdgpu.so.1 */
          if (!pv_runtime_collect_lib_symlink_data (self, arch, "libdrm",
                                                    libdrm_amdgpu,
                                                    PV_RUNTIME_DATA_FLAGS_NONE,
                                                    &libdrm_data_in_provider)
              && !pv_runtime_collect_lib_symlink_data (self, arch, "libdrm",
                                                       libdrm,
                                                       PV_RUNTIME_DATA_FLAGS_NONE,
                                                       &libdrm_data_in_provider))
            {
              /* For at least a single architecture, libdrm is newer in the container */
              all_libdrm_from_provider = FALSE;
            }

          libglx_mesa = g_build_filename (arch->libdir_relative_to_overrides,
                                          "libGLX_mesa.so.0", NULL);

          /* If we have libGLX_mesa.so.0 in overrides we also want to mount
           * ${prefix}/share/drirc.d from the provider.
           * Similar to collect_mesa_drirc(), we can't know the hard-coded
           * path, so the best we can do is to assume that it's in a
           * conventional layout relative to the actual library. */
          if (!pv_runtime_collect_lib_symlink_data (self, arch, "drirc.d",
                                                    libglx_mesa,
                                                    PV_RUNTIME_DATA_FLAGS_NONE,
                                                    &drirc_data_in_provider))
            {
              /* For at least a single architecture, libGLX_mesa is newer in the container */
              all_libglx_from_provider = FALSE;
            }

          collect_mesa_drirc (self, arch, provider_stack->egl_icd_details,
                              provider_stack->vulkan_icd_details,
                              &drirc_data_in_provider);

          libglx_nvidia = g_build_filename (arch->libdir_relative_to_overrides,
                                            "libGLX_nvidia.so.0", NULL);

          /* If we have libGLX_nvidia.so.0 in overrides we also want to mount
           * /usr/share/nvidia from the provider. In this case it's
           * /usr/share/nvidia that is the preferred path, with
           * ${prefix}/share/nvidia as a fallback. */
          pv_runtime_collect_lib_symlink_data (self, arch, "nvidia",
                                               libglx_nvidia,
                                               PV_RUNTIME_DATA_FLAGS_USR_SHARE_FIRST,
                                               &nvidia_data_in_provider);

          dirs = _srt_known_architecture_get_libdirs (arch->tuple,
                                                      arch->known_arch,
                                                      SRT_LIBDIRS_FLAGS_NONE);

          for (size_t j = 0; j < dirs->len; j++)
            {
              if (!collect_s2tc (self, arch,
                                 g_ptr_array_index (dirs, j),
                                 error))
                return FALSE;
            }

          if (!pv_runtime_create_aliases (self, arch, &local_error))
            {
              /* This is not a critical error, try to continue */
              g_warning ("Unable to create library aliases: %s",
                         local_error->message);
              g_clear_error (&local_error);
              continue;
            }

          /* Make sure we do this last, so that we have really copied
           * everything from the provider that we are going to */
          if (self->mutable_sysroot != NULL &&
              !pv_runtime_remove_overridden_libraries (self, arch, error))
            return FALSE;
        }
      else
        {
          _srt_log_warning ("%s", local_error->message);
        }

      g_clear_pointer (&part_timer, _srt_profiling_end);
    }

  /* In practice we will only have one graphics stack provider for the
   * interpreter host, but for completeness, iterate through 0 or more */
  for (size_t j = 0; j < self->providers->len; j++)
    {
      PvGraphicsProvider *provider = g_ptr_array_index (self->providers, j);
      gsize n;
      const GQuark *host_tuples;

      if (!(provider->flags & PV_GRAPHICS_PROVIDER_FLAGS_INTERPRETER_HOST))
        continue;

      host_tuples = pv_graphics_provider_get_architectures (provider, &n);

      for (size_t i = 0; i < n; i++)
        {
          GQuark arch_quark = host_tuples[i];
          SrtSystemInfo *arch_system_info;
          const char *tuple = g_quark_to_string (arch_quark);

          arch_system_info = pv_graphics_provider_get_system_info (provider,
                                                                   arch_quark);
          pv_append_host_dri_library_paths (self,
                                            arch_system_info,
                                            tuple,
                                            dri_path);
          pv_append_host_gbm_library_paths (self,
                                            arch_system_info,
                                            tuple,
                                            gbm_path);
        }
    }

  part_timer = _srt_profiling_start ("Finishing graphics stack capture");

  if (!any_architecture_works)
    {
      g_autoptr(GString) archs = g_string_new ("");

      for (size_t i = 0; i < self->tuples->len; i++)
        {
          GQuark tuple_quark = g_array_index (self->tuples, GQuark, i);

          if (archs->len > 0)
            g_string_append (archs, ", ");

          g_string_append (archs, g_quark_to_string (tuple_quark));
        }

      g_set_error (error, G_IO_ERROR, G_IO_ERROR_FAILED,
                   "None of the supported CPU architectures are common to "
                   "the graphics provider and the container (tried: %s)",
                   archs->str);
      return FALSE;
    }

  if (!pv_runtime_finish_libc_family (self, bwrap, &gconv_in_provider, error))
    return FALSE;

  if (!pv_runtime_finish_lib_data (self, bwrap, "libdrm", "libdrm",
                                   all_libdrm_from_provider,
                                   &libdrm_data_in_provider, error))
    return FALSE;

  if (!pv_runtime_finish_lib_data (self, bwrap, "drirc.d", "libGLX_mesa.so.0",
                                   all_libglx_from_provider,
                                   &drirc_data_in_provider, error))
    return FALSE;

  if (!pv_runtime_finish_lib_data (self, bwrap, "nvidia", "libGLX_nvidia.so.0",
                                   TRUE, &nvidia_data_in_provider, error))
    return FALSE;

  if (!pv_runtime_take_misc_data_from_provider (self, bwrap, error))
    return FALSE;

  /*
   * Write out JSON manifests in ${overrides} describing the EGL ICDs,
   * Vulkan drivers, and any other JSON-based modules. We need to do this
   * because the original `library_path` might be a host path like
   * /usr/lib/libfoo.so, but the JSON manifest seen inside the container
   * needs to refer to that path more like /run/host/usr/lib/libfoo.so.
   */

  g_debug ("Setting up EGL ICD JSON...");

  if (!setup_each_json_manifest (self, bwrap, "share/glvnd/egl_vendor.d",
                                 provider_stack->egl_icd_details, egl_path, error))
    return FALSE;

  if (host_stack != NULL
      && host_stack->egl_icd_details != NULL)
    {
      for (size_t i = 0; i < host_stack->egl_icd_details->len; i++)
        {
          IcdDetails *details = g_ptr_array_index (host_stack->egl_icd_details, i);
          SrtEglIcd *icd = SRT_EGL_ICD (details->icd);
          _srt_search_path_append (egl_path, srt_egl_icd_get_json_path (icd));
        }
    }

  if (!setup_each_json_manifest (self, bwrap, "share/egl/egl_external_platform.d",
                                 provider_stack->egl_ext_platform_details,
                                 egl_ext_platform_path, error))
    return FALSE;

  if (host_stack != NULL
      && host_stack->egl_ext_platform_details != NULL)
    {
      for (size_t i = 0; i < host_stack->egl_ext_platform_details->len; i++)
        {
          IcdDetails *details = g_ptr_array_index (host_stack->egl_ext_platform_details, i);
          SrtEglExternalPlatform *ext_platform = SRT_EGL_EXTERNAL_PLATFORM (details->icd);
          _srt_search_path_append (egl_ext_platform_path,
                                   srt_egl_external_platform_get_json_path (ext_platform));
        }
    }

  g_debug ("Setting up Vulkan ICD JSON...");
  if (!setup_each_json_manifest (self, bwrap, "share/vulkan/icd.d",
                                 provider_stack->vulkan_icd_details, vulkan_path, error))
    return FALSE;

  if (host_stack != NULL
      && host_stack->vulkan_icd_details != NULL)
    {
      for (size_t i = 0; i < host_stack->vulkan_icd_details->len; i++)
        {
          IcdDetails *details = g_ptr_array_index (host_stack->vulkan_icd_details, i);
          SrtVulkanIcd *icd = SRT_VULKAN_ICD (details->icd);
          _srt_search_path_append (vulkan_path, srt_vulkan_icd_get_json_path (icd));
        }
    }

  if (self->flags & PV_RUNTIME_FLAGS_IMPORT_VULKAN_LAYERS)
    {
      g_debug ("Setting up Vulkan explicit layer JSON...");
      if (!setup_each_json_manifest (self, bwrap, "share/vulkan/explicit_layer.d",
                                     provider_stack->vulkan_exp_layer_details,
                                     vulkan_exp_layer_path, error))
        return FALSE;

      if (host_stack != NULL
          && host_stack->vulkan_exp_layer_details != NULL)
        {
          for (size_t i = 0; i < host_stack->vulkan_exp_layer_details->len; i++)
            {
              IcdDetails *details = g_ptr_array_index (host_stack->vulkan_exp_layer_details, i);
              SrtVulkanLayer *layer = SRT_VULKAN_LAYER (details->icd);
              _srt_search_path_append (vulkan_exp_layer_path, srt_vulkan_layer_get_json_path (layer));
            }
        }

      g_debug ("Setting up Vulkan implicit layer JSON...");
      if (!setup_each_json_manifest (self, bwrap, "share/vulkan/implicit_layer.d",
                                     provider_stack->vulkan_imp_layer_details,
                                     vulkan_imp_layer_path, error))
        return FALSE;

      if (host_stack != NULL
          && host_stack->vulkan_imp_layer_details != NULL)
        {
          for (size_t i = 0; i < host_stack->vulkan_imp_layer_details->len; i++)
            {
              IcdDetails *details = g_ptr_array_index (host_stack->vulkan_imp_layer_details, i);
              SrtVulkanLayer *layer = SRT_VULKAN_LAYER (details->icd);
              _srt_search_path_append (vulkan_imp_layer_path, srt_vulkan_layer_get_json_path (layer));
            }
        }
    }

  if ((self->flags & PV_RUNTIME_FLAGS_IMPORT_OPENXR_1_RUNTIMES)
      && g_hash_table_size (provider_stack->openxr_1_runtime_details) > 0)
    {
      gpointer details;
      GHashTableIter iter;

      g_debug ("Setting up OpenXR 1 runtime JSON...");

      g_hash_table_iter_init (&iter, provider_stack->openxr_1_runtime_details);
      while (g_hash_table_iter_next (&iter, NULL, &details))
        {
          if (!setup_json_manifest (self, bwrap,
                                    OPENXR_1_RUNTIME_OVERRIDES_PREFIX
                                      "/" _SRT_GRAPHICS_OPENXR_1_RUNTIME_SUFFIX,
                                    details,
                                    0, 0,        /* no sequence number used */
                                    NULL,        /* no deduplication required */
                                    openxr_1_runtime_path, error))
            return FALSE;
        }
    }

  if (self->flags & PV_RUNTIME_FLAGS_IMPORT_OPENXR_1_LAYERS)
    {
      g_debug ("Setting up OpenXR explicit layer JSON...");
      if (!setup_each_json_manifest (self, bwrap,
                                     "share/" _SRT_GRAPHICS_OPENXR_1_EXPLICIT_LAYER_SUFFIX,
                                     provider_stack->openxr_1_exp_layer_details,
                                     openxr_1_exp_layer_path, error))
        return FALSE;

      if (host_stack != NULL
          && host_stack->openxr_1_exp_layer_details != NULL)
        {
          for (size_t i = 0; i < host_stack->openxr_1_exp_layer_details->len; i++)
            {
              IcdDetails *details = g_ptr_array_index (host_stack->openxr_1_exp_layer_details, i);
              SrtOpenXr1Layer *layer = SRT_OPENXR_1_LAYER (details->icd);
              _srt_search_path_append (openxr_1_exp_layer_path, srt_openxr_1_layer_get_json_path (layer));
            }
        }

      g_debug ("Setting up OpenXR implicit layer JSON...");
      if (!setup_each_json_manifest (self, bwrap,
                                     "share/" _SRT_GRAPHICS_OPENXR_1_IMPLICIT_LAYER_SUFFIX,
                                     provider_stack->openxr_1_imp_layer_details,
                                     openxr_1_imp_layer_path, error))
        return FALSE;

      if (host_stack != NULL
          && host_stack->openxr_1_imp_layer_details != NULL)
        {
          for (size_t i = 0; i < host_stack->openxr_1_imp_layer_details->len; i++)
            {
              IcdDetails *details = g_ptr_array_index (host_stack->openxr_1_imp_layer_details, i);
              SrtOpenXr1Layer *layer = SRT_OPENXR_1_LAYER (details->icd);
              _srt_search_path_append (openxr_1_imp_layer_path, srt_openxr_1_layer_get_json_path (layer));
            }
        }
    }

  /*
   * Set environment variables forcing the various loaders
   * (Vulkan-Loader, GLVND, etc.) to load exactly the drivers/layers/etc.
   * that we found, ideally in exactly the same order that we found them.
   *
   * If there is more than one variable controlling search order,
   * usually we set the one we want to use and unset all the others,
   * to avoid the others leaking into the container and causing an
   * unintended search order. For example we set
   * __EGL_VENDOR_LIBRARY_FILENAMES and unset __EGL_VENDOR_LIBRARY_DIRS,
   * and similarly, set VK_LAYER_PATH and unset VK_ADD_LAYER_PATH.
   *
   * For backward compatibility, sometimes we need to set both an "old"
   * and "new" variable so that old and new loaders will both do what we
   * want, for example setting both VK_DRIVER_FILES and VK_ICD_FILENAMES.
   */

  env_overlay_set_unset_zero_length (container_env,
                                     "LIBGL_DRIVERS_PATH",
                                     dri_path);
  env_overlay_set_unset_zero_length (container_env,
                                     "LIBVA_DRIVERS_PATH",
                                     dri_path);
  env_overlay_set_unset_zero_length (container_env,
                                     "GBM_BACKENDS_PATH",
                                     gbm_path);

  env_overlay_set_unset_zero_length (container_env,
                                     "__EGL_VENDOR_LIBRARY_FILENAMES",
                                     egl_path);
  /* Unset so __EGL_VENDOR_LIBRARY_FILENAMES will be used instead */
  _srt_env_overlay_set (container_env, "__EGL_VENDOR_LIBRARY_DIRS", NULL);

  env_overlay_set_unset_zero_length (container_env,
                                     "__EGL_EXTERNAL_PLATFORM_CONFIG_FILENAMES",
                                     egl_ext_platform_path);
  _srt_env_overlay_set (container_env, "__EGL_EXTERNAL_PLATFORM_CONFIG_DIRS", NULL);

  env_overlay_set_unset_zero_length (container_env,
                                     "VK_DRIVER_FILES",
                                     vulkan_path);
  /* VK_ICD_FILENAMES is deprecated, VK_DRIVER_FILES takes precedence.
   * Until all branches of the Steam Runtime have a Vulkan-Loader
   * that supports VK_DRIVER_FILES, we need to set both:
   * old Vulkan-Loader versions will use the old variable, while new
   * versions will use the new one. */
  env_overlay_set_unset_zero_length (container_env,
                                     "VK_ICD_FILENAMES",
                                     vulkan_path);

  /* Setting VK_DRIVER_FILES now disables this, but that wasn't the case
   * in Vulkan-Loader 1.3.207, and it seems clearer if we unset it anyway. */
  _srt_env_overlay_set (container_env, "VK_ADD_DRIVER_FILES", NULL);

  if (self->flags & (PV_RUNTIME_FLAGS_IMPORT_VULKAN_LAYERS
                     | PV_RUNTIME_FLAGS_IMPORT_OPENXR_1_LAYERS))
    {
      /* OpenXR has no equivalent of XR_API_LAYER_PATH for implicit layers,
       * and similarly in Vulkan,
       * VK_IMPLICIT_LAYER_PATH wasn't implemented until Vulkan-Loader
       * 1.3.296 which we can't guarantee to have. So instead of relying on
       * these environment variables, we prepend our "/overrides/share" to
       * "XDG_DATA_DIRS" to cover any explicit and implicit layers that we may
       * have. */
      if (vulkan_exp_layer_path->len != 0
          || vulkan_imp_layer_path->len != 0
          || openxr_1_exp_layer_path->len != 0
          || openxr_1_imp_layer_path->len != 0)
        {
          g_autofree gchar *override_share =
            g_build_filename (self->overrides_in_container, "share", NULL);

          /* We are relying here on setup_json_manifest() having generated
           * all the layers' JSON manifests in the same directory.
           * Where possible, we might as well set the environment
           * variable to tell the loader more explicitly where to look,
           * rather than using the indirection through XDG_DATA_DIRS. */
          env_overlay_set_common_directory (container_env,
                                            "VK_LAYER_PATH",
                                            vulkan_exp_layer_path,
                                            override_share,
                                            _SRT_GRAPHICS_EXPLICIT_VULKAN_LAYER_SUFFIX);
          env_overlay_set_common_directory (container_env,
                                            "VK_IMPLICIT_LAYER_PATH",
                                            vulkan_imp_layer_path,
                                            override_share,
                                            _SRT_GRAPHICS_IMPLICIT_VULKAN_LAYER_SUFFIX);
          env_overlay_set_common_directory (container_env,
                                            "XR_API_LAYER_PATH",
                                            openxr_1_exp_layer_path,
                                            override_share,
                                            _SRT_GRAPHICS_OPENXR_1_EXPLICIT_LAYER_SUFFIX);
          env_overlay_set_common_directory (container_env,
                                            NULL,
                                            openxr_1_imp_layer_path,
                                            override_share,
                                            _SRT_GRAPHICS_OPENXR_1_IMPLICIT_LAYER_SUFFIX);

          pv_runtime_prepend_to_xdg_dirs (self, container_env, override_share,
                                          _SRT_XDG_DATA_DIRS_VAR,
                                          _SRT_XDG_DATA_DIRS_DEFAULT);
        }
      else
        {
          _srt_env_overlay_set (container_env, "VK_LAYER_PATH", NULL);
          _srt_env_overlay_set (container_env, "VK_IMPLICIT_LAYER_PATH", NULL);
          _srt_env_overlay_set (container_env, "XR_API_LAYER_PATH", NULL);
        }

      _srt_env_overlay_set (container_env, "VK_ADD_LAYER_PATH", NULL);
      _srt_env_overlay_set (container_env, "VK_ADD_IMPLICIT_LAYER_PATH", NULL);
    }

  if (self->flags & PV_RUNTIME_FLAGS_IMPORT_OPENXR_1_RUNTIMES)
    {
      if (openxr_1_runtime_path->len != 0)
        {
          g_autofree gchar *override_config =
           g_build_filename (self->overrides_in_container,
                             OPENXR_1_RUNTIME_OVERRIDES_PREFIX, NULL);

          /* There's no environment variable for this,
           * but we should still check that every runtime is in the
           * same directory we expect to have used */
          env_overlay_set_common_directory (container_env,
                                            NULL,
                                            openxr_1_runtime_path,
                                            override_config,
                                            _SRT_GRAPHICS_OPENXR_1_RUNTIME_SUFFIX);
          pv_runtime_prepend_to_xdg_dirs (self, container_env, override_config,
                                          _SRT_XDG_CONFIG_DIRS_VAR,
                                          _SRT_XDG_CONFIG_DIRS_DEFAULT);
        }

      /* Make sure the host's XR_RUNTIME_PATH doesn't leak into the container. */
      _srt_env_overlay_set (container_env, "XR_RUNTIME_PATH", NULL);
    }

  /* We binded the VDPAU drivers in "%{libdir}/vdpau".
   * Unfortunately VDPAU_DRIVER_PATH can hold just a single path, so we can't
   * easily list both x86_64 and i386 driver paths; instead, we delegate the
   * setup of VDPAU drivers to pv-adverb, which is running with our final
   * choice of glibc and therefore can do something more clever with
   * dynamic string tokens. */
  _srt_env_overlay_set (container_env, "VDPAU_DRIVER_PATH", NULL);

  return TRUE;
}

static gboolean
should_mask_search_path_entry (const char *dir)
{
  /* We are mounting our own runtime over /etc and /usr anyway, so ignore
   * those */
  if (flatpak_has_path_prefix (dir, "/usr")
      || flatpak_has_path_prefix (dir, "/etc"))
    return FALSE;

  /* Only mask if the directory actually exists */
  return g_file_test (dir, G_FILE_TEST_IS_DIR);
}

gboolean
pv_runtime_bind (PvRuntime *self,
                 FlatpakExports *exports,
                 FlatpakBwrap *bwrap,
                 SrtEnvOverlay *container_env,
                 GError **error)
{
  g_autoptr(GString) archs_string = NULL;
  const char *value;

  g_return_val_if_fail (PV_IS_RUNTIME (self), FALSE);
  g_return_val_if_fail ((exports == NULL) == (bwrap == NULL), FALSE);
  g_return_val_if_fail (bwrap == NULL || !pv_bwrap_was_finished (bwrap), FALSE);
  g_return_val_if_fail (bwrap != NULL || self->mutable_sysroot != NULL, FALSE);
  g_return_val_if_fail (container_env != NULL, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  if (self->flags & PV_RUNTIME_FLAGS_FLATPAK_SUBSANDBOX)
    {
      g_return_val_if_fail (exports == NULL, FALSE);
      g_return_val_if_fail (bwrap == NULL, FALSE);
    }
  else
    {
      g_return_val_if_fail (exports != NULL, FALSE);
      g_return_val_if_fail (bwrap != NULL, FALSE);
    }

  if (bwrap != NULL
      && !bind_runtime_base (self, exports, bwrap, container_env, error))
    return FALSE;

  if (bwrap != NULL || self->is_flatpak_env)
    {
      if (!bind_runtime_ld_so (self, bwrap, container_env, error))
        return FALSE;
    }

  if (self->providers != NULL)
    {
      if (!pv_runtime_use_provider_graphics_stack (self, bwrap,
                                                   container_env,
                                                   error))
        return FALSE;
    }

  if (self->emulator != NULL
      && !pv_runtime_bind_emulator (self, exports, bwrap, error))
    return FALSE;

  if (bwrap != NULL
      && !bind_runtime_finish (self, exports, bwrap, error))
    return FALSE;

  /* Make sure pressure-vessel itself is visible there. */
  if (self->mutable_sysroot != NULL)
    {
      g_autofree gchar *dest = NULL;
      glnx_autofd int parent_dirfd = -1;
      const char *symlink_target = PV_FROM_HOST_IN_MUTABLE_SYSROOT;

      self->pv_prefix_in_container = PV_FROM_HOST_IN_MUTABLE_SYSROOT;
      parent_dirfd = _srt_resolve_in_sysroot (self->mutable_sysroot->fd,
                                              PV_FROM_HOST_IN_MUTABLE_SYSROOT_PARENT,
                                              SRT_RESOLVE_FLAGS_MKDIR_P,
                                              NULL, error);

      if (parent_dirfd < 0)
        return FALSE;

      if (!glnx_shutil_rm_rf_at (parent_dirfd, "from-host", NULL, error))
        return FALSE;

      dest = glnx_fdrel_abspath (parent_dirfd, "from-host");

      if (!pv_cheap_tree_copy (self->pv_prefix, dest,
                               PV_COPY_FLAGS_CHMOD_MAY_FAIL, error))
        return FALSE;

      /* Because the symlink is in a directory that doesn't exist in the
       * $FEX_ROOTFS, its target needs to be resolvable without FEX's help. */
      if (self->flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT)
        symlink_target = PV_RUNTIME_PATH_INTERPRETER_ROOT PV_FROM_HOST_IN_MUTABLE_SYSROOT;

      /* If possible, make a symlink to it in the location we would have
       * used if we didn't have the mutable sysroot */
      if (bwrap != NULL)
        flatpak_bwrap_add_args (bwrap,
                                "--symlink",
                                symlink_target,
                                PV_FROM_HOST_WITHOUT_MUTABLE_SYSROOT,
                                NULL);

      /* FEX-Emu's transparent rewriting of paths gets quite confused
       * across a pivot_root(), making the execve() at the end of the
       * bwrap mainprocess fail. Help it out by using a filename that
       * genuinely exists in the container's physical root filesystem. */
      if (self->flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT)
        self->adverb_in_container = PV_RUNTIME_PATH_INTERPRETER_ROOT PV_ADVERB_IN_MUTABLE_SYSROOT;
      else
        self->adverb_in_container = PV_ADVERB_IN_MUTABLE_SYSROOT;
    }
  else
    {
      g_autofree gchar *pressure_vessel_prefix_in_host_namespace =
        pv_current_namespace_path_to_host_path (self->pv_prefix);

      g_assert (bwrap != NULL);

      /* When setting up an interpreter root, for simplicity we require
       * the easier mutable sysroot code-path... */
      g_return_val_if_fail (!(self->flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT),
                            FALSE);
      /* ... so it's OK to use --ro-bind directly here */
      flatpak_bwrap_add_args (bwrap,
                              "--ro-bind",
                              pressure_vessel_prefix_in_host_namespace,
                              PV_FROM_HOST_WITHOUT_MUTABLE_SYSROOT,
                              NULL);
      self->pv_prefix_in_container = PV_FROM_HOST_WITHOUT_MUTABLE_SYSROOT;
      self->adverb_in_container = PV_ADVERB_WITHOUT_MUTABLE_SYSROOT;
    }

  if ((self->flags & PV_RUNTIME_FLAGS_IMPORT_VULKAN_LAYERS)
      && exports != NULL)
    {
      /* We have added our imported Vulkan layers to the search path,
       * but we can't just remove ~/.local/share, etc. from the search
       * path without breaking unrelated users of the XDG basedirs spec,
       * such as .desktop files and icons. Mask any remaining Vulkan
       * layers by mounting empty directories over the top. */
      static const char * const layer_suffixes[] =
        {
          _SRT_GRAPHICS_EXPLICIT_VULKAN_LAYER_SUFFIX,
          _SRT_GRAPHICS_IMPLICIT_VULKAN_LAYER_SUFFIX,
        };

      for (size_t i = 0; i < G_N_ELEMENTS (layer_suffixes); i++)
        {
          g_auto(GStrv) search_path = NULL;
          const char *suffix = layer_suffixes[i];

          search_path = _srt_graphics_get_vulkan_search_paths (self->real_root,
                                                               _srt_const_strv (self->original_environ),
                                                               (const GQuark *) self->tuples->data,
                                                               self->tuples->len,
                                                               suffix);

          for (size_t j = 0; search_path != NULL && search_path[j] != NULL; j++)
            {
              const char *dir = search_path[j];

              if (should_mask_search_path_entry (dir))
                {
                  g_info ("Hiding \"%s\" from the container so that \"%s/share/%s\" will be used instead",
                          dir, self->overrides_in_container, suffix);
                  pv_exports_mask_or_log (exports, dir);
                }
            }
        }
    }

  if ((self->flags & PV_RUNTIME_FLAGS_IMPORT_OPENXR_1_RUNTIMES)
      && exports != NULL)
    {
      /* Just like with Vulkan layers, we need to mask out original the OpenXR
       * runtime search paths so that the manifests within don't get picked up
       * by the container. */
      g_auto(GStrv) search_path =
        _srt_graphics_get_openxr_1_runtime_search_paths (_srt_const_strv (self->original_environ));

      for (size_t i = 0; search_path != NULL && search_path[i] != NULL; i++)
        {
          const char *dir = search_path[i];

          if (should_mask_search_path_entry (dir))
            {
              g_info ("Hiding \"%s\" from the container so that \"%s/"
                        OPENXR_1_RUNTIME_OVERRIDES_PREFIX
                        "/" _SRT_GRAPHICS_OPENXR_1_RUNTIME_SUFFIX
                        "\" will be used instead",
                      dir, self->overrides_in_container);
              pv_exports_mask_or_log (exports, dir);
            }
        }
    }

  if ((self->flags & PV_RUNTIME_FLAGS_IMPORT_OPENXR_1_LAYERS)
      && exports != NULL)
    {
      /* As above, but for OpenXR layers */
      static const char * const layer_suffixes[] =
        {
          _SRT_GRAPHICS_OPENXR_1_EXPLICIT_LAYER_SUFFIX,
          _SRT_GRAPHICS_OPENXR_1_IMPLICIT_LAYER_SUFFIX,
        };

      for (size_t i = 0; i < G_N_ELEMENTS (layer_suffixes); i++)
        {
          g_auto(GStrv) search_path = NULL;
          const char *suffix = layer_suffixes[i];

          search_path = _srt_graphics_get_openxr_1_layer_search_paths (_srt_const_strv (self->original_environ),
                                                                       suffix);

          for (size_t j = 0; search_path != NULL && search_path[j] != NULL; j++)
            {
              const char *dir = search_path[j];

              if (should_mask_search_path_entry (dir))
                {
                  g_info ("Hiding \"%s\" from the container so that \"%s/share/%s\" will be used instead",
                          dir, self->overrides_in_container, suffix);
                  pv_exports_mask_or_log (exports, dir);
                }
            }
        }
    }

  if (self->is_scout)
    {
      const gchar *sdl_videodriver;

      /* Some games detect that they have been run outside the Steam Runtime
       * and try to re-run themselves via Steam. Trick them into thinking
       * they are in the LD_LIBRARY_PATH Steam Runtime.
       *
       * We do not do this for games developed against soldier, because
       * backwards compatibility is not a concern for game developers who
       * have specifically opted-in to using the newer runtime. */
      _srt_env_overlay_set (container_env, "STEAM_RUNTIME", "/");

      /* Scout is configured without Wayland support. For this reason, if
       * the Wayland driver was forced via SDL_VIDEODRIVER, we expect that
       * every game will fail to launch. When we detect this situation we
       * unset SDL_VIDEODRIVER, so that the default x11 gets chosen instead */
      sdl_videodriver = g_environ_getenv (self->original_environ, "SDL_VIDEODRIVER");
      if (g_strcmp0 (sdl_videodriver, "wayland") == 0)
        _srt_env_overlay_set (container_env, "SDL_VIDEODRIVER", NULL);
    }

  value = g_environ_getenv (self->original_environ, "STEAM_ZENITY");

  if (g_strcmp0 (value, "") == 0)
    {
      g_debug ("zenity UIs disabled by STEAM_ZENITY='' (gamescope/Steam Deck)");
      _srt_env_overlay_set (container_env, "STEAM_ZENITY", "");
    }
  else
    {
      g_autofree gchar *zenity = g_build_filename (self->runtime_usr, "bin", "zenity", NULL);

      if (g_file_test (zenity, G_FILE_TEST_IS_EXECUTABLE))
        {
          g_debug ("container runtime has zenity");
          _srt_env_overlay_set (container_env, "STEAM_ZENITY", "/usr/bin/zenity");
        }
      else
        {
          g_debug ("container runtime does not have zenity");
          _srt_env_overlay_set (container_env, "STEAM_ZENITY", NULL);
        }
    }

  pv_runtime_set_search_paths (self, container_env);

  archs_string = g_string_new ("");

  for (gsize i = 0; i < self->tuples->len; i++)
    {
      GQuark tuple_quark = g_array_index (self->tuples, GQuark, i);

      if (i > 0)
        g_string_append_c (archs_string, ':');

      g_string_append (archs_string, g_quark_to_string (tuple_quark));
    }

  _srt_env_overlay_set (container_env, "PRESSURE_VESSEL_ARCHITECTURES",
                        archs_string->str);

  /* This is the emulator used to run the adverb (if the adverb is a foreign
   * binary) and the actual game (if it's a foreign binary), which do not
   * go via a SrtSubprocessLauncher. */
  if (self->emulator_in_container != NULL)
    {
      _srt_env_overlay_update (container_env,
                               _srt_emulator_get_environment (self->emulator_in_container));

      /* All relevant environment variables have been folded into
       * get_environment(), leaving get_container_environment() empty,
       * so the above is sufficient. */
      g_return_val_if_fail (
        _srt_env_overlay_is_empty (
          _srt_emulator_get_container_environment (self->emulator_in_container)),
        FALSE);
    }

  return TRUE;
}

static gchar *
pv_runtime_get_ld_library_path (PvRuntime *self)
{
  g_autoptr(GString) ld_library_path = g_string_new ("");

  for (size_t i = 0; i < self->tuples->len; i++)
    {
      GQuark tuple_quark = g_array_index (self->tuples, GQuark, i);
      const char *tuple = g_quark_to_string (tuple_quark);
      g_autofree gchar *ld_path = NULL;
      g_autofree gchar *aliases = NULL;

      ld_path = g_build_filename (self->overrides_in_container, "lib",
                                  tuple, NULL);

      aliases = g_build_filename (self->overrides_in_container, "lib",
                                  tuple, "aliases", NULL);

      _srt_search_path_append (ld_library_path, ld_path);
      _srt_search_path_append (ld_library_path, aliases);
    }

  return g_string_free_and_steal (g_steal_pointer (&ld_library_path));
}

void
pv_runtime_set_search_paths (PvRuntime *self,
                             SrtEnvOverlay *container_env)
{
  g_autofree char *terminfo_path = NULL;
  g_autofree char *ld_library_path = pv_runtime_get_ld_library_path (self);

  /* If the runtime is Debian-based, make sure we search where ncurses-base
   * puts terminfo, even if we're using a non-Debian-based libtinfo.so.6. */
  terminfo_path = g_build_filename (self->source_files, "lib", "terminfo",
                                    NULL);

  if (g_file_test (terminfo_path, G_FILE_TEST_IS_DIR))
    _srt_env_overlay_set (container_env, "TERMINFO_DIRS", "/lib/terminfo");

  /* The PATH from outside the container doesn't really make sense inside the
   * container: in principle the layout could be totally different. */
  _srt_env_overlay_set (container_env, "PATH", "/usr/bin:/bin");

  /* We use the time zone info from the container, but a host glibc might
   * be looking for it in some other location */
  _srt_env_overlay_set (container_env, "TZDIR", "/usr/share/zoneinfo");

  /* We need to set LD_LIBRARY_PATH here so that we can run
   * pv-adverb, even if it is going to regenerate
   * the ld.so.cache for better robustness before launching the
   * actual game */
  _srt_env_overlay_set (container_env, "LD_LIBRARY_PATH", ld_library_path);
}

gboolean
pv_runtime_use_shared_sockets (PvRuntime *self,
                               FlatpakBwrap *bwrap,
                               SrtEnvOverlay *container_env,
                               GError **error)
{
  if (_srt_env_overlay_get (container_env, "PULSE_SERVER") != NULL
      || self->is_flatpak_env)
    {
      /* Make the PulseAudio driver the default.
       * We do this unconditionally when we are under Flatpak for parity
       * with the freedesktop.org Platform. */
      const gchar *alsa_config = "pcm.!default {\n    type pulse\n}\n"
                                 "ctl.!default {\n    type pulse\n}\n";

      if (bwrap != NULL)
        {
          if (!pv_runtime_bind_into_container (self, bwrap,
                                               "asound.conf", alsa_config, -1,
                                               "/etc/asound.conf",
                                               PV_RUNTIME_EMULATION_ROOTS_BOTH,
                                               error))
            return FALSE;
        }
      else if (self->mutable_sysroot != NULL)
        {
          /* In a Flatpak sub-sandbox, we can rely on the fact that
           * Flatpak will mount each item in our copy of the runtime's
           * usr/etc/ into /etc, including some that we would normally
           * skip. */
          if (!glnx_file_replace_contents_at (self->mutable_sysroot->fd,
                                              "usr/etc/asound.conf",
                                              (const guint8 *) alsa_config,
                                              strlen (alsa_config),
                                              GLNX_FILE_REPLACE_NODATASYNC,
                                              NULL, error))
            return FALSE;
        }
      else
        {
          g_warning ("Unable to configure libasound.so.2 to use PulseAudio");
        }
    }

  return TRUE;
}

static void
pv_runtime_initable_iface_init (GInitableIface *iface,
                                gpointer unused G_GNUC_UNUSED)
{
  iface->init = pv_runtime_initable_init;
}

const char *
pv_runtime_get_modified_usr (PvRuntime *self)
{
  g_return_val_if_fail (PV_IS_RUNTIME (self), NULL);
  g_return_val_if_fail (self->mutable_sysroot != NULL, NULL);
  return self->runtime_usr;
}

const char *
pv_runtime_get_modified_app (PvRuntime *self)
{
  g_return_val_if_fail (PV_IS_RUNTIME (self), NULL);
  g_return_val_if_fail (self->mutable_sysroot != NULL, NULL);

  if (g_file_test (self->runtime_app, G_FILE_TEST_IS_DIR))
    return self->runtime_app;
  else
    return NULL;
}

const char *
pv_runtime_get_overrides (PvRuntime *self)
{
  g_return_val_if_fail (PV_IS_RUNTIME (self), NULL);

  return self->overrides;
}

/*
 * Return %TRUE if the runtime provides @library, either directly or
 * via the graphics-stack provider.
 */
gboolean
pv_runtime_has_library (PvRuntime *self,
                        const char *library)
{
  glnx_autofd int source_files_fd = -1;

  g_return_val_if_fail (PV_IS_RUNTIME (self), FALSE);
  g_return_val_if_fail (library != NULL, FALSE);

  g_debug ("Checking whether runtime has library: %s", library);

  for (size_t i = 0; i < self->tuples->len; i++)
    {
      GQuark arch_quark = g_array_index (self->tuples, GQuark, i);
      const char *tuple = g_quark_to_string (arch_quark);
      g_autoptr(GPtrArray) dirs = NULL;
      const SrtKnownArchitecture *known;

      known = _srt_architecture_get_by_tuple (tuple);
      dirs = _srt_known_architecture_get_libdirs (tuple,
                                                  known,
                                                  SRT_LIBDIRS_FLAGS_NONE);

      for (size_t j = 0; j < dirs->len; j++)
        {
          const char *libdir = g_ptr_array_index (dirs, j);
          g_autofree gchar *path = g_build_filename (libdir, library, NULL);
          PvGraphicsProvider *provider;

          if (self->mutable_sysroot != NULL)
            {
              if (_srt_sysroot_test (self->mutable_sysroot, path,
                                     SRT_RESOLVE_FLAGS_NONE, NULL))
                {
                  g_debug ("-> yes, ${mutable_sysroot}/%s", path);
                  return TRUE;
                }
            }
          else
            {
              glnx_autofd int fd = -1;

              /* The runtime isn't necessarily a sysroot (it might just be a
               * merged /usr) but in practice it'll be close enough: we look
               * up each library in /usr/foo and /foo anyway. */
              if (source_files_fd < 0)
                {
                  if (!glnx_opendirat (AT_FDCWD, self->source_files, TRUE,
                                       &source_files_fd, NULL))
                    continue;
                }

              fd = _srt_resolve_in_sysroot (source_files_fd, path,
                                            SRT_RESOLVE_FLAGS_NONE,
                                            NULL, NULL);

              if (fd >= 0)
                {
                  g_debug ("-> yes, ${source_files}/%s", path);
                  return TRUE;
                }
            }

          provider = pv_runtime_get_graphics_provider (self, arch_quark);

          /* If the graphics stack provider is not the same as the current
           * namespace (in practice this rarely/never happens), we also
           * want to steer clear of libraries that only exist in the
           * graphics stack provider.
           *
           * If the graphics stack provider *is* the current namespace,
           * and the library doesn't exist in the container runtime, then
           * it's OK to use libraries from it in LD_PRELOAD, because there
           * is no other version that might have been meant. */
          if (provider != NULL
              && !(provider->flags & PV_GRAPHICS_PROVIDER_FLAGS_INTERPRETER_HOST)
              && !_srt_sysroot_is_direct (provider->in_current_ns))
            {
              if (_srt_sysroot_test (provider->in_current_ns, path,
                                     SRT_RESOLVE_FLAGS_NONE, NULL))
                {
                  g_debug ("-> yes, ${provider}/%s", path);
                  return TRUE;
                }
            }
        }
    }

  g_debug ("-> no");
  return FALSE;
}

/*
 * Log the files and directories that will be included in /overrides.
 */
void
pv_runtime_log_overrides (PvRuntime *self)
{
  g_auto(GStrv) listing = NULL;

  g_debug ("Overrides in %s:", self->overrides_in_container);
  listing = _srt_recursive_list_content (self->overrides, -1, ".", -1,
                                         _srt_peek_environ_nonnull (), NULL);

  for (size_t i = 0; listing[i] != NULL; i++)
    g_debug ("\t%s", listing[i]);

  g_debug ("End of overrides in %s", self->overrides_in_container);
}

/*
 * Log the files and directories that will be included in the container.
 */
void
pv_runtime_log_container (PvRuntime *self)
{
  g_auto(GStrv) listing = NULL;

  g_debug ("All files in container, excluding any extra bind mounts:");
  listing = _srt_recursive_list_content (self->runtime_files, -1, ".", -1,
                                         _srt_peek_environ_nonnull (), NULL);

  for (size_t i = 0; listing[i] != NULL; i++)
    g_debug ("\t%s", listing[i]);

  g_debug ("End of files in container");
}

SrtSysroot *
pv_runtime_get_mutable_sysroot (PvRuntime *self)
{
  return self->mutable_sysroot;
}

/*
 * Return the directory in which we can find helpers inside the container.
 * Can only be called after a successful call to pv_runtime_bind().
 *
 * Returns: (transfer none): An absolute path, never %NULL unless a
 *  programming error has occurred
 */
const char *
pv_runtime_get_helpers_dir_in_container (PvRuntime *self)
{
  /* This will be true if pv_runtime_bind() was successfully called. */
  g_return_val_if_fail (self->pv_prefix_in_container != NULL, NULL);

  if (self->helpers_dir_in_container == NULL)
    self->helpers_dir_in_container = g_build_filename (self->pv_prefix_in_container,
                                                       PKGLIBEXECDIR,
                                                       NULL);

  return self->helpers_dir_in_container;
}

/*
 * Return the emulator to be used for processes inside the container.
 * Can only be called after a successful call to pv_runtime_bind().
 *
 * Returns: (transfer none): An emulator, or %NULL if none is in use
 */
SrtEmulator *
pv_runtime_get_emulator_in_container (PvRuntime *self)
{
  /* This will be true if pv_runtime_bind() was successfully called. */
  g_return_val_if_fail ((self->emulator != NULL) == (self->emulator_in_container != NULL),
                        NULL);
  return self->emulator_in_container;
}
