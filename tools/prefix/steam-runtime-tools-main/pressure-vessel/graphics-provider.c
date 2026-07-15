/*
 * Copyright © 2020-2021 Collabora Ltd.
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

#include "graphics-provider.h"

#include "steam-runtime-tools/profiling-internal.h"
#include "steam-runtime-tools/resolve-in-sysroot-internal.h"
#include "steam-runtime-tools/system-info-internal.h"
#include "steam-runtime-tools/utils-internal.h"

#include "enumtypes.h"
#include "utils.h"

enum {
  PROP_0,
  PROP_DETAILS,
  PROP_FLAGS,
  PROP_PATH_IN_CONTAINER_NS,
  PROP_RUN_IN_CURRENT_CONTEXT,
  N_PROPERTIES
};

static SrtSystemInfo *pv_graphics_provider_create_system_info (PvGraphicsProvider *self,
                                                               GQuark single_arch);

typedef struct
{
  SrtSystemInfo *system_info;
  SrtGraphicsProvider *details;
  /* Owned by @details */
  const SrtGraphicsProviderArchitecture *arch_details;
  GCancellable *cancellable;
  GQuark arch_tuple;
  PvRuntimeFlags runtime_flags;
  PvGraphicsProviderFlags provider_flags;
} EnumerationThreadInputs;

/* Called in main thread */
static EnumerationThreadInputs *
enumeration_thread_inputs_new (GQuark arch_tuple,
                               PvRuntimeFlags runtime_flags,
                               PvGraphicsProvider *provider,
                               GCancellable *cancellable)
{
  EnumerationThreadInputs *self = g_new0 (EnumerationThreadInputs, 1);

  self->arch_tuple = arch_tuple;
  self->runtime_flags = runtime_flags;
  self->provider_flags = provider->flags;
  self->system_info = pv_graphics_provider_create_system_info (provider,
                                                               arch_tuple);
  self->details = g_object_ref (provider->details);
  self->cancellable = g_object_ref (cancellable);

  if (arch_tuple != 0)
    self->arch_details = _srt_graphics_provider_get_architecture (self->details,
                                                                  arch_tuple);
  else
    self->arch_details = NULL;

  return self;
}

/* Called in enumeration thread */
static void
enumeration_thread_inputs_free (EnumerationThreadInputs *self)
{
  g_object_unref (self->cancellable);
  g_clear_object (&self->details);
  g_clear_object (&self->system_info);
  g_free (self);
}

/* Called in enumeration thread */
static gpointer
enumerate_arch (gpointer data)
{
  EnumerationThreadInputs *inputs = data;
  const char *tuple = g_quark_to_string (inputs->arch_tuple);
  G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) timer =
    _srt_profiling_start ("Enumerating %s drivers in thread", tuple);
  g_autoptr(SrtSystemInfo) system_info = g_steal_pointer (&inputs->system_info);
  SrtGraphicsProviderFeatureFlags features;

  features = _srt_graphics_provider_architecture_get_features (inputs->arch_details);

  if (g_cancellable_is_cancelled (inputs->cancellable))
    goto out;

  /* At the moment the real host is included only when FEX emulator is in use.
   * Skipping VDPAU until there is a real use case for it, because
   * it only supports one search path entry, which is problematic for us. */
  if ((features & SRT_GRAPHICS_PROVIDER_FEATURE_FLAGS_VDPAU)
      && !(inputs->provider_flags & PV_GRAPHICS_PROVIDER_FLAGS_INTERPRETER_HOST))
    {
      G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) part_timer =
        _srt_profiling_start ("Enumerating %s VDPAU drivers in thread",
                              tuple);
      G_GNUC_UNUSED g_autoptr(SrtObjectList) drivers = NULL;

      /* We ignore the results. system_info will cache them for later
       * calls, so when we're doing the actual work, redoing this call
       * will just retrieve them */
      drivers = srt_system_info_list_vdpau_drivers (system_info,
                                                    tuple,
                                                    SRT_DRIVER_FLAGS_NONE);
    }

  if (g_cancellable_is_cancelled (inputs->cancellable))
    goto out;

  if (TRUE)
    {
      G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) part_timer =
        _srt_profiling_start ("Enumerating %s DRI drivers in thread",
                              tuple);
      G_GNUC_UNUSED g_autoptr(SrtObjectList) drivers = NULL;

      drivers = srt_system_info_list_dri_drivers (system_info,
                                                  tuple,
                                                  SRT_DRIVER_FLAGS_NONE);
    }

  if (g_cancellable_is_cancelled (inputs->cancellable))
    goto out;

  if (TRUE)
    {
      G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) part_timer =
        _srt_profiling_start ("Enumerating %s GBM drivers in thread",
                              tuple);
      G_GNUC_UNUSED g_autoptr(SrtObjectList) drivers = NULL;

      drivers = srt_system_info_list_gbm_backends (system_info,
                                                   tuple,
                                                   SRT_DRIVER_FLAGS_NONE);
    }

  if (g_cancellable_is_cancelled (inputs->cancellable))
    goto out;

  if (features & SRT_GRAPHICS_PROVIDER_FEATURE_FLAGS_VA_API)
    {
      G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) part_timer =
        _srt_profiling_start ("Enumerating %s VA-API drivers in thread",
                              tuple);
      G_GNUC_UNUSED g_autoptr(SrtObjectList) drivers = NULL;

      drivers = srt_system_info_list_va_api_drivers (system_info,
                                                     tuple,
                                                     SRT_DRIVER_FLAGS_NONE);
    }

  if (g_cancellable_is_cancelled (inputs->cancellable))
    goto out;

