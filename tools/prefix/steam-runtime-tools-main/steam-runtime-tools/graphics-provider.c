/*
 * Copyright © 2025 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#include "steam-runtime-tools/graphics-provider-private.h"

#include "steam-runtime-tools/enums-internal.h"
#include "steam-runtime-tools/utils-internal.h"

/*
 * SrtGraphicsProvider:
 *
 * Object representing a source of graphics drivers and other libraries.
 *
 * All fields are read-only (immutable) after construction,
 * so this object can safely be shared between threads,
 * as long as each thread holds a reference.
 */

void
_srt_graphics_provider_architecture_clear (void *p)
{
  static const SrtGraphicsProviderArchitecture blank = SRT_GRAPHICS_PROVIDER_ARCHITECTURE_INIT;
  SrtGraphicsProviderArchitecture *self = p;

  g_clear_pointer (&self->dri_path, g_free);
  g_clear_pointer (&self->gbm_path, g_free);
  g_clear_pointer (&self->fallback_library_paths, g_strfreev);
  g_clear_pointer (&self->gconv_path, g_free);
  *self = blank;
}

static void
arch_copy (SrtGraphicsProviderArchitecture *dest,
           const SrtGraphicsProviderArchitecture *src)
{
  _srt_graphics_provider_architecture_clear (dest);
  dest->dri_path = g_strdup (src->dri_path);
  dest->gbm_path = g_strdup (src->gbm_path);
  dest->fallback_library_paths = g_strdupv (src->fallback_library_paths);
  dest->gconv_path = g_strdup (src->gconv_path);
  dest->tuple_quark = src->tuple_quark;
  dest->features = src->features;
}

/*
 * @dest: (element-type SrtGraphicsProviderArchitecture):
 * @src: (element-type SrtGraphicsProviderArchitecture):
 */
static void
archs_array_extend (GArray *dest,
                    const GArray *src)
{
  for (size_t i = 0; i < src->len; i++)
    {
      SrtGraphicsProviderArchitecture temp = SRT_GRAPHICS_PROVIDER_ARCHITECTURE_INIT;

      arch_copy (&temp,
                 &g_array_index (src, const SrtGraphicsProviderArchitecture, i));
      g_array_append_vals (dest, &temp, 1);
    }
}

/*
 * @tuple_quarks: (nullable) (array length=n_tuple_quarks): An array of
 *  nonzero quarks representing multiarch tuples
 * @n_tuple_quarks: Number of items in @tuple_quarks
 * @features: Each architecture is assumed to have these features
 *
 * Returns: (element-type SrtGraphicsProviderArchitecture):
 */
GArray *
_srt_graphics_provider_architecture_array_new (const GQuark *tuple_quarks,
                                               size_t n_tuple_quarks,
                                               SrtGraphicsProviderFeatureFlags features)
{
  g_autoptr(GArray) archs = NULL;
  /* typically contains at most x86_64 and i386 */
  size_t estimate = 2;

  g_return_val_if_fail (tuple_quarks != NULL || n_tuple_quarks == 0, NULL);

  if (n_tuple_quarks != 0)
    estimate = n_tuple_quarks;

  archs = g_array_sized_new (FALSE,  /* no extra zeroed entry at the end */
                             TRUE,   /* zero-fill new entries */
                             sizeof (SrtGraphicsProviderArchitecture),
                             estimate);
  g_array_set_clear_func (archs, _srt_graphics_provider_architecture_clear);

  for (size_t i = 0; i < n_tuple_quarks; i++)
    {
      SrtGraphicsProviderArchitecture arch = SRT_GRAPHICS_PROVIDER_ARCHITECTURE_INIT;

      g_return_val_if_fail (tuple_quarks[i] != SRT_ARCHITECTURE_QUARK_NONE, NULL);
      arch.tuple_quark = tuple_quarks[i];
      arch.features = features;
      g_array_append_vals (archs, &arch, 1);
    }

  return g_steal_pointer (&archs);
}

