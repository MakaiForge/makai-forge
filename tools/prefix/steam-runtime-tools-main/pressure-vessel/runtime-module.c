/*
 * Copyright © 2020-2025 Collabora Ltd.
 *
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

#include "runtime-module.h"

#include <steam-runtime-tools/steam-runtime-tools.h>

#include "steam-runtime-tools/graphics-drivers-internal.h"
#include "steam-runtime-tools/graphics-drivers-json-based-internal.h"
#include "steam-runtime-tools/log-internal.h"
#include "steam-runtime-tools/profiling-internal.h"

const char *
icd_kind_to_string (IcdKind kind)
{
  switch (kind)
    {
      case ICD_KIND_UNDECIDED:
        return "unknown";

      case ICD_KIND_NONEXISTENT:
        return "does not exist";

      case ICD_KIND_IGNORED:
        return "ignored/not applicable";

      case ICD_KIND_ABSOLUTE:
        return "absolute path";

      case ICD_KIND_SONAME:
        return "SONAME";

      case ICD_KIND_META_LAYER:
        return "Vulkan meta-layer";

      default:
        g_return_val_if_reached ("(internal error!)");
    }
}

static inline void
pv_module_per_arch_move_to_array (GArray *array,
                                  PvModulePerArch *arch)
{
  const PvModulePerArch blank = PV_MODULE_PER_ARCH_INIT;

  g_array_append_vals (array, arch, 1);
  /* Ownership of the fields of *arch was taken by the array */
  *arch = blank;
}

static inline gboolean
pv_module_per_arch_check (const PvModulePerArch *self,
                          const IcdDetails *details,
                          gboolean is_json_based)
{
  /* DRI, GBM, VA-API, VDPAU drivers are always ABSOLUTE or an error state,
   * never SONAME. */
  g_return_val_if_fail (is_json_based || self->kind != ICD_KIND_SONAME,
                        FALSE);

  switch (self->kind)
    {
      case ICD_KIND_ABSOLUTE:
        /* Has a library, which should have been resolved to a
         * concrete filename when the architecture details were
         * populated. Might or might not have a path in the container,
         * since this is filled later. */
        g_return_val_if_fail (details->has_library, FALSE);
        g_return_val_if_fail (self->resolved_library != NULL, FALSE);
        g_return_val_if_fail (g_path_is_absolute (self->resolved_library),
                              FALSE);
        break;

      case ICD_KIND_SONAME:
        /* Similar to ABSOLUTE except that it it's just a basename */
        g_return_val_if_fail (details->has_library, FALSE);
        g_return_val_if_fail (self->resolved_library != NULL, FALSE);
        g_return_val_if_fail (strchr (self->resolved_library, '/') == NULL,
                              FALSE);
        break;

      case ICD_KIND_META_LAYER:
        /* Meta-layers don't have a library. */
        g_return_val_if_fail (!details->has_library, FALSE);
        g_return_val_if_fail (self->resolved_library == NULL, FALSE);
        break;

      case ICD_KIND_IGNORED:
      case ICD_KIND_NONEXISTENT:
        /* We might already have filled in the resolved_library
         * before we decided that actually this module is irrelevant,
         * so make no assertion here. */
        break;

      case ICD_KIND_UNDECIDED:
      default:
        g_return_val_if_reached (FALSE);
    }

  return TRUE;
}

static inline PvModulePerArch *
icd_details_get_nth_architecture (IcdDetails *self,
                                  gsize i)
{
  return &g_array_index (self->archs, PvModulePerArch, i);
}

static inline PvModulePerArch *
icd_details_lookup_architecture (IcdDetails *self,
                                 GQuark tuple)
{
  gsize i;

  for (i = 0; i < self->archs->len; i++)
    {
      PvModulePerArch *arch = icd_details_get_nth_architecture (self, i);

      if (arch->tuple == tuple)
        return arch;
    }

  return NULL;
}

/*
 * icd_details_check:
 * @self: Details of a module
 *
 * Check that @self is internally consistent.
 */