out:
  enumeration_thread_inputs_free (inputs);
  return g_steal_pointer (&system_info);
}

static void
cache_indep_graphics_stack (SrtSystemInfo *system_info,
                            PvRuntimeFlags flags,
                            GCancellable *cancellable)
{
  const char *label = _srt_system_info_get_sysroot_path (system_info);

  if (g_cancellable_is_cancelled (cancellable))
    return;

  if (TRUE)
    {
      G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) part_timer =
        _srt_profiling_start ("Enumerating %s EGL ICDs in thread", label);
      G_GNUC_UNUSED g_autoptr(SrtObjectList) drivers = NULL;

      drivers = srt_system_info_list_egl_icds (system_info, NULL);
    }

  if (g_cancellable_is_cancelled (cancellable))
    return;

  if (TRUE)
    {
      G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) part_timer =
        _srt_profiling_start ("Enumerating %s EGL external platforms in thread",
                              label);
      G_GNUC_UNUSED g_autoptr(SrtObjectList) drivers = NULL;

      drivers = srt_system_info_list_egl_external_platforms (system_info, NULL);
    }

  if (g_cancellable_is_cancelled (cancellable))
    return;

  if (TRUE)
    {
      G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) part_timer =
        _srt_profiling_start ("Enumerating %s Vulkan ICDs in thread", label);
      G_GNUC_UNUSED g_autoptr(SrtObjectList) drivers = NULL;

      drivers = srt_system_info_list_vulkan_icds (system_info, NULL);
    }

  if (g_cancellable_is_cancelled (cancellable))
    return;

  if (flags & PV_RUNTIME_FLAGS_IMPORT_VULKAN_LAYERS)
    {
      G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) part_timer =
        _srt_profiling_start ("Enumerating %s Vulkan layers in thread", label);
      G_GNUC_UNUSED g_autoptr(SrtObjectList) exp_layers = NULL;
      G_GNUC_UNUSED g_autoptr(SrtObjectList) imp_layers = NULL;

      exp_layers = srt_system_info_list_explicit_vulkan_layers (system_info);
      imp_layers = srt_system_info_list_implicit_vulkan_layers (system_info);
    }
}

/* Called in enumeration thread */
static gpointer
enumerate_indep (gpointer data)
{
  EnumerationThreadInputs *inputs = data;
  G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) timer =
    _srt_profiling_start ("Enumerating cross-architecture ICDs in thread");
  g_autoptr(SrtSystemInfo) system_info = g_steal_pointer (&inputs->system_info);

  cache_indep_graphics_stack (system_info,
                              inputs->runtime_flags,
                              inputs->cancellable);

  enumeration_thread_inputs_free (inputs);
  return g_steal_pointer (&system_info);
}

typedef struct
{
  GQuark arch_tuple;
  GCancellable *cancellable;
  GThread *thread;
  SrtSystemInfo *system_info;
} EnumerationThread;

/*
 * Must be called from same thread as enumeration_thread_start_arch()
 * or enumeration_thread_start_indep().
 *
 * Returns: (transfer none):
 */
static SrtSystemInfo *
enumeration_thread_join (EnumerationThread *self)
{
  if (self->thread != NULL)
    {
      g_assert (self->system_info == NULL);
      g_cancellable_cancel (self->cancellable);
      self->system_info = g_thread_join (g_steal_pointer (&self->thread));
    }

  return self->system_info;
}

static void
enumeration_thread_clear (gpointer p)
{
  EnumerationThread *self = p;

  enumeration_thread_join (self);
  g_clear_object (&self->system_info);
  g_clear_object (&self->cancellable);
}

/* Must be called in main thread */
static void
enumeration_thread_start_arch (EnumerationThread *self,
                               GQuark tuple,
                               PvRuntimeFlags flags,
                               PvGraphicsProvider *provider)
{
  g_return_if_fail (self->cancellable == NULL);
  g_return_if_fail (self->system_info == NULL);
  g_return_if_fail (self->thread == NULL);
  g_return_if_fail (tuple != SRT_ARCHITECTURE_QUARK_NONE);

  self->arch_tuple = tuple;
  self->cancellable = g_cancellable_new ();
  self->thread = g_thread_new (g_quark_to_string (tuple), enumerate_arch,
                               enumeration_thread_inputs_new (tuple,
                                                              flags,
                                                              provider,
                                                              self->cancellable));
}

