/*
 * Copyright © 2020-2025 Collabora Ltd.
 *
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

#pragma once

#include <stdbool.h>

#include "steam-runtime-tools/glib-backports-internal.h"
#include "libglnx.h"

#include <steam-runtime-tools/steam-runtime-tools.h>

#include "graphics-provider.h"
#include "runtime-flags.h"

/*
 * IcdKind:
 * @ICD_KIND_UNDECIDED: We have not yet checked whether the module exists.
 * @ICD_KIND_NONEXISTENT: The module doesn't exist on this architecture.
 * @ICD_KIND_IGNORED: We ignored the module on this architecture,
 *  for example because the JSON manifest was for a different graphics
 *  provider.
 * @ICD_KIND_ABSOLUTE: The module is an absolute path (possibly containing
 *  libdl dynamic string tokens such as `${LIB}`) which can be resolved
 *  to a library suitable for this architecture.
 * @ICD_KIND_SONAME: The module is a basename such as
 *  `libVkLayer_MESA_device_select.so` which can be resolved to a library
 *  suitable for this architecture.
 * @ICD_KIND_META_LAYER: The module is a Vulkan meta-layer or similar,
 *  and therefore is not backed by a single library (although it might
 *  point to concrete layers that are, themselves, backed by libraries).
 *
 * The disposition of a specific driver/layer on a specific architecture.
 */
typedef enum
{
  ICD_KIND_UNDECIDED = 0,
  ICD_KIND_NONEXISTENT,
  ICD_KIND_IGNORED,
  ICD_KIND_ABSOLUTE,
  ICD_KIND_SONAME,
  ICD_KIND_META_LAYER,
} IcdKind;

const char *icd_kind_to_string (IcdKind kind);

/*
 * PvModulePerArch:
 * @resolved_library: The resolved name or path of the library
 *  for this architecture. Depends on the @kind:
 *  for %ICD_KIND_SONAME it is the basename of the library,
 *  for %ICD_KIND_ABSOLUTE it is the absolute path in the provider's
 *  namespace (but possibly contains libdl dynamic string tokens),
 *  and for other kinds it is %NULL.
 * @path_in_container: If the @kind is %ICD_KIND_ABSOLUTE or %ICD_KIND_SONAME,
 *  then this is
 *  a concrete, absolute path accessible in the container from which the
 *  library will be loadable, with no libdl dynamic string tokens,
 *  for example "/run/host/usr/lib/.../libfoo.so" or
 *  "/overrides/lib/.../libfoo.so". Otherwise it is %NULL.
 * @kind: The disposition of this library on this architecture.
 *
 * Details of a driver, Vulkan layer or similar thing discovered in a
 * graphics provider, for one specific architecture.
 *
 * Note that the reason why @resolved_library appears here, and not in
 * #IcdDetails, is that its value can be architecture-specific:
 * for some module types, we expand dynamic string tokens like ${LIB}.
 * The module might also be relevant to some architectures
 * but %ICD_KIND_IGNORED on others, for example because they are using
 * a different graphics stack provider.
 */
typedef struct
{
  gchar *resolved_library;
  gchar *path_in_container;
  GQuark tuple;
  IcdKind kind;
} PvModulePerArch;

#define PV_MODULE_PER_ARCH_INIT \
{ \
  .resolved_library = NULL, \
  .path_in_container = NULL, \
  .tuple = SRT_ARCHITECTURE_QUARK_NONE, \
  .kind = ICD_KIND_UNDECIDED, \
}

static inline void
pv_module_per_arch_clear (void *p)
{
  PvModulePerArch *self = p;

  g_clear_pointer (&self->resolved_library, g_free);
  g_clear_pointer (&self->path_in_container, g_free);
  self->tuple = SRT_ARCHITECTURE_QUARK_NONE;
  self->kind = ICD_KIND_UNDECIDED;
}

G_DEFINE_AUTO_CLEANUP_CLEAR_FUNC (PvModulePerArch, pv_module_per_arch_clear)