static gboolean
icd_details_check (IcdDetails *self)
{
  SrtBaseGraphicsModule *base;
  gboolean is_json_based;
  size_t i;

  g_return_val_if_fail (self != NULL, FALSE);
  g_return_val_if_fail (PV_IS_GRAPHICS_PROVIDER (self->provider), FALSE);
  g_return_val_if_fail (SRT_IS_BASE_GRAPHICS_MODULE (self->icd), FALSE);
  base = SRT_BASE_GRAPHICS_MODULE (self->icd);
  g_return_val_if_fail (base->error == NULL, FALSE);

  if (self->has_library)
    {
      g_return_val_if_fail (base->library_path != NULL, FALSE);
    }
  else
    {
      g_return_val_if_fail (base->library_path == NULL, FALSE);
      g_return_val_if_fail (SRT_IS_VULKAN_LAYER (self->icd), FALSE);
    }

  is_json_based = SRT_IS_BASE_JSON_GRAPHICS_MODULE (base);

  for (i = 0; i < self->archs->len; i++)
    {
      PvModulePerArch *arch = icd_details_get_nth_architecture (self, i);

      g_return_val_if_fail (arch->tuple != SRT_ARCHITECTURE_QUARK_NONE, FALSE);
      g_return_val_if_fail (pv_module_per_arch_check (arch,
                                                      self,
                                                      is_json_based),
                            FALSE);
    }

  return TRUE;
}

static IcdDetails *
icd_details_new (PvGraphicsProvider *provider,
                 gpointer icd)
{
  SrtBaseGraphicsModule *base;
  IcdDetails *self;
  const char *name;

  g_return_val_if_fail (SRT_IS_BASE_GRAPHICS_MODULE (icd), NULL);
  base = SRT_BASE_GRAPHICS_MODULE (icd);
  g_return_val_if_fail (base->error == NULL, NULL);

  if (SRT_IS_BASE_JSON_GRAPHICS_MODULE (icd))
    {
      SrtBaseJsonGraphicsModule *j = SRT_BASE_JSON_GRAPHICS_MODULE (icd);

      g_return_val_if_fail (j->json_path != NULL, NULL);
      name = j->json_path;

      /* If it's a Vulkan layer, then either it has a library_path
       * or it is a meta-layer (has component layers).
       * Otherwise it must have a library path. */
      if (SRT_IS_VULKAN_LAYER (icd))
        g_return_val_if_fail (j->component_layers != NULL
                              || base->library_path != NULL,
                              NULL);
      else
        g_return_val_if_fail (base->library_path != NULL, NULL);
    }
  else if (SRT_IS_DRI_DRIVER (icd)
           || SRT_IS_GBM_BACKEND (icd)
           || SRT_IS_VA_API_DRIVER (icd)
           || SRT_IS_VDPAU_DRIVER (icd))
    {
      g_return_val_if_fail (base->library_path != NULL, NULL);
      name = base->library_path;
    }
  else
    {
      g_return_val_if_reached (NULL);
    }

  self = g_slice_new0 (IcdDetails);
  self->provider = g_object_ref (provider);
  self->in_n_providers = 1;
  self->icd = g_object_ref (icd);
  self->debug_name = name;
  self->has_library = (base->library_path != NULL);

  self->archs = g_array_new (FALSE,   /* don't allocate extra zeroed entry */
                             TRUE,    /* do zero-fill newly added entries */
                             sizeof (PvModulePerArch));
  g_array_set_clear_func (self->archs, pv_module_per_arch_clear);

  return self;
}

void
icd_details_free (IcdDetails *self)
{
  g_object_unref (self->icd);
  g_object_unref (self->provider);
  g_array_unref (self->archs);

  g_slice_free (IcdDetails, self);
}