/* Must be called in main thread */
static void
enumeration_thread_start_indep (EnumerationThread *self,
                                PvRuntimeFlags flags,
                                PvGraphicsProvider *provider,
                                const gchar *thread_name)
{
  g_return_if_fail (self->cancellable == NULL);
  g_return_if_fail (self->system_info == NULL);
  g_return_if_fail (self->thread == NULL);

  self->cancellable = g_cancellable_new ();
  self->thread = g_thread_new (thread_name == NULL ? "cross-architecture" : thread_name,
                               enumerate_indep,
                               enumeration_thread_inputs_new (SRT_ARCHITECTURE_QUARK_NONE,
                                                              flags,
                                                              provider,
                                                              self->cancellable));
}

typedef struct
{
  GArray *tuples;
  GThread *main_thread;
  SrtSystemInfo *system_info;
  EnumerationThread indep_thread;
  GArray *arch_threads;
} PvGraphicsProviderPrivate;

static GParamSpec *properties[N_PROPERTIES] = { NULL };

G_DEFINE_TYPE_WITH_CODE (PvGraphicsProvider,
                         pv_graphics_provider,
                         G_TYPE_OBJECT,
                         G_ADD_PRIVATE (PvGraphicsProvider))

static void
pv_graphics_provider_init (PvGraphicsProvider *self)
{
  PvGraphicsProviderPrivate *priv = pv_graphics_provider_get_instance_private (self);

  priv->tuples = _srt_architecture_array_new ();
  priv->main_thread = g_thread_self ();
}

static void
pv_graphics_provider_get_property (GObject *object,
                                   guint prop_id,
                                   GValue *value,
                                   GParamSpec *pspec)
{
  PvGraphicsProvider *self = PV_GRAPHICS_PROVIDER (object);

  switch (prop_id)
    {
      case PROP_DETAILS:
        g_value_set_object (value, self->details);
        break;

      case PROP_FLAGS:
        g_value_set_flags (value, self->flags);
        break;

      case PROP_PATH_IN_CONTAINER_NS:
        g_value_set_string (value, self->path_in_container_ns);
        break;

      case PROP_RUN_IN_CURRENT_CONTEXT:
        g_value_set_object (value, self->run_in_current_context);
        break;

      default:
        G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
    }
}

static void
pv_graphics_provider_set_property (GObject *object,
                                   guint prop_id,
                                   const GValue *value,
                                   GParamSpec *pspec)
{
  PvGraphicsProvider *self = PV_GRAPHICS_PROVIDER (object);

  switch (prop_id)
    {
      case PROP_DETAILS:
        /* Construct-only */
        g_return_if_fail (self->details == NULL);
        self->details = g_value_dup_object (value);
        break;

      case PROP_FLAGS:
        self->flags = g_value_get_flags (value);
        break;

      case PROP_PATH_IN_CONTAINER_NS:
        /* Construct-only */
        g_return_if_fail (self->path_in_container_ns == NULL);
        self->path_in_container_ns = g_value_dup_string (value);
        break;

      case PROP_RUN_IN_CURRENT_CONTEXT:
        /* Construct-only */
        g_return_if_fail (self->run_in_current_context == NULL);
        self->run_in_current_context = g_value_dup_object (value);
        break;

      default:
        G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
    }
}

static void
pv_graphics_provider_constructed (GObject *object)
{
  PvGraphicsProvider *self = PV_GRAPHICS_PROVIDER (object);

  G_OBJECT_CLASS (pv_graphics_provider_parent_class)->constructed (object);

  g_return_if_fail (SRT_IS_GRAPHICS_PROVIDER (self->details));
  self->in_current_ns = g_object_ref (_srt_graphics_provider_get_root (self->details));
  g_return_if_fail (SRT_IS_SYSROOT (self->in_current_ns));
  g_return_if_fail (self->in_current_ns->path != NULL);
  g_return_if_fail (self->in_current_ns->fd >= 0);
  g_return_if_fail (self->path_in_container_ns != NULL);
  g_return_if_fail (SRT_IS_SUBPROCESS_RUNNER (self->run_in_current_context));

  self->run_in_sysroot = _srt_subprocess_runner_new_swap_sysroot (self->run_in_current_context,
                                                                  self->in_current_ns);

  /* Path that, when resolved in the host namespace, points to us */
  self->path_in_host_ns = pv_current_namespace_path_to_host_path (self->in_current_ns->path);
}