/*
 * IcdDetails:
 * @icd: (type SrtBaseGraphicsModule): The module object.
 *  Its type can be any of:
 *  #SrtEglIcd, #SrtEglExternalPlatform,
 *  #SrtVulkanIcd, #SrtVulkanLayer,
 *  #SrtDriDriver, #SrtVaApiDriver, #SrtVdpauDriver,
 *  #SrtOpenXr1Runtime, #SrtOpenXr1Layer
 * @debug_name: Some sort of name for the module, to be used in diagnostic
 *  messages only. Assumed to be owned by @icd.
 * @provider: The graphics stack provider where we found this driver
 * @archs: (element-type PvModulePerArch): Per-architecture information
 *  in an unspecified order
 * @in_n_providers: Number of graphics stack providers with an identical
 *  JSON manifest, or 1 if this module is not JSON-based or if no
 *  deduplication was performed.
 * @duplicate: If true, this driver's JSON manifest is a duplicate of a
 *  previously discovered JSON manifest of the same type.
 *
 * Details of a driver, Vulkan layer or similar thing discovered in a
 * graphics provider.
 *
 * For modules that are described by a JSON manifest, such as Vulkan
 * drivers and layers, the same JSON manifest may serve multiple
 * architectures. For example,
 * `/usr/share/vulkan/implicit_layer.d/VkLayer_MESA_device_select.json`
 * typically describes `libVkLayer_MESA_device_select.so`, which can
 * be found at a different path in each architecture's library directory,
 * while `/usr/share/vulkan/implicit_layer.d/MangoHud.json` might describe
 * `/usr/$LIB/mangohud/libMangoHud.so`, which resolves to a different path
 * for each architecture when the `$LIB` dynamic string token is expanded.
 *
 * If `libVkLayer_MESA_device_select.so` exists for both x86_64 and i386,
 * `libMangoHud.so` only exists for x86_64, and nothing exists on aarch64,
 * then we might represent that situation as:
 *
 * ```
 * {
 *   icd: <SrtVulkanLayer for libVkLayer_MESA_device_select.so>,
 *   debug_name: ".../VkLayer_MESA_device_select.json",
 *   archs: [
 *     [x86_64]: {
 *       resolved_library: "libVkLayer...",
 *       path_in_container: NULL,
 *       kind: ICD_KIND_SONAME,
 *     },
 *     [i386]: {
 *       resolved_library: "libVkLayer...",
 *       path_in_container: NULL,
 *       kind: ICD_KIND_SONAME,
 *     },
 *     [aarch64]: {
 *       resolved_library: NULL,
 *       path_in_container: NULL,
 *       kind: ICD_KIND_NONEXISTENT,
 *     },
 *   ],
 * },
 * {
 *   icd: <SrtVulkanLayer for libMangoHud.so>,
 *   debug_name: ".../MangoHud.json",
 *   archs: [
 *     [x86_64]: {
 *       resolved_library: "/usr/lib/$LIB/mangohud/libMangoHud.so",
 *       path_in_container: "/run/host/usr/lib/x86_64-.../libMangoHud.so",
 *       kind: ICD_KIND_ABSOLUTE,
 *     },
 *     [i386]: {
 *       resolved_library: NULL,
 *       path_in_container: NULL,
 *       kind: ICD_KIND_NONEXISTENT,
 *     },
 *     [aarch64]: {
 *       resolved_library: NULL,
 *       path_in_container: NULL,
 *       kind: ICD_KIND_NONEXISTENT,
 *     },
 *   ],
 * },
 * ```
 */
typedef struct
{
  gpointer icd;
  const char *debug_name;
  PvGraphicsProvider *provider;
  GArray *archs;
  gsize in_n_providers;
  bool has_library : 1;
  bool is_duplicate : 1;
} IcdDetails;

void icd_details_free (IcdDetails *self);

G_DEFINE_AUTOPTR_CLEANUP_FUNC (IcdDetails, icd_details_free)

void icd_details_populate_architecture (IcdDetails *self,
                                        GQuark quark,
                                        const SrtKnownArchitecture *known);
PvModulePerArch *icd_details_get_architecture (IcdDetails *self,
                                               GQuark quark);