static gboolean
icd_details_arch_is_applicable (const IcdDetails *self,
                                const SrtKnownArchitecture *known_arch)
{
  if (SRT_IS_BASE_JSON_GRAPHICS_MODULE (self->icd))
    {
      SrtBaseJsonGraphicsModule *module = self->icd;

      if (module->library_arch != NULL
          && known_arch->sizeof_pointer > 0)
        {
          g_autofree gchar *arch_bits = NULL;

          arch_bits = g_strdup_printf ("%u", known_arch->sizeof_pointer * 8);

          if (!g_str_equal (module->library_arch, arch_bits))
            return FALSE;
        }
    }

  return TRUE;
}

/*
 * icd_details_populate_architecture:
 * @self: The module
 * @quark: Interned string representing a multiarch tuple
 * @known: (nullable): Information about the architecture
 *
 * Add a new architecture to @archs (it must not already exist)
 * with details of this module on the architecture given by @quark.
 */
void
icd_details_populate_architecture (IcdDetails *self,
                                   GQuark quark,
                                   const SrtKnownArchitecture *known)
{
  g_auto(PvModulePerArch) arch = PV_MODULE_PER_ARCH_INIT;
  SrtBaseGraphicsModule *module = self->icd;
  g_autofree gchar *resolved_library = NULL;
  const char *tuple = g_quark_to_string (quark);
  gboolean is_json_based;

  g_return_if_fail (icd_details_check (self));
  g_debug ("%s:%s: checking architecture %s",
           self->provider->in_current_ns->path, self->debug_name, tuple);
  /* Precondition: We didn't already populate arch-specific info */
  g_return_if_fail (icd_details_lookup_architecture (self, quark) == NULL);

  is_json_based = SRT_IS_BASE_JSON_GRAPHICS_MODULE (module);

  if (!pv_graphics_provider_has_architecture (self->provider, quark))
    {
      g_debug ("-> provider not relevant for %s, ignoring", tuple);
      return;
    }

  if (known != NULL && !icd_details_arch_is_applicable (self, known))
    {
      g_debug ("-> ignored due to architecture restriction");
      return;
    }

  if (!self->has_library)
    {
      /* If this is a Vulkan meta-layer with no associated library,
       * there's nothing to do */
      g_return_if_fail (SRT_IS_VULKAN_LAYER (module));
      arch.kind = ICD_KIND_META_LAYER;
    }
  else
    {
      resolved_library = _srt_base_graphics_module_resolve_library_path (module);
      g_return_if_fail (resolved_library != NULL);

      /* TODO: Previously we only did this for Vulkan layers, but is it
       * applicable to all file types? */
      if (SRT_IS_VULKAN_LAYER (module) &&
          strchr (resolved_library, '/') != NULL &&
          (strstr (resolved_library, "$ORIGIN/") != NULL ||
           strstr (resolved_library, "${ORIGIN}") != NULL ||
           strstr (resolved_library, "$LIB/") != NULL ||
           strstr (resolved_library, "${LIB}") != NULL ||
           strstr (resolved_library, "$PLATFORM/") != NULL ||
           strstr (resolved_library, "${PLATFORM}") != NULL))
        {
          /* When loading a library by its absolute or relative path
           * (but not when searching the library path for its basename),
           * glibc expands dynamic string tokens: LIB, PLATFORM, ORIGIN.
           * libcapsule cannot expand these special tokens: the only thing
           * that knows the correct magic values for them is glibc, which has
           * no API to tell us. The only way we can find out the library's
           * real location is to tell libdl to load (dlopen) the library, and
           * see what the resulting path is. */
          if (_srt_sysroot_is_direct (self->provider->in_current_ns))
            {
              g_autoptr(SrtLibrary) library = NULL;
              SrtLibraryIssues issues;

              /* It's in our current namespace, so we can dlopen it. */
              g_info ("Evaluating dynamic string tokens in \"%s\"", resolved_library);
              issues = srt_check_library_presence (resolved_library,
                                                   tuple, NULL,
                                                   SRT_LIBRARY_SYMBOLS_FORMAT_PLAIN,
                                                   &library);
              if (issues & (SRT_LIBRARY_ISSUES_CANNOT_LOAD |
                            SRT_LIBRARY_ISSUES_UNKNOWN |
                            SRT_LIBRARY_ISSUES_TIMEOUT))
                {
                  g_info ("Unable to load library %s: %s", resolved_library,
                          srt_library_get_messages (library));
                  return;
                }
              else
                {
                  g_info ("After evaluating dynamic string tokens: \"%s\"",
                          srt_library_get_absolute_path (library));

                  g_clear_pointer (&resolved_library, g_free);
                  resolved_library = g_strdup (srt_library_get_absolute_path (library));
                }
            }
          else
            {
              /* Sorry, we can't know how to load this. */
              g_info ("Cannot support ld.so special tokens, e.g. ${LIB}, when provider "
                      "is not the root filesystem: ignoring %s",
                      resolved_library);
              return;
            }
        }

      if (is_json_based)
        {
          /* resolved_library could be either absolute or a basename */
          if (g_path_is_absolute (resolved_library))
            arch.kind = ICD_KIND_ABSOLUTE;
          else
            arch.kind = ICD_KIND_SONAME;
        }
      else
        {
          g_return_if_fail (g_path_is_absolute (resolved_library));
          arch.kind = ICD_KIND_ABSOLUTE;
        }
    }

  g_info ("%s[%s]: %s",
          self->debug_name, tuple, icd_kind_to_string (arch.kind));

  switch (arch.kind)
    {
      case ICD_KIND_ABSOLUTE:
      case ICD_KIND_SONAME:
        g_info ("-> path in provider %s: %s",
                self->provider->in_current_ns->path, resolved_library);
        break;

      case ICD_KIND_IGNORED:
      case ICD_KIND_META_LAYER:
      case ICD_KIND_NONEXISTENT:
        break;

      /* The purpose of this function is to set the @kind to
       * something other than %ICD_KIND_UNDECIDED */
      case ICD_KIND_UNDECIDED:
      default:
        g_return_if_reached ();
    }

  arch.resolved_library = g_steal_pointer (&resolved_library);
  arch.tuple = quark;
  g_return_if_fail (pv_module_per_arch_check (&arch, self, is_json_based));

  pv_module_per_arch_move_to_array (self->archs, &arch);

  /* Postcondition: this is redundant but for now let's be careful */
  g_return_if_fail (icd_details_check (self));
}