static void
pv_graphics_provider_dispose (GObject *object)
{
  PvGraphicsProvider *self = PV_GRAPHICS_PROVIDER (object);
  PvGraphicsProviderPrivate *priv = pv_graphics_provider_get_instance_private (self);

  enumeration_thread_clear (&priv->indep_thread);
  g_clear_pointer (&priv->arch_threads, g_array_unref);
  g_clear_object (&priv->system_info);

  g_clear_object (&self->details);
  g_clear_object (&self->in_current_ns);
  g_clear_object (&self->run_in_current_context);
  g_clear_object (&self->run_in_sysroot);

  G_OBJECT_CLASS (pv_graphics_provider_parent_class)->dispose (object);
}

static void
pv_graphics_provider_finalize (GObject *object)
{
  PvGraphicsProvider *self = PV_GRAPHICS_PROVIDER (object);
  PvGraphicsProviderPrivate *priv = pv_graphics_provider_get_instance_private (self);

  g_clear_pointer (&priv->tuples, g_array_unref);

  g_free (self->path_in_host_ns);
  g_free (self->path_in_container_ns);

  G_OBJECT_CLASS (pv_graphics_provider_parent_class)->finalize (object);
}

static void
pv_graphics_provider_class_init (PvGraphicsProviderClass *cls)
{
  GObjectClass *object_class = G_OBJECT_CLASS (cls);

  object_class->get_property = pv_graphics_provider_get_property;
  object_class->set_property = pv_graphics_provider_set_property;
  object_class->constructed = pv_graphics_provider_constructed;
  object_class->dispose = pv_graphics_provider_dispose;
  object_class->finalize = pv_graphics_provider_finalize;

  properties[PROP_DETAILS] =
    g_param_spec_object ("details", NULL, NULL,
                         SRT_TYPE_GRAPHICS_PROVIDER,
                         (G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                          G_PARAM_STATIC_STRINGS));

  properties[PROP_FLAGS] =
    g_param_spec_flags ("flags", "Flags",
                        "Flags describing this graphics provider",
                        PV_TYPE_GRAPHICS_PROVIDER_FLAGS,
                        PV_GRAPHICS_PROVIDER_FLAGS_NONE,
                        G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                        G_PARAM_STATIC_STRINGS);

  properties[PROP_PATH_IN_CONTAINER_NS] =
    g_param_spec_string ("path-in-container-ns", "Path in container namespace",
                         ("Path to the graphics provider in the container "
                          "namespace, typically /run/host"),
                         NULL,
                         (G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                          G_PARAM_STATIC_STRINGS));

  properties[PROP_RUN_IN_CURRENT_CONTEXT] =
    g_param_spec_object ("run-in-current-context", NULL, NULL,
                         SRT_TYPE_SUBPROCESS_RUNNER,
                         (G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                          G_PARAM_STATIC_STRINGS));

  g_object_class_install_properties (object_class, N_PROPERTIES, properties);
}

/*
 * search_paths (nullable): List of colon separated paths where the program
 *  should be searched into, in addition to the hardcoded common directories.
 */
gchar *
pv_graphics_provider_search_in_path_and_bin (PvGraphicsProvider *self,
                                             const gchar *search_paths,
                                             const gchar *program_name)
{
  g_autofree gchar *cwd = g_get_current_dir ();
  g_autoptr(GPtrArray) paths_array = NULL;
  g_auto(GStrv) paths = NULL;
  gsize i;

  g_return_val_if_fail (PV_IS_GRAPHICS_PROVIDER (self), NULL);
  g_return_val_if_fail (program_name != NULL, NULL);
  g_return_val_if_fail (strchr (program_name, G_DIR_SEPARATOR) == NULL, NULL);

  /* Start with a large enough array to avoid frequent reallocations */
  paths_array = g_ptr_array_sized_new (16);

  if (search_paths != NULL)
    {
      paths = g_strsplit (search_paths, ":", -1);
      for (i = 0; paths[i] != NULL; i++)
        g_ptr_array_add (paths_array, (gpointer) paths[i]);
    }

  /* Hardcoded common binary paths */
  g_ptr_array_add (paths_array, (gpointer) "/usr/bin");
  g_ptr_array_add (paths_array, (gpointer) "/bin");
  g_ptr_array_add (paths_array, (gpointer) "/usr/sbin");
  g_ptr_array_add (paths_array, (gpointer) "/sbin");

  for (i = 0; i < paths_array->len; i++)
    {
      g_autofree gchar *test_path = NULL;
      const gchar *path = g_ptr_array_index(paths_array, i);
      if (strstr (path, "/.linuxbrew/") != NULL)
        {
          g_debug ("Skipping over Homebrew's \"%s\" from PATH", path);
          continue;
        }

      if (!g_path_is_absolute (path))
        test_path = g_build_filename (cwd, path, program_name, NULL);
      else
        test_path = g_build_filename (path, program_name, NULL);

      if (_srt_sysroot_test (self->in_current_ns, test_path,
                             SRT_RESOLVE_FLAGS_MUST_BE_EXECUTABLE, NULL))
        return g_steal_pointer (&test_path);
    }

  return NULL;
}