/*
 * icd_details_array_sized_new:
 * @n: Number of entries to allocate space for. This is only an
 *  optimization and it's safe to pass 0.
 *
 * Returns: (transfer container) (element-type IcdDetails): An empty array of
 *  representations of drivers, to which more can be added
 */
static inline GPtrArray *
icd_details_array_sized_new (gsize n)
{
  return g_ptr_array_new_full (n, (GDestroyNotify) G_CALLBACK (icd_details_free));
}

void icd_details_fill_array_single_arch (GPtrArray *details_arr,
                                         GQuark tuple,
                                         PvGraphicsProvider *provider,
                                         const GList *drivers,
                                         const SrtKnownArchitecture *known);

/*
 * IcdStack:
 * @egl_icd_details: (element-type IcdDetails): Array of details each
 *  based on a #SrtEglIcd
 * @egl_ext_platform_details: (element-type IcdDetails): Array of details each
 *  based on a #SrtEglExternalPlatform
 * @vulkan_icd_details: (element-type IcdDetails): Array of details each
 *  based on a #SrtVulkanIcd
 * @vulkan_exp_layer_details: (element-type IcdDetails): Array of details each
 *  based on a #SrtVulkanLayer representing an explicit layer
 * @vulkan_imp_layer_details: (element-type IcdDetails): Array of details each
 *  based on a #SrtVulkanLayer representing an implicit layer
 * @openxr_1_runtime_details: (element-type utf8 IcdDetails): Map with
 *  owned string multiarch tuples as keys and owned IcdDetails as values
 * @openxr_1_exp_layer_details: (element-type IcdDetails): Array of details
 *  each based on a #SrtOpenXr1Layer representing an explicit layer
 * @openxr_1_imp_layer_details: (element-type IcdDetails): Array of details
 *  each based on a #SrtOpenXr1Layer representing an implicit layer
 *
 * Details of all drivers, Vulkan layers or similar things discovered in the
 * graphics provider via a JSON manifest.
 */
typedef struct
{
  GPtrArray *egl_icd_details;
  GPtrArray *egl_ext_platform_details;
  GPtrArray *vulkan_icd_details;
  GPtrArray *vulkan_exp_layer_details;
  GPtrArray *vulkan_imp_layer_details;
  GHashTable *openxr_1_runtime_details;
  GPtrArray *openxr_1_exp_layer_details;
  GPtrArray *openxr_1_imp_layer_details;
} IcdStack;

IcdStack *icd_stack_new (void);

void icd_stack_enumerate (IcdStack *self,
                          PvRuntimeFlags runtime_flags,
                          PvGraphicsProvider *provider,
                          const char *which_system);

void icd_stack_free (IcdStack *self);

G_DEFINE_AUTOPTR_CLEANUP_FUNC (IcdStack, icd_stack_free)

/*
 * PvManifestDeduplicator:
 * @content_to_details: (element-type utf8 IcdDetails): A map representing
 *  JSON manifests with unique content, used to detect and suppress
 *  exact duplicates.
 *  Keys are unowned strings with JSON manifest content, borrowed from
 *  the #SrtBaseJsonGraphicsModule in the #IcdDetails.
 *  Values are the #IcdDetails itself.
 *
 * Data structure used to eliminate duplicate JSON manifests for Vulkan
 * drivers, EGL drivers and EGL external platforms.
 */
typedef struct
{
  GHashTable *content_to_details;
} PvManifestDeduplicator;

#define PV_MANIFEST_DEDUPLICATOR_INIT { NULL }

static void
pv_manifest_deduplicator_clear (PvManifestDeduplicator *self)
{
  g_clear_pointer (&self->content_to_details, g_hash_table_unref);
}

G_DEFINE_AUTO_CLEANUP_CLEAR_FUNC (PvManifestDeduplicator,
                                  pv_manifest_deduplicator_clear)

static inline void
pv_manifest_deduplicator_init (PvManifestDeduplicator *self)
{
  self->content_to_details = g_hash_table_new_full (g_str_hash, g_str_equal,
                                                    NULL, NULL);
}

void pv_manifest_deduplicator_populate (PvManifestDeduplicator *self,
                                        IcdDetails * const *details_arr,
                                        gsize n);