/*
 * icd_details_get_architecture:
 * @self: A module
 * @quark: Interned string representing a multiarch tuple
 *
 * Return architecture-specific information with @kind set to
 * %ICD_KIND_ABSOLUTE, %ICD_KIND_SONAME or %ICD_KIND_META_LAYER,
 * or %NULL if the architecture is ignored or nonexistent.
 *
 * Returns: (nullable): Architecture-specific information
 */
PvModulePerArch *
icd_details_get_architecture (IcdDetails *self,
                              GQuark quark)
{
  PvModulePerArch *arch;

  g_return_val_if_fail (icd_details_check (self), NULL);
  g_return_val_if_fail (quark != SRT_ARCHITECTURE_QUARK_NONE, NULL);

  arch = icd_details_lookup_architecture (self, quark);

  if (arch == NULL)
    return NULL;

  switch (arch->kind)
    {
      case ICD_KIND_ABSOLUTE:
      case ICD_KIND_SONAME:
      case ICD_KIND_META_LAYER:
        return arch;

      case ICD_KIND_IGNORED:
      case ICD_KIND_NONEXISTENT:
      case ICD_KIND_UNDECIDED:
        return NULL;

      default:
        g_return_val_if_reached (NULL);
    }
}

/*
 * icd_details_fill_array_single_arch:
 * @details_arr: (element-type IcdDetails): The array to populate,
 *  as returned by icd_details_array_sized_new()
 * @tuple: Interned string representing a multiarch tuple
 * @drivers: (element-type SrtBaseGraphicsModule): The drivers as discovered
 *  by #SrtSystemInfo, which must be DRI, GBM, VA-API or VDPAU
 * @known: (nullable): Information about the architecture
 *
 * Build an array of #IcdDetails, and populate the architecture-specific
 * details of architecture @tuple only.
 *
 * Returns: (transfer container) (element-type IcdDetails): An array of
 *  representations of the drivers
 */