/*
 * _srt_graphics_provider_architecture_get_features:
 * @self: An architecture
 *
 * Return features expected to be present on this architecture.
 * For example, if the result does not
 * include %SRT_GRAPHICS_PROVIDER_FEATURE_FLAGS_VA_API, then discovery
 * of VA-API drivers can safely be skipped when using this graphics stack.
 *
 * Returns: Feature flags applicable to this specific architecture
 */
SrtGraphicsProviderFeatureFlags
_srt_graphics_provider_architecture_get_features (const SrtGraphicsProviderArchitecture *self)
{
  return self->features;
}

/*
 * _srt_graphics_provider_architecture_get_tuple:
 * @self: An architecture
 *
 * Returns: An interned string representing this architecture's multiarch tuple,
 *  for example `g_quark_from_string (SRT_ABI_X86_64)`
 */
GQuark
_srt_graphics_provider_architecture_get_tuple (const SrtGraphicsProviderArchitecture *self)
{
  return self->tuple_quark;
}

/*
 * _srt_graphics_provider_architecture_get_dri_path:
 * @self: An architecture
 *
 * Return the directory containing Mesa DRI drivers and VA-API drivers
 * for this architecture, or %NULL if unknown.
 *
 * The returned path should be looked up inside the sysroot returned by
 * _srt_graphics_provider_get_root(), not the real root.
 *
 * The returned string is only valid as long as a reference to
 * the #SrtGraphicsProvider is held.
 *
 * Returns: (nullable) (type filename): A path such as `/usr/lib64/dri`,
 *  or %NULL if unknown
 */
const char *
_srt_graphics_provider_architecture_get_dri_path (const SrtGraphicsProviderArchitecture *self)
{
  return self->dri_path;
}

/*
 * _srt_graphics_provider_architecture_get_gbm_path:
 * @self: An architecture
 *
 * Return the directory containing Mesa GBM backends
 * for this architecture, or %NULL if unknown.
 *
 * The returned path should be looked up inside the sysroot returned by
 * _srt_graphics_provider_get_root(), not the real root.
 *
 * The returned string is only valid as long as a reference to
 * the #SrtGraphicsProvider is held.
 *
 * Returns: (nullable) (type filename): A path such as `/usr/lib64/gbm`,
 *  or %NULL if unknown
 */
const char *
_srt_graphics_provider_architecture_get_gbm_path (const SrtGraphicsProviderArchitecture *self)
{
  return self->gbm_path;
}

/*
 * _srt_graphics_provider_architecture_get_fallback_library_paths:
 * @self: An architecture
 *
 * Return the list of last-resort directories that glibc will search if
 * a library is not found in `/etc/ld.so.cache`, or %NULL if unknown.
 *
 * The returned paths should be looked up inside the sysroot returned by
 * _srt_graphics_provider_get_root(), not the real root.
 *
 * The returned array and strings are only valid as long as a reference to
 * the #SrtGraphicsProvider is held.
 *
 * Returns: (nullable) (array zero-terminated=1) (element-type filename): Paths
 *  such as `{ "/lib", "/usr/lib", NULL }`, or %NULL if unknown
 */
const char * const *
_srt_graphics_provider_architecture_get_fallback_library_paths (const SrtGraphicsProviderArchitecture *self)
{
  return _srt_const_strv (self->fallback_library_paths);
}

/*
 * _srt_graphics_provider_architecture_get_gconv_path:
 * @self: An architecture
 *
 * Return the directory containing glibc character-set conversion modules
 * for this architecture, or %NULL if unknown.
 *
 * The returned path should be looked up inside the sysroot returned by
 * _srt_graphics_provider_get_root(), not the real root.
 *
 * The returned string is only valid as long as a reference to
 * the #SrtGraphicsProvider is held.
 *
 * Returns: (nullable) (type filename): A path such as `/usr/lib64/gconv`,
 *  or %NULL if unknown
 */
const char *
_srt_graphics_provider_architecture_get_gconv_path (const SrtGraphicsProviderArchitecture *self)
{
  return self->gconv_path;
}

struct _SrtGraphicsProviderClass
{
  GObjectClass parent_class;
};

enum {
  PROP_0,
  PROP_ARCHITECTURES,
  PROP_FEATURES,
  PROP_MANIFEST,
  PROP_ROOT,
  N_PROPERTIES
};

