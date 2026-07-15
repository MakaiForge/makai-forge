/*
 * Copyright © 2019-2026 Collabora Ltd.
 *
 * SPDX-License-Identifier: MIT
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

#include "steam-runtime-tools/graphics-drivers-gbm.h"

#include "steam-runtime-tools/glib-backports-internal.h"
#include "steam-runtime-tools/graphics.h"
#include "steam-runtime-tools/graphics-drivers-internal.h"
#include "steam-runtime-tools/graphics-internal.h"

/**
 * SECTION:graphics-drivers-gbm
 * @title: Mesa GBM backends enumeration
 * @short_description: Get information about GBM backends
 * @include: steam-runtime-tools/steam-runtime-tools.h
 *
 * #SrtGbmBackend is an opaque object representing the metadata describing
 * a Mesa GBM backend.
 * This is a reference-counted object: use g_object_ref() and
 * g_object_unref() to manage its lifecycle.
 */

/**
 * SrtGbmBackend:
 *
 * Opaque object representing a Mesa GBM backend.
 */

struct _SrtGbmBackend
{
  /*< private >*/
  SrtBaseGraphicsModule parent;
  gboolean is_extra;
};

struct _SrtGbmBackendClass
{
  /*< private >*/
  SrtBaseGraphicsModuleClass parent_class;
};

enum
{
  GBM_BACKEND_PROP_0,
  GBM_BACKEND_PROP_IS_EXTRA,
  N_GBM_BACKEND_PROPERTIES
};

G_DEFINE_TYPE (SrtGbmBackend, srt_gbm_backend, SRT_TYPE_BASE_GRAPHICS_MODULE)

static void
srt_gbm_backend_init (SrtGbmBackend *self)
{
}

static void
srt_gbm_backend_get_property (GObject *object,
                              guint prop_id,
                              GValue *value,
                              GParamSpec *pspec)
{
  SrtGbmBackend *self = SRT_GBM_BACKEND (object);

  switch (prop_id)
    {
      case GBM_BACKEND_PROP_IS_EXTRA:
        g_value_set_boolean (value, self->is_extra);
        break;

      default:
        G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
    }
}

static void
srt_gbm_backend_set_property (GObject *object,
                              guint prop_id,
                              const GValue *value,
                              GParamSpec *pspec)
{
  SrtGbmBackend *self = SRT_GBM_BACKEND (object);

  switch (prop_id)
    {
      case GBM_BACKEND_PROP_IS_EXTRA:
        self->is_extra = g_value_get_boolean (value);
        break;

      default:
        G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
    }
}

static GParamSpec *gbm_backend_properties[N_GBM_BACKEND_PROPERTIES] = { NULL };

static void
srt_gbm_backend_class_init (SrtGbmBackendClass *cls)
{
  GObjectClass *object_class = G_OBJECT_CLASS (cls);

  object_class->get_property = srt_gbm_backend_get_property;
  object_class->set_property = srt_gbm_backend_set_property;

  gbm_backend_properties[GBM_BACKEND_PROP_IS_EXTRA] =
    g_param_spec_boolean ("is-extra", "Is extra?",
                          "TRUE if the driver is located in an unusual path",
                          FALSE,
                          G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                          G_PARAM_STATIC_STRINGS);

  g_object_class_install_properties (object_class, N_GBM_BACKEND_PROPERTIES,
                                     gbm_backend_properties);
}

/*
 * srt_gbm_backend_new:
 * @library_path: (transfer none): the path to the library
 * @is_extra: if the GBM backend is in an unusual path
 *
 * Returns: (transfer full): a new GBM backend
 */
SrtGbmBackend *
srt_gbm_backend_new (const gchar *library_path,
                     gboolean is_extra)
{
  g_return_val_if_fail (library_path != NULL, NULL);

  return g_object_new (SRT_TYPE_GBM_BACKEND,
                       "library-path", library_path,
                       "is-extra", is_extra,
                       NULL);
}

/**
 * srt_gbm_backend_get_library_path:
 * @self: The GBM backend
 *
 * Return the library path for this GBM backend.
 *
 * Returns: (type filename) (transfer none): #SrtGbmBackend:library-path
 */
const gchar *
srt_gbm_backend_get_library_path (SrtGbmBackend *self)
{
  g_return_val_if_fail (SRT_IS_GBM_BACKEND (self), NULL);
  return SRT_BASE_GRAPHICS_MODULE (self)->library_path;
}

/**
 * srt_gbm_backend_is_extra:
 * @self: The GBM backend
 *
 * Return a gboolean that indicates if the GBM is in an unusual position.
 *
 * Returns: %TRUE if the GBM backend is in an unusual position.
 */
gboolean
srt_gbm_backend_is_extra (SrtGbmBackend *self)
{
  g_return_val_if_fail (SRT_IS_GBM_BACKEND (self), FALSE);
  return self->is_extra;
}

/**
 * srt_gbm_backend_resolve_library_path:
 * @self: The GBM backend
 *
 * Return the absolute path for this GBM backend.
 * If srt_gbm_backend_get_library_path() is already an absolute path, a copy
 * of the same value will be returned.
 *
 * Returns: (type filename) (transfer full): A copy of
 *  #SrtGbmBackend:resolved-library-path. Free with g_free().
 */
gchar *
srt_gbm_backend_resolve_library_path (SrtGbmBackend *self)
{
  g_return_val_if_fail (SRT_IS_GBM_BACKEND (self), NULL);
  return _srt_base_graphics_module_resolve_library_path (SRT_BASE_GRAPHICS_MODULE (self));
}