void
icd_details_fill_array_single_arch (GPtrArray *details_arr,
                                    GQuark tuple,
                                    PvGraphicsProvider *provider,
                                    const GList *drivers,
                                    const SrtKnownArchitecture *known)
{
  const GList *icd_iter;
  gsize j;

  g_return_if_fail (tuple != SRT_ARCHITECTURE_QUARK_NONE);

  for (icd_iter = drivers, j = 0; icd_iter != NULL; icd_iter = icd_iter->next, j++)
    {
      SrtBaseGraphicsModule *module = icd_iter->data;
      g_autoptr(IcdDetails) details = icd_details_new (provider, module);

      g_assert (SRT_IS_DRI_DRIVER (module)
                || SRT_IS_GBM_BACKEND (module)
                || SRT_IS_VA_API_DRIVER (module)
                || SRT_IS_VDPAU_DRIVER (module));
      g_assert (!SRT_IS_BASE_JSON_GRAPHICS_MODULE (module));

      icd_details_populate_architecture (details, tuple, known);
      g_return_if_fail (icd_details_check (details));
      g_ptr_array_add (details_arr, g_steal_pointer (&details));
    }
}

/*
 * icd_details_fill_array_json_based:
 * @details_arr: (element-type IcdDetails): The array to populate,
 *  as returned by icd_details_array_sized_new()
 * @which: A description of the kind of driver, for example
 *  "Vulkan implicit layer"
 * @drivers: (element-type SrtBaseJsonGraphicsModule): The drivers as
 *  discovered by #SrtSystemInfo, which must be based on a JSON manifest
 *
 * Build an array of those @drivers that are not in an error state.
 * No architecture-specific details are populated at this stage.
 *
 * Returns: (transfer container) (element-type IcdDetails): An array of
 *  representations of the drivers
 */
static void
icd_details_fill_array_json_based (GPtrArray *details_arr,
                                   PvGraphicsProvider *provider,
                                   const char *which,
                                   const GList *drivers)
{
  gsize i;
  const GList *icd_i;

  for (icd_i = drivers, i = 0; icd_i != NULL; icd_i = icd_i->next, i++)
    {
      g_autoptr(IcdDetails) details = NULL;
      SrtBaseJsonGraphicsModule *module = icd_i->data;
      SrtBaseGraphicsModule *base = &module->parent;
      const gchar *path;
      GError *local_error = NULL;

      g_return_if_fail (SRT_IS_BASE_JSON_GRAPHICS_MODULE (module));
      path = module->json_path;

      if (!_srt_base_graphics_module_check_error (base, &local_error))
        {
          _srt_log_warning ("Failed to load %s #%" G_GSIZE_FORMAT " from %s: %s",
                            which, i, path, local_error->message);
          g_clear_error (&local_error);
          continue;
        }

      const gchar *description = base->library_path;

      if (description == NULL)
        description = "meta-layer";

      g_info ("%s #%" G_GSIZE_FORMAT " at %s: %s",
              which, i, path, description);

      details = icd_details_new (provider, module);
      g_return_if_fail (icd_details_check (details));
      g_ptr_array_add (details_arr, g_steal_pointer (&details));
    }
}

IcdStack *
icd_stack_new (void)
{
  return g_slice_new0 (IcdStack);
}