static GParamSpec *properties[N_PROPERTIES] = { NULL };

G_DEFINE_TYPE (SrtGraphicsProvider, _srt_graphics_provider, G_TYPE_OBJECT)

static void
_srt_graphics_provider_init (SrtGraphicsProvider *self)
{
  self->archs =
    _srt_graphics_provider_architecture_array_new (NULL, 0,
                                                   SRT_GRAPHICS_PROVIDER_FEATURE_FLAGS_NONE);
}

static void
_srt_graphics_provider_get_property (GObject *object,
                                     guint prop_id,
                                     GValue *value,
                                     GParamSpec *pspec)
{
  SrtGraphicsProvider *self = SRT_GRAPHICS_PROVIDER (object);
  GArray *arr;

  switch (prop_id)
    {
      case PROP_ARCHITECTURES:
        /* Copy them to avoid concurrent modification harming thread-safety */
        arr = _srt_graphics_provider_architecture_array_new (NULL, 0,
                                                             SRT_GRAPHICS_PROVIDER_FEATURE_FLAGS_NONE);
        archs_array_extend (arr, self->archs);
        g_value_take_boxed (value, g_steal_pointer (&arr));
        break;

      case PROP_FEATURES:
        g_value_set_flags (value, self->features);
        break;

      case PROP_MANIFEST:
        g_value_set_string (value, self->manifest);
        break;

      case PROP_ROOT:
        g_value_set_object (value, self->root);
        break;

      default:
        G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
    }
}

static void
_srt_graphics_provider_set_property (GObject *object,
                                     guint prop_id,
                                     const GValue *value,
                                     GParamSpec *pspec)
{
  SrtGraphicsProvider *self = SRT_GRAPHICS_PROVIDER (object);
  GArray *arr;

  switch (prop_id)
    {
      case PROP_ARCHITECTURES:
        /* Construct-only */
        g_return_if_fail (self->archs->len == 0);
        arr = g_value_get_boxed (value);

        /* Copy them to avoid concurrent modification harming thread-safety */
        if (arr != NULL)
          archs_array_extend (self->archs, arr);

        break;

      case PROP_FEATURES:
        self->features = g_value_get_flags (value);
        break;

      case PROP_MANIFEST:
        /* Construct-only */
        g_return_if_fail (self->manifest == NULL);
        self->manifest = g_value_dup_string (value);
        break;

      case PROP_ROOT:
        /* Construct-only */
        g_return_if_fail (self->root == NULL);
        self->root = g_value_dup_object (value);
        break;

      default:
        G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
    }
}

static void
_srt_graphics_provider_constructed (GObject *object)
{
  SrtGraphicsProvider *self = SRT_GRAPHICS_PROVIDER (object);

  G_OBJECT_CLASS (_srt_graphics_provider_parent_class)->constructed (object);

  g_return_if_fail (self->archs->len != 0);

  self->tuple_quarks = g_new0 (GQuark, self->archs->len + 1);

  for (size_t i = 0; i < self->archs->len; i++)
    {
      const SrtGraphicsProviderArchitecture *arch =
        &g_array_index (self->archs, const SrtGraphicsProviderArchitecture, i);

      self->tuple_quarks[i] = arch->tuple_quark;
    }
}

static void
_srt_graphics_provider_dispose (GObject *object)
{
  SrtGraphicsProvider *self = SRT_GRAPHICS_PROVIDER (object);

  g_clear_object (&self->root);
  g_array_set_size (self->archs, 0);
  self->tuple_quarks[0] = SRT_ARCHITECTURE_QUARK_NONE;

  G_OBJECT_CLASS (_srt_graphics_provider_parent_class)->dispose (object);
}

static void
_srt_graphics_provider_finalize (GObject *object)
{
  SrtGraphicsProvider *self = SRT_GRAPHICS_PROVIDER (object);

  g_free (self->manifest);
  g_free (self->tuple_quarks);
  g_clear_pointer (&self->archs, g_array_unref);

  G_OBJECT_CLASS (_srt_graphics_provider_parent_class)->finalize (object);
}