static PvGraphicsProvider *
pv_graphics_provider_new (SrtSubprocessRunner *run_in_current_context,
                          SrtGraphicsProvider *details,
                          const char *path_in_container_ns,
                          PvGraphicsProviderFlags flags,
                          GError **error)
{
  g_autoptr(SrtSysroot) sysroot = NULL;

  g_return_val_if_fail (SRT_IS_GRAPHICS_PROVIDER (details), NULL);
  g_return_val_if_fail (path_in_container_ns != NULL, NULL);
  g_return_val_if_fail (SRT_IS_SUBPROCESS_RUNNER (run_in_current_context), NULL);
  g_return_val_if_fail (error == NULL || *error == NULL, NULL);

  return g_object_new (PV_TYPE_GRAPHICS_PROVIDER,
                       "details", details,
                       "path-in-container-ns", path_in_container_ns,
                       "run-in-current-context", run_in_current_context,
                       "flags", flags,
                       NULL);
}

/*
 * pv_graphics_provider_create_system_info:
 * @self: The graphics provider
 * @single_arch: A single architecture to support, or zero
 * Create a new SrtSystemInfo, suitable for use in a separate thread.
 *
 * If @single_arch is nonzero, the returned #SrtSystemInfo will be
 * specific to that single architecture, suitable for enumerating
 * DRI drivers, VA-API drivers and similar modules whose search path
 * is architecture-dependent.
 *
 * If @single_arch is zero, the returned #SrtSystemInfo will inherit
 * its architecture(s) from @self, suitable for enumerating EGL drivers,
 * Vulkan layers and similar things that have a single search path shared
 * by all architectures.
 *
 * Returns: (transfer full): A new #SrtSystemInfo object
 */
SrtSystemInfo *
pv_graphics_provider_create_system_info (PvGraphicsProvider *self,
                                         GQuark single_arch)
{
  g_autoptr(SrtSubprocessRunner) runner = NULL;
  g_autoptr(SrtSystemInfo) system_info = NULL;
  SrtCheckFlags flags = SRT_CHECK_FLAGS_SKIP_SLOW_CHECKS
                        | SRT_CHECK_FLAGS_SKIP_EXTRAS;

  g_return_val_if_fail (PV_IS_GRAPHICS_PROVIDER (self), NULL);

  /* If we're an x86_64 copy of pressure-vessel running under
   * FEX emulation, we can't expect to have aarch64-linux-gnu-inspect-library,
   * etc. available, so we can't use them to inspect graphics drivers. */
  if (self->flags & PV_GRAPHICS_PROVIDER_FLAGS_INTERPRETER_HOST)
    flags |= SRT_CHECK_FLAGS_NO_HELPERS;

  system_info = srt_system_info_new (NULL);
  _srt_system_info_set_subprocess_runner (system_info, self->run_in_sysroot);
  _srt_system_info_set_graphics_provider (system_info, self->details);

  if (single_arch != SRT_ARCHITECTURE_QUARK_NONE)
    {
      _srt_system_info_set_multiarch_quarks (system_info, &single_arch, 1);
    }
  else
    {
      gsize n = 0;
      const GQuark *archs = pv_graphics_provider_get_architectures (self, &n);

      if (n > 0)
        _srt_system_info_set_multiarch_quarks (system_info, archs, n);
      /* else (unlikely) fall back to using the native architecture of
       * libsteam-runtime-tools */
    }

  _srt_system_info_set_check_flags (system_info, flags);
  return g_steal_pointer (&system_info);
}

/*
 * Returns: %TRUE if @tuple is in pv_graphics_provider_get_architectures()
 */
gboolean
pv_graphics_provider_has_architecture (PvGraphicsProvider *self,
                                       GQuark tuple)
{
  PvGraphicsProviderPrivate *priv = pv_graphics_provider_get_instance_private (self);

  return _srt_architecture_array_has (priv->tuples, tuple);
}

/*
 * pv_graphics_provider_get_architectures:
 * @self: The graphics stack provider
 * @n: (out) (optional): Number of nonzero items in the result
 *
 * Returns: (transfer none) (array zero-terminated=1): An array of `*n` quarks
 *  representing multiarch tuples, followed by %SRT_ARCHITECTURE_QUARK_NONE
 */
const GQuark *
pv_graphics_provider_get_architectures (PvGraphicsProvider *self,
                                       gsize *n)
{
  PvGraphicsProviderPrivate *priv = pv_graphics_provider_get_instance_private (self);

  return _srt_architecture_array_peek_data (priv->tuples, n);
}

/*
 * pv_graphics_provider_add_architecture:
 * @self: The graphics stack provider
 * @tuple: Quark representing a multiarch tuple
 *
 * Add @tuple to the list of architectures, if not already present.
 */
void
pv_graphics_provider_add_architecture (PvGraphicsProvider *self,
                                       GQuark tuple)
{
  PvGraphicsProviderPrivate *priv = pv_graphics_provider_get_instance_private (self);

  g_return_if_fail (PV_IS_GRAPHICS_PROVIDER (self));
  g_return_if_fail (tuple != SRT_ARCHITECTURE_QUARK_NONE);
  _srt_architecture_array_add (priv->tuples, tuple);
}