static void
icd_stack_enumerate_egl_icds (IcdStack *self,
                              PvGraphicsProvider *provider,
                              SrtSystemInfo *system_info,
                              const gchar *which_system)
{
  G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) timer = NULL;
  g_autoptr(SrtObjectList) egl_icds = NULL;

  timer = _srt_profiling_start ("Enumerating EGL ICDs on %s system", which_system);
  g_debug ("Enumerating EGL ICDs on %s system...", which_system);
  egl_icds = srt_system_info_list_egl_icds (system_info, NULL);

  if (self->egl_icd_details == NULL)
    self->egl_icd_details = icd_details_array_sized_new (g_list_length (egl_icds));

  icd_details_fill_array_json_based (self->egl_icd_details,
                                     provider,
                                     "EGL ICD",
                                     egl_icds);
}

static void
icd_stack_enumerate_egl_ext_platforms (IcdStack *self,
                                       PvGraphicsProvider *provider,
                                       SrtSystemInfo *system_info,
                                       const gchar *which_system)
{
  G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) timer = NULL;
  g_autoptr(SrtObjectList) egl_ext_platforms = NULL;

  timer = _srt_profiling_start ("Enumerating EGL external platforms on %s system",
                                which_system);
  g_debug ("Enumerating EGL external platforms on %s system...", which_system);
  egl_ext_platforms = srt_system_info_list_egl_external_platforms (system_info,
                                                                   NULL);

  if (self->egl_ext_platform_details == NULL)
    self->egl_ext_platform_details = icd_details_array_sized_new (g_list_length (egl_ext_platforms));

  icd_details_fill_array_json_based (self->egl_ext_platform_details,
                                     provider,
                                     "EGL external platform",
                                     egl_ext_platforms);
}

static void
icd_stack_enumerate_vulkan_icds (IcdStack *self,
                                 PvGraphicsProvider *provider,
                                 SrtSystemInfo *system_info,
                                 const gchar *which_system)
{
  G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) timer = NULL;
  g_autoptr(SrtObjectList) vulkan_icds = NULL;

  timer = _srt_profiling_start ("Enumerating Vulkan ICDs on %s system", which_system);
  g_debug ("Enumerating Vulkan ICDs on %s system...", which_system);
  vulkan_icds = srt_system_info_list_vulkan_icds (system_info, NULL);

  if (self->vulkan_icd_details == NULL)
    self->vulkan_icd_details = icd_details_array_sized_new (g_list_length (vulkan_icds));

  icd_details_fill_array_json_based (self->vulkan_icd_details,
                                     provider,
                                     "Vulkan ICD",
                                     vulkan_icds);
}

static void
icd_stack_enumerate_vulkan_layers (IcdStack *self,
                                   PvGraphicsProvider *provider,
                                   SrtSystemInfo *system_info,
                                   const gchar *which_system)
{
  G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) timer = NULL;
  g_autoptr(SrtObjectList) vulkan_exp_layers = NULL;
  g_autoptr(SrtObjectList) vulkan_imp_layers = NULL;

  timer = _srt_profiling_start ("Enumerating Vulkan layers on %s system", which_system);

  g_debug ("Enumerating Vulkan explicit layers on %s system...", which_system);
  vulkan_exp_layers = srt_system_info_list_explicit_vulkan_layers (system_info);

  if (self->vulkan_exp_layer_details == NULL)
    self->vulkan_exp_layer_details = icd_details_array_sized_new (g_list_length (vulkan_exp_layers));

  icd_details_fill_array_json_based (self->vulkan_exp_layer_details,
                                     provider,
                                     "Vulkan explicit layer",
                                     vulkan_exp_layers);

  g_debug ("Enumerating Vulkan implicit layers on %s system...", which_system);
  vulkan_imp_layers = srt_system_info_list_implicit_vulkan_layers (system_info);

  if (self->vulkan_imp_layer_details == NULL)
    self->vulkan_imp_layer_details = icd_details_array_sized_new (g_list_length (vulkan_imp_layers));

  icd_details_fill_array_json_based (self->vulkan_imp_layer_details,
                                     provider,
                                     "Vulkan implicit layer",
                                     vulkan_imp_layers);
}

