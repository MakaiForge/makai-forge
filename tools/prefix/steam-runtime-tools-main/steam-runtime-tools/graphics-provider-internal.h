/*<private_header>*/
/*
 * Copyright © 2025 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#pragma once

#include <steam-runtime-tools/macros.h>
#include <steam-runtime-tools/glib-backports-internal.h>

#include "steam-runtime-tools/resolve-in-sysroot-internal.h"

typedef enum
{
  SRT_GRAPHICS_PROVIDER_FEATURE_FLAGS_VA_API = (1 << 0),
  SRT_GRAPHICS_PROVIDER_FEATURE_FLAGS_VDPAU = (1 << 1),
  SRT_GRAPHICS_PROVIDER_FEATURE_FLAGS_LOCALES = (1 << 2),
  SRT_GRAPHICS_PROVIDER_FEATURE_FLAGS_NONE = 0
} SrtGraphicsProviderFeatureFlags;

#define SRT_GRAPHICS_PROVIDER_FEATURE_FLAGS_DEFAULT \
  (SRT_GRAPHICS_PROVIDER_FEATURE_FLAGS_VA_API \
   | SRT_GRAPHICS_PROVIDER_FEATURE_FLAGS_VDPAU \
   | SRT_GRAPHICS_PROVIDER_FEATURE_FLAGS_LOCALES)

typedef struct _SrtGraphicsProviderArchitecture SrtGraphicsProviderArchitecture;

typedef struct _SrtGraphicsProvider SrtGraphicsProvider;
typedef struct _SrtGraphicsProviderClass SrtGraphicsProviderClass;

#define SRT_TYPE_GRAPHICS_PROVIDER (_srt_graphics_provider_get_type ())
#define SRT_GRAPHICS_PROVIDER(o) (G_TYPE_CHECK_INSTANCE_CAST ((o), SRT_TYPE_GRAPHICS_PROVIDER, SrtGraphicsProvider))
#define SRT_IS_GRAPHICS_PROVIDER(o) (G_TYPE_CHECK_INSTANCE_TYPE ((o), SRT_TYPE_GRAPHICS_PROVIDER))
#define SRT_GRAPHICS_PROVIDER_GET_CLASS(o) (G_TYPE_INSTANCE_GET_CLASS ((o), SRT_TYPE_GRAPHICS_PROVIDER, SrtGraphicsProviderClass))
#define SRT_GRAPHICS_PROVIDER_CLASS(c) (G_TYPE_CHECK_CLASS_CAST ((c), SRT_TYPE_GRAPHICS_PROVIDER, SrtGraphicsProviderClass))
#define SRT_IS_GRAPHICS_PROVIDER_CLASS(c) (G_TYPE_CHECK_CLASS_TYPE ((c), SRT_TYPE_GRAPHICS_PROVIDER))

GType _srt_graphics_provider_get_type (void);
G_DEFINE_AUTOPTR_CLEANUP_FUNC (SrtGraphicsProvider, g_object_unref)

const char *_srt_graphics_provider_describe (SrtGraphicsProvider *self);
const char *_srt_graphics_provider_get_manifest_path (SrtGraphicsProvider *self);
const char *_srt_graphics_provider_get_root_path (SrtGraphicsProvider *self);
SrtSysroot *_srt_graphics_provider_get_root (SrtGraphicsProvider *self);
SrtGraphicsProviderFeatureFlags _srt_graphics_provider_get_features (SrtGraphicsProvider *self);
const GQuark *_srt_graphics_provider_get_architectures (SrtGraphicsProvider *self,
                                                        size_t *n_out);

const SrtGraphicsProviderArchitecture *_srt_graphics_provider_get_nth_architecture (SrtGraphicsProvider *self,
                                                                                    size_t n);
const SrtGraphicsProviderArchitecture *_srt_graphics_provider_get_architecture (SrtGraphicsProvider *self,
                                                                                GQuark tuple_quark);
SrtGraphicsProviderFeatureFlags _srt_graphics_provider_architecture_get_features (const SrtGraphicsProviderArchitecture *self);
GQuark _srt_graphics_provider_architecture_get_tuple (const SrtGraphicsProviderArchitecture *self);
const char *_srt_graphics_provider_architecture_get_dri_path (const SrtGraphicsProviderArchitecture *self);
const char *_srt_graphics_provider_architecture_get_gbm_path (const SrtGraphicsProviderArchitecture *self);
const char * const *_srt_graphics_provider_architecture_get_fallback_library_paths (const SrtGraphicsProviderArchitecture *self);
const char *_srt_graphics_provider_architecture_get_gconv_path (const SrtGraphicsProviderArchitecture *self);

SrtGraphicsProvider *_srt_graphics_provider_new_from_manifest (const char *path,
                                                               GError **error);
SrtGraphicsProvider *_srt_graphics_provider_new_for_directory (SrtSysroot *root,
                                                               const GQuark *tuple_quarks,
                                                               size_t n_tuple_quarks);
SrtGraphicsProvider *_srt_graphics_provider_new_for_path (const char *path,
                                                          const GQuark *tuple_quarks,
                                                          size_t n_tuple_quarks,
                                                          GError **error);