/*
 * pv_graphics_provider_start_enumeration:
 * @self: The graphics provider
 * @flags: Flags affecting the information that will be collected
 * @label: (nullable): An arbitrary string
 *
 * Start gathering system information in several background threads.
 * This can be used to speed up container runtime setup, especially
 * if it is I/O-bound.
 *
 * To collect the results, call pv_graphics_provider_dup_system_info().
 *
 * This function must be called in the main thread.
 * Calling this function more than once is not useful.
 */
static void
pv_graphics_provider_start_enumeration (PvGraphicsProvider *self,
                                        PvRuntimeFlags flags,
                                        const char *label)
{
  PvGraphicsProviderPrivate *priv = pv_graphics_provider_get_instance_private (self);
  gsize n_architectures;

  g_return_if_fail (g_thread_self () == priv->main_thread);

  /* If asked to run single-threaded (for more deterministic output),
   * defer enumeration until pv_graphics_provider_dup_system_info(). */
  if (flags & PV_RUNTIME_FLAGS_SINGLE_THREAD)
    return;

  /* If we already called pv_graphics_provider_dup_system_info(),
   * it's too late to pre-fill the cache */
  if (priv->system_info != NULL)
    return;

  /* If we already called pv_graphics_provider_start_enumeration(),
   * it's too late to change our minds about what we will pre-cache;
   * just keep going with the previous attempt */
  if (priv->arch_threads != NULL
      || priv->indep_thread.thread != NULL
      || priv->indep_thread.system_info != NULL)
    return;

  enumeration_thread_start_indep (&priv->indep_thread,
                                  flags,
                                  self,
                                  label);

  n_architectures = priv->tuples->len;

  if (n_architectures > 0)
    {
      priv->arch_threads = g_array_sized_new (FALSE, TRUE,
                                              sizeof (EnumerationThread),
                                              n_architectures);
      g_array_set_clear_func (priv->arch_threads, enumeration_thread_clear);
      g_array_set_size (priv->arch_threads, n_architectures);

      for (gsize i = 0; i < n_architectures; i++)
        {
          GQuark tuple = g_array_index (priv->tuples, GQuark, i);
          EnumerationThread *arch_thread;

          arch_thread = &g_array_index (priv->arch_threads,
                                        EnumerationThread, i);
          enumeration_thread_start_arch (arch_thread, tuple, flags, self);
        }
    }
}

/*
 * pv_graphics_provider_get_system_info:
 * @self: The graphics provider
 * @single_arch: A single architecture to support, or zero
 *
 * Return a system information object describing @self.
 *
 * If pv_graphics_provider_start_enumeration() was previously called,
 * the returned object may contain pre-cached information about @tuple,
 * or pre-cached non-architecture-specific information.
 * This improves performance but should not alter the results.
 *
 * The returned object is owned by @self and must not be freed.
 *
 * This function must be called in the main thread.
 *
 * Returns: (transfer none): Information about @self
 */
SrtSystemInfo *
pv_graphics_provider_get_system_info (PvGraphicsProvider *self,
                                      GQuark arch_specific)
{
  PvGraphicsProviderPrivate *priv = pv_graphics_provider_get_instance_private (self);
  gsize i;

  g_return_val_if_fail (g_thread_self () == priv->main_thread, NULL);

  if (priv->system_info == NULL)
    {
      /* If we already started enumerating Vulkan drivers, etc.,
       * finish doing that now, so that subsequent requests will just
       * read from the cache. Otherwise create a new, blank
       * SrtSystemInfo. */
      if (priv->indep_thread.thread != NULL
          || priv->indep_thread.system_info != NULL)
        priv->system_info = g_object_ref (enumeration_thread_join (&priv->indep_thread));
      else
        priv->system_info = pv_graphics_provider_create_system_info (self, SRT_ARCHITECTURE_QUARK_NONE);
    }

  g_return_val_if_fail (SRT_IS_SYSTEM_INFO (priv->system_info), NULL);

  if (arch_specific != SRT_ARCHITECTURE_QUARK_NONE && priv->arch_threads != NULL)
    {
      /* If we already started enumerating Mesa DRI drivers, etc. for the
       * requested architecture, finish doing that now,
       * and return the system info object that has that
       * information cached. */
      for (i = 0; i < priv->arch_threads->len; i++)
        {
          EnumerationThread *arch_thread;

          arch_thread = &g_array_index (priv->arch_threads,
                                        EnumerationThread, i);

          if (arch_thread->arch_tuple == arch_specific)
            return enumeration_thread_join (arch_thread);
        }

      /* Otherwise fall back to the "main" SrtSystemInfo. */
    }

  return priv->system_info;
}