static void
icd_stack_enumerate_openxr_1_runtimes (IcdStack *self,
                                       PvGraphicsProvider *provider,
                                       SrtSystemInfo *system_info,
                                       const gchar *which_system)
{
  G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) timer = NULL;
  const GQuark *tuples;
  gsize n;
  gsize i;

  timer = _srt_profiling_start ("Enumerating OpenXR 1 runtimes on %s system",
                                which_system);
  g_debug ("Enumerating OpenXR 1 runtimes on %s system...", which_system);

  if (self->openxr_1_runtime_details == NULL)
    self->openxr_1_runtime_details = g_hash_table_new_full (g_str_hash,
                                                            g_str_equal,
                                                            g_free,
                                                            (GDestroyNotify) icd_details_free);

  tuples = pv_graphics_provider_get_architectures (provider, &n);

  for (i = 0; i < n; i++)
    {
      g_autoptr(SrtOpenXr1Runtime) rt = NULL;
      g_autoptr(GError) local_error = NULL;
      g_autoptr(IcdDetails) details = NULL;
      const char *multiarch_tuple = g_quark_to_string (tuples[i]);
      const char *path;

      rt = srt_system_info_dup_openxr_1_runtime (system_info, multiarch_tuple);
      if (rt == NULL)
        continue;

      path = srt_openxr_1_runtime_get_json_path (rt);

      if (!srt_openxr_1_runtime_check_error (rt, &local_error))
        {
          _srt_log_warning ("Failed to load OpenXR 1 runtime for %s from %s: %s",
                            multiarch_tuple, path, local_error->message);
          g_clear_error (&local_error);
          continue;
        }

      g_info ("OpenXR 1 runtime for %s at %s: %s",
              multiarch_tuple, path,
              srt_openxr_1_runtime_get_library_path (rt));

      details = icd_details_new (provider, rt);
      g_return_if_fail (icd_details_check (details));
      g_hash_table_insert (self->openxr_1_runtime_details,
                           g_strdup (multiarch_tuple),
                           g_steal_pointer (&details));
    }
}

static void
icd_stack_enumerate_openxr_1_layers (IcdStack *self,
                                     PvGraphicsProvider *provider,
                                     SrtSystemInfo *system_info,
                                     const gchar *which_system)
{
  G_GNUC_UNUSED g_autoptr(SrtProfilingTimer) timer = NULL;
  g_autoptr(SrtObjectList) exp_layers = NULL;
  g_autoptr(SrtObjectList) imp_layers = NULL;

  timer = _srt_profiling_start ("Enumerating OpenXR 1 layers on %s system", which_system);

  g_debug ("Enumerating OpenXR 1 explicit layers on %s system...", which_system);
  exp_layers = srt_system_info_list_explicit_openxr_1_layers (system_info);

  if (self->openxr_1_exp_layer_details == NULL)
    self->openxr_1_exp_layer_details = icd_details_array_sized_new (g_list_length (exp_layers));

  icd_details_fill_array_json_based (self->openxr_1_exp_layer_details,
                                     provider,
                                     "OpenXR 1 explicit layer",
                                     exp_layers);

  g_debug ("Enumerating OpenXR 1 implicit layers on %s system...", which_system);
  imp_layers = srt_system_info_list_implicit_openxr_1_layers (system_info);

  if (self->openxr_1_imp_layer_details == NULL)
    self->openxr_1_imp_layer_details = icd_details_array_sized_new (g_list_length (imp_layers));

  icd_details_fill_array_json_based (self->openxr_1_imp_layer_details,
                                     provider,
                                     "OpenXR 1 implicit layer",
                                     imp_layers);
}

/*
 * icd_stack_enumerate:
 * @self: The stack
 * @runtime_flags: Flags determining which types of driver we are
 *  interested in
 * @provider: A graphics stack provider
 * @which_system: A string such as `"host"` or `"provider"` for
 *  use in diagnostic messages
 *
 * Find all the JSON-manifest-based drivers provided by @provider.
 * No architecture-specific details are populated at this stage.
 *
 * Returns: (transfer container) (element-type IcdDetails): An array of
 *  representations of the drivers
 */
