/*<private_header>*/
/*
 * Copyright © 2019-2021 Collabora Ltd.
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

#pragma once

#include <glib.h>

/*
 * SRT_ARCHITECTURE_QUARK_NONE:
 *
 * Represents "no particular architecture", "unspecified architecture",
 * the native architecture of the machine, or similar concepts.
 *
 * This is the #GQuark with value 0, corresponding to a %NULL string.
 */
#define SRT_ARCHITECTURE_QUARK_NONE ((GQuark) 0)

typedef struct
{
  const char *multiarch_tuple;
  /* $DEB_HOST_ARCHITECTURE */
  const char *debian_architecture;
  const char *interoperable_runtime_linker;
  /* One of the values from:
   * https://registry.khronos.org/OpenXR/specs/1.1/loader.html#architecture-identifiers
   */
  const char *openxr_1_architecture;
  /* Directories relative to ${prefix} other than lib that we must search
   * for loadable modules, least-ambiguous first, most-ambiguous last,
   * not including Debian-style multiarch directories which are
   * automatically derived from @multiarch_tuple:
   * - Exherbo <GNU-tuple>/lib
   * - Red-Hat- or Arch-style lib<QUAL>
   * - etc. */
  const char * const *multilib_suffixes;
  /* If not NULL, this architecture's ldconfig(8) also supports
   * libraries from these architectures, given as multiarch tuples. */
  const char * const *extra_ld_so_architectures;
  /* Alternative paths for ld.so.cache, other than ld.so.cache itself. */
  const char * const *extra_ld_so_caches;
  /* Alternative paths for ld.so.conf, other than ld.so.conf itself. */
  const char * const *extra_ld_so_confs;
  /* Known values that ${PLATFORM} can expand to. */
  const char * const *libdl_platform_expansions;
  /* Directory used in Steam for gameoverlayrenderer.so. */
  const char *steam_gameoverlayrenderer_dir;
  /* Any other names for the architecture not covered by the above */
  const char * const *aliases;
  guint16 machine_type;
  guint8 elf_class;
  guint8 elf_encoding;
  guint8 sizeof_pointer;
} SrtKnownArchitecture;

void _srt_architecture_init_known (void);

G_GNUC_INTERNAL gboolean _srt_architecture_check_plausible_tuple (const char *tuple,
                                                                  GError **error);
G_GNUC_INTERNAL const SrtKnownArchitecture *_srt_architecture_get_known (void);
G_GNUC_INTERNAL const SrtKnownArchitecture *_srt_architecture_get_by_tuple (const char *multiarch_tuple);

const SrtKnownArchitecture *_srt_architecture_get_current (void);
const SrtKnownArchitecture *_srt_architecture_guess_from_elf (int dfd,
                                                              const char *file_path,
                                                              GError **error);
gboolean _srt_architecture_ldconfig_knows_architecture (const SrtKnownArchitecture *maybe_known,
                                                        const char *tuple);

GQuark _srt_architecture_guess_from_user_input (const char *alias,
                                                const SrtKnownArchitecture **known_out,
                                                GError **error);

/*
 * SrtLibdirsFlags:
 * @SRT_LIBDIRS_FLAGS_INCLUDE_NON_STANDARD:
 *  In addition to library paths that are expected to be searched by the
 *  runtime linker by default, also include non-default library paths that
 *  might be the target of mechanisms like Debian's update-alternatives(8).
 *  Currently this means /usr/lib/MULTIARCH/mesa, used in older Debian.
 * @SRT_LIBDIRS_FLAGS_NONE: None of the above.
 *
 * Flags affecting the behaviour of _srt_known_architecture_get_libdirs()
 */
typedef enum
{
  SRT_LIBDIRS_FLAGS_INCLUDE_NON_STANDARD = (1 << 0),
  SRT_LIBDIRS_FLAGS_NONE = 0
} SrtLibdirsFlags;

GPtrArray *_srt_known_architecture_get_libdirs (const char *tuple,
                                                const SrtKnownArchitecture *known,
                                                SrtLibdirsFlags flags);

/*
 * _srt_architecture_array_new:
 *
 * Return an empty array of GQuark (interned strings) representing
 * architectures/ABIs by their Debian-style multiarch tuple.
 *
 * The array has an additional item `g_array_index (arr, GQuark, arr->len)`
 * with value %SRT_ARCHITECTURE_QUARK_NONE (which is 0),
 * so `arr->data` can be used as a 0-terminated array of GQuark.
 *
 * Newly added items are cleared to %SRT_ARCHITECTURE_QUARK_NONE.
 *
 * Returns: An empty array to hold GQuark
 */
static inline GArray *
_srt_architecture_array_new (void)
{
  return g_array_new (TRUE,             /* add an extra 0 entry at the end */
                      TRUE,             /* zero-fill new entries */
                      sizeof (GQuark));
}

/*
 * _srt_architecture_array_peek_data:
 * @self: An array of architectures
 * @n_out: (optional) (out): Number of architectures
 *
 * Returns: (array length=n_out zero-terminated=1): Architectures in @self,
 *  do not modify
 */
static inline const GQuark *
_srt_architecture_array_peek_data (const GArray *self,
                                   size_t *n_out)
{
  if (n_out != NULL)
    *n_out = self->len;

  return (const GQuark *) self->data;
}

void _srt_architecture_array_populate_with_defaults (GArray *arch_quarks);

GArray *_srt_architecture_array_new_from_quarks (const GQuark *arch_quarks,
                                                 size_t n);
GQuark *_srt_architecture_array_copy_data (const GArray *self,
                                           size_t *n_out);
gboolean _srt_architecture_array_has (const GArray *self,
                                      GQuark arch_quark);
gboolean _srt_architecture_array_add (GArray *self,
                                      GQuark arch_quark);