static gchar *
pv_graphics_provider_choose_mount_point (SrtGraphicsProvider *details,
                                         const char *specific_tuple,
                                         PvRuntimeFlags flags,
                                         GError **error)
{
  if (flags & PV_RUNTIME_FLAGS_FLATPAK_SUBSANDBOX)
    {
      if (g_strcmp0 (_srt_graphics_provider_get_root_path (details), "/") == 0)
        return g_strdup ("/run/parent");

      if (g_strcmp0 (_srt_graphics_provider_get_root_path (details), "/run/host") == 0)
        {
          g_warning ("Using host graphics drivers in a Flatpak subsandbox "
                     "probably won't work");
          return g_strdup ("/run/host");
        }

      return glnx_null_throw (error,
                              "Flatpak subsandboxing can only use / or "
                              "/run/host to provide graphics drivers");
    }

  if (flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT)
    {
      /* When using an interpreter root, avoid /run/gfx and instead use a
       * directory in /var. As much as possible we want each top-level
       * directory to be either in the rootfs or in the real host system,
       * not some mixture of the two, and the majority of /run needs to
       * come from the real host system, for sockets and so on; but when
       * the rootfs contains a symlink, FEX-Emu interprets it as though
       * chrooted into the rootfs, so we have to mount the graphics
       * provider inside the rootfs instead of in the real root. */
      if (specific_tuple != NULL)
        return g_strdup_printf ("/var/pressure-vessel/gfx/%s", specific_tuple);

      return g_strdup ("/var/pressure-vessel/gfx/main");
    }

  if (g_strcmp0 (_srt_graphics_provider_get_root_path (details), "/") == 0)
    return g_strdup ("/run/host");

  if (specific_tuple != NULL)
    return g_strdup_printf ("/run/gfx/%s", specific_tuple);

  return g_strdup ("/run/gfx/main");
}