void
icd_stack_enumerate (IcdStack *self,
                     PvRuntimeFlags runtime_flags,
                     PvGraphicsProvider *provider,
                     const char *which_system)
{
  SrtSystemInfo *system_info;

  system_info = pv_graphics_provider_get_system_info (provider, SRT_ARCHITECTURE_QUARK_NONE);
  icd_stack_enumerate_egl_icds (self, provider, system_info, which_system);
  icd_stack_enumerate_egl_ext_platforms (self, provider, system_info, which_system);
  icd_stack_enumerate_vulkan_icds (self, provider, system_info, which_system);

  if (runtime_flags & PV_RUNTIME_FLAGS_IMPORT_VULKAN_LAYERS)
    icd_stack_enumerate_vulkan_layers (self, provider, system_info, which_system);

  if (runtime_flags & PV_RUNTIME_FLAGS_IMPORT_OPENXR_1_RUNTIMES)
    icd_stack_enumerate_openxr_1_runtimes (self, provider, system_info, which_system);

  if (runtime_flags & PV_RUNTIME_FLAGS_IMPORT_OPENXR_1_LAYERS)
    icd_stack_enumerate_openxr_1_layers (self, provider, system_info, which_system);
}

void
icd_stack_free (IcdStack *self)
{
  g_clear_pointer (&self->egl_icd_details, g_ptr_array_unref);
  g_clear_pointer (&self->egl_ext_platform_details, g_ptr_array_unref);
  g_clear_pointer (&self->vulkan_icd_details, g_ptr_array_unref);
  g_clear_pointer (&self->vulkan_exp_layer_details, g_ptr_array_unref);
  g_clear_pointer (&self->vulkan_imp_layer_details, g_ptr_array_unref);
  g_clear_pointer (&self->openxr_1_runtime_details, g_hash_table_unref);
  g_clear_pointer (&self->openxr_1_exp_layer_details, g_ptr_array_unref);
  g_clear_pointer (&self->openxr_1_imp_layer_details, g_ptr_array_unref);
  g_slice_free (IcdStack, self);
}

static void
pv_manifest_deduplicator_add_if_unique (PvManifestDeduplicator *self,
                                        IcdDetails *details)
{
  SrtBaseJsonGraphicsModule *module;
  const char *path_in_provider;
  const char *original_json;
  void *other_voidp;

  module = details->icd;
  path_in_provider = module->json_path;
  original_json = module->original_json;

  /* We don't track the original content of layer manifests to save some
   * memory, because Vulkan-Loader will deduplicate them anyway */
  if (original_json == NULL)
    return;

  if (g_hash_table_lookup_extended (self->content_to_details,
                                    original_json, NULL, &other_voidp))
    {
      IcdDetails *other = other_voidp;
      SrtBaseJsonGraphicsModule *other_module = other->icd;
      const char *other_path = other_module->json_path;

      g_info ("Ignoring \"%s\" in \"%s\" "
              "because it has the same content as \"%s\" in \"%s\"",
              path_in_provider, details->provider->in_current_ns->path,
              other_path, other->provider->in_current_ns->path);
      details->is_duplicate = true;
      other->in_n_providers += 1;
      return;
    }

  /* Remember it so we can ignore any subsequent duplicates.
   * Casts are required because GHashTable is not const-correct for
   * The cast is required because GHashTable is not const-correct for
   * "borrowed" keys and values. */
  g_hash_table_replace (self->content_to_details,
                        (void *) original_json, details);
}

void
pv_manifest_deduplicator_populate (PvManifestDeduplicator *self,
                                   IcdDetails * const *details,
                                   gsize n)
{
  gsize i;

  g_return_if_fail (g_hash_table_size (self->content_to_details) == 0);

  for (i = 0; i < n; i++)
    {
      g_return_if_fail (SRT_IS_BASE_JSON_GRAPHICS_MODULE (details[i]->icd));
      pv_manifest_deduplicator_add_if_unique (self, details[i]);
    }
}