static void
_srt_graphics_provider_class_init (SrtGraphicsProviderClass *cls)
{
  GObjectClass *object_class = G_OBJECT_CLASS (cls);

  object_class->get_property = _srt_graphics_provider_get_property;
  object_class->set_property = _srt_graphics_provider_set_property;
  object_class->constructed = _srt_graphics_provider_constructed;
  object_class->dispose = _srt_graphics_provider_dispose;
  object_class->finalize = _srt_graphics_provider_finalize;

  properties[PROP_ARCHITECTURES] =
    g_param_spec_boxed ("architectures", NULL, NULL,
                        G_TYPE_ARRAY,
                        (G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                         G_PARAM_STATIC_STRINGS));

  properties[PROP_FEATURES] =
    g_param_spec_flags ("features", NULL, NULL,
                        SRT_TYPE_GRAPHICS_PROVIDER_FEATURE_FLAGS,
                        SRT_GRAPHICS_PROVIDER_FEATURE_FLAGS_DEFAULT,
                        (G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                         G_PARAM_STATIC_STRINGS));

  properties[PROP_MANIFEST] =
    g_param_spec_string ("manifest", NULL, NULL, NULL,
                        (G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                         G_PARAM_STATIC_STRINGS));

  properties[PROP_ROOT] =
    g_param_spec_object ("root", NULL, NULL,
                         SRT_TYPE_SYSROOT,
                         (G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                          G_PARAM_STATIC_STRINGS));

  g_object_class_install_properties (object_class, N_PROPERTIES, properties);
}

/*
 * _srt_graphics_provider_describe:
 * @self: A graphics provider
 *
 * Return a string identifying this graphics stack,
 * suitable for use in diagnostic messages.
 *
 * The returned string is only valid for as long as a reference to
 * the #SrtGraphicsProvider is held.
 * It is never %NULL unless a programming error has occurred.
 *
 * Returns: (type filename):
 */
const char *
_srt_graphics_provider_describe (SrtGraphicsProvider *self)
{
  g_return_val_if_fail (SRT_IS_GRAPHICS_PROVIDER (self), NULL);
  return self->manifest ?: self->root->path;
}

/*
 * _srt_graphics_provider_get_manifest_path:
 * @self: A graphics provider
 *
 * Return the path to the JSON manifest describing @self,
 * or %NULL if no such JSON manifest is known.
 *
 * The returned path is only valid for as long as a reference to
 * the #SrtGraphicsProvider is held.
 *
 * Returns: (type filename) (nullable):
 */
const char *
_srt_graphics_provider_get_manifest_path (SrtGraphicsProvider *self)
{
  g_return_val_if_fail (SRT_IS_GRAPHICS_PROVIDER (self), NULL);
  return self->manifest;
}

/*
 * _srt_graphics_provider_get_root_path:
 * @self: A graphics provider
 *
 * Return the path to the sysroot-like directory implementing @self.
 *
 * The returned path is only valid for as long as a reference to
 * the #SrtGraphicsProvider is held.
 * It is never %NULL unless a programming error has occurred.
 *
 * Returns: (type filename):
 */
const char *
_srt_graphics_provider_get_root_path (SrtGraphicsProvider *self)
{
  g_return_val_if_fail (SRT_IS_GRAPHICS_PROVIDER (self), NULL);
  return self->root->path;
}

/*
 * _srt_graphics_provider_get_root_path:
 * @self: A graphics provider
 *
 * Return the sysroot-like directory implementing @self.
 *
 * Returns: (transfer none):
 */
SrtSysroot *
_srt_graphics_provider_get_root (SrtGraphicsProvider *self)
{
  g_return_val_if_fail (SRT_IS_GRAPHICS_PROVIDER (self), NULL);
  return self->root;
}

/*
 * _srt_graphics_provider_get_features:
 * @self: A graphics provider
 *
 * Return features expected to be present in this graphics provider.
 *
 * _srt_graphics_provider_architecture_get_features() is a more specific
 * version of this information.
 */