GPtrArray *
pv_graphics_provider_build_array (SrtSubprocessRunner *run_in_current_context,
                                  const char *provider_path,
                                  GHashTable *quark_to_provider,
                                  const GQuark *tuples,
                                  gsize n_tuples,
                                  const SrtKnownArchitecture *host_machine,
                                  PvRuntimeFlags flags,
                                  GError **error)
{
  g_autoptr(GPtrArray) ret = g_ptr_array_new_with_free_func (g_object_unref);
  g_autoptr(SrtGraphicsProvider) provider_details = NULL;
  g_autoptr(PvGraphicsProvider) graphics_provider = NULL;
  g_autoptr(PvGraphicsProvider) root_provider = NULL;
  g_autofree gchar *mount_point = NULL;
  GQuark need_fallback[n_tuples];
  size_t n_fallback = 0;
  gsize i;

  g_return_val_if_fail (tuples != NULL, NULL);
  g_return_val_if_fail (n_tuples > 0, NULL);

  provider_details = _srt_graphics_provider_new_for_path (provider_path,
                                                          tuples, n_tuples,
                                                          error);

  if (provider_details == NULL)
    return NULL;

  mount_point = pv_graphics_provider_choose_mount_point (provider_details,
                                                         NULL,
                                                         flags,
                                                         error);

  if (mount_point == NULL)
    return NULL;

  g_return_val_if_fail (SRT_IS_GRAPHICS_PROVIDER (provider_details), NULL);
  graphics_provider = pv_graphics_provider_new (run_in_current_context,
                                                provider_details,
                                                mount_point,
                                                PV_GRAPHICS_PROVIDER_FLAGS_NONE,
                                                error);

  if (graphics_provider == NULL)
    return NULL;

  /* If the configured default graphics provider was specified as a
   * JSON manifest, it might declare that it doesn't support all of the
   * architectures we need. If so, fall back to using the root directory. */
  for (i = 0; i < n_tuples; i++)
    {
      GQuark q = tuples[i];

      if (_srt_graphics_provider_get_architecture (provider_details, q) == NULL)
        {
          need_fallback[n_fallback] = q;
          n_fallback++;
        }
    }

  if (n_fallback != 0)
    {
      g_autoptr(SrtGraphicsProvider) root_details = NULL;
      g_autoptr(SrtSysroot) root = _srt_sysroot_new_direct (error);
      g_autofree gchar *root_mount = NULL;

      if (root == NULL)
        return FALSE;

      root_details = _srt_graphics_provider_new_for_directory (root,
                                                               need_fallback,
                                                               n_fallback);
      root_mount = pv_graphics_provider_choose_mount_point (root_details,
                                                            NULL,
                                                            flags,
                                                            error);

      if (root_mount == NULL)
        return NULL;

      root_provider = pv_graphics_provider_new (run_in_current_context,
                                                root_details,
                                                root_mount,
                                                PV_GRAPHICS_PROVIDER_FLAGS_NONE,
                                                error);

      if (root_provider == NULL)
        return NULL;
    }

  for (i = 0; i < n_tuples; i++)
    {
      g_autoptr(PvGraphicsProvider) arch_provider = NULL;
      GQuark q = tuples[i];
      const char *tuple = g_quark_to_string (q);
      const char *arch_path = NULL;

      if (quark_to_provider != NULL)
        arch_path = g_hash_table_lookup (quark_to_provider,
                                         GUINT_TO_POINTER (q));

      if (arch_path == NULL)
        {
          if (_srt_graphics_provider_get_architecture (provider_details, q) != NULL)
            arch_provider = g_object_ref (graphics_provider);
          else if (root_provider != NULL)
            arch_provider = g_object_ref (root_provider);
          else
            /* We should have a root provider whenever provider_details
             * doesn't cover every architecture */
            g_return_val_if_reached (FALSE);

        }
      else if (g_str_equal (arch_path, provider_path))
        {
          /* If explicitly asked to use a specific provider for a
           * specific architecture, try to do so, even if it might not
           * actually support that architecture */
          arch_provider = g_object_ref (graphics_provider);
        }
      else if (g_str_equal (arch_path, "/")
               && root_provider != NULL)
        {
          arch_provider = g_object_ref (root_provider);
        }
      else
        {
          g_autoptr(SrtGraphicsProvider) arch_details = NULL;
          g_autofree gchar *arch_mount = NULL;

          arch_details = _srt_graphics_provider_new_for_path (arch_path,
                                                              tuples, n_tuples,
                                                              error);

          if (arch_details == NULL)
            return NULL;

          arch_mount = pv_graphics_provider_choose_mount_point (arch_details,
                                                                tuple,
                                                                flags,
                                                                error);

          if (arch_mount == NULL)
            return NULL;

          arch_provider = pv_graphics_provider_new (run_in_current_context,
                                                    arch_details,
                                                    arch_mount,
                                                    PV_GRAPHICS_PROVIDER_FLAGS_NONE,
                                                    error);

          if (arch_provider == NULL)
            return NULL;
        }

      if (_srt_graphics_provider_get_architecture (arch_provider->details, q) == NULL)
        return glnx_null_throw (error,
                                "Graphics provider \"%s\" does not support %s architecture",
                                _srt_graphics_provider_describe (arch_provider->details),
                                tuple);

      g_debug ("Architecture %s graphics stack provided by %s -> %s",
               tuple,
               _srt_graphics_provider_describe (arch_provider->details),
               arch_provider->path_in_container_ns);

      pv_graphics_provider_add_architecture (arch_provider, q);

      if (!g_ptr_array_find (ret, arch_provider, NULL))
        g_ptr_array_add (ret, g_object_ref (arch_provider));

      if (host_machine != NULL
          && g_str_equal (tuple, host_machine->multiarch_tuple))
        {
          g_debug ("Will not enumerate drivers for interpreter host %s "
                   "because it duplicates supported architecture %s",
                   host_machine->multiarch_tuple, tuple);
          host_machine = NULL;
        }
    }

  /* Enumerating the graphics providers' drivers only requires things
   * we already know, so start these first, and let them run in parallel
   * with other setup. The results go in the SrtSystemInfo's cache
   * for future use. */
  for (i = 0; i < ret->len; i++)
    {
      PvGraphicsProvider *provider = g_ptr_array_index (ret, i);

      pv_graphics_provider_start_enumeration (provider, flags, NULL);
    }

  if (flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT)
    {
      /* Also include the real host graphics stack to allow thunking.
       * To avoid enumerating the same DRIs/layers twice, we only do
       * this if the host is not a supported architecture. */
      if (host_machine != NULL)
        {
          g_autoptr(SrtGraphicsProvider) host_details = NULL;
          g_autoptr(SrtSysroot) root = _srt_sysroot_new_real_root (error);
          GQuark q;

          if (root == NULL)
            return NULL;

          q = g_quark_from_static_string (host_machine->multiarch_tuple);
          host_details = _srt_graphics_provider_new_for_directory (root, &q, 1);
          g_debug ("Interpreter host %s graphics stack provided by %s",
                   host_machine->multiarch_tuple,
                   _srt_graphics_provider_describe (host_details));

          /* The trailing slash is needed to allow open(2) to work even if
           * it's using the O_NOFOLLOW flag. */
          graphics_provider = pv_graphics_provider_new (run_in_current_context,
                                                        host_details,
                                                        "/proc/self/root/",
                                                        PV_GRAPHICS_PROVIDER_FLAGS_INTERPRETER_HOST,
                                                        error);

          if (graphics_provider == NULL)
            return NULL;

          pv_graphics_provider_add_architecture (graphics_provider, q);
          /* As with the graphics providers for the runtime's architectures,
           * we can start enumeration immediately and let it run in
           * parallel. */
          pv_graphics_provider_start_enumeration (graphics_provider,
                                                  flags,
                                                  "real-host");
          g_ptr_array_add (ret, g_steal_pointer (&graphics_provider));
        }
    }

  return g_steal_pointer (&ret);
}