SrtGraphicsProviderFeatureFlags
_srt_graphics_provider_get_features (SrtGraphicsProvider *self)
{
  g_return_val_if_fail (SRT_IS_GRAPHICS_PROVIDER (self),
                        SRT_GRAPHICS_PROVIDER_FEATURE_FLAGS_NONE);
  return self->features;
}

/*
 * _srt_graphics_provider_get_architectures:
 * @self: A graphics provider
 * @n_out: (out) (optional): Return the number of nonzero items in the result
 *
 * Return the architectures potentially supported by this graphics provider.
 *
 * The returned array is only valid for as long as a reference to
 * the #SrtGraphicsProvider is held.
 *
 * Returns: (array zero-terminated=1) (transfer none): Interned strings
 *  representing multiarch tuples
 */
const GQuark *
_srt_graphics_provider_get_architectures (SrtGraphicsProvider *self,
                                          size_t *n_out)
{
  g_return_val_if_fail (SRT_IS_GRAPHICS_PROVIDER (self), NULL);

  if (n_out != NULL)
    *n_out = self->archs->len;

  return self->tuple_quarks;
}

/*
 * _srt_graphics_provider_get_nth_architecture:
 * @self: A graphics provider
 * @n: Which architecture to inspect
 *
 * Return more details of one of the architectures potentially supported
 * by this graphics provider, in an arbitrary order.
 *
 * The returned struct is only valid for as long as a reference to
 * the #SrtGraphicsProvider is held.
 *
 * Returns: (transfer none): Details of the @n'th architecture
 */
const SrtGraphicsProviderArchitecture *
_srt_graphics_provider_get_nth_architecture (SrtGraphicsProvider *self,
                                             size_t n)
{
  g_return_val_if_fail (SRT_IS_GRAPHICS_PROVIDER (self), NULL);
  g_return_val_if_fail (n < self->archs->len, NULL);
  return &g_array_index (self->archs, const SrtGraphicsProviderArchitecture, n);
}

/*
 * _srt_graphics_provider_get_nth_architecture:
 * @self: A graphics provider
 * @tuple_quark: Which architecture to inspect
 *
 * Return more details of one of the architectures potentially supported
 * by this graphics provider, specified by its multiarch tuple as an
 * interned string.
 *
 * The returned struct is only valid for as long as a reference to
 * the #SrtGraphicsProvider is held.
 *
 * Returns: (nullable) (transfer none): Details of the architecture
 *  matching @tuple_quark, or %NULL if not supported
 */
const SrtGraphicsProviderArchitecture *
_srt_graphics_provider_get_architecture (SrtGraphicsProvider *self,
                                         GQuark tuple_quark)
{
  g_return_val_if_fail (SRT_IS_GRAPHICS_PROVIDER (self), NULL);

  for (size_t i = 0; i < self->archs->len; i++)
    {
      const SrtGraphicsProviderArchitecture *arch =
        &g_array_index (self->archs, const SrtGraphicsProviderArchitecture, i);

      if (tuple_quark == arch->tuple_quark)
        return arch;
    }

  return NULL;
}

/*
 * _srt_graphics_provider_new_for_directory:
 * @root: A sysroot-like directory
 * @tuple_quarks: (nullable) (array len=n_tuple_quarks): Architectures
 *  that are potentially supported by @root
 * @n_tuple_quarks: Number of architectures
 *
 * Construct a graphics provider object representing @root and assumed
 * to support the given architectures.
 * It is non-%NULL unless a programming error has occurred.
 *
 * Returns: (transfer full): A graphics provider
 */
SrtGraphicsProvider *
_srt_graphics_provider_new_for_directory (SrtSysroot *root,
                                          const GQuark *tuple_quarks,
                                          size_t n_tuple_quarks)
{
  g_autoptr(GArray) archs = NULL;
  SrtGraphicsProviderFeatureFlags features = SRT_GRAPHICS_PROVIDER_FEATURE_FLAGS_DEFAULT;

  archs = _srt_graphics_provider_architecture_array_new (tuple_quarks,
                                                         n_tuple_quarks,
                                                         features);
  return _srt_graphics_provider_new (archs, features, NULL, root);
}
