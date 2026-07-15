/*<private_header>*/
/*
 * Copyright © 2019-2023 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#pragma once

#include <gelf.h>

#include <steam-runtime-tools/glib-backports-internal.h>

G_DEFINE_AUTOPTR_CLEANUP_FUNC(Elf, elf_end);

gboolean _srt_open_elf (int dfd,
                        const gchar *file_path,
                        int *fd,
                        Elf **elf,
                        GError **error);

gchar *_srt_elf_get_pt_interp (Elf *elf,
                               int fd,
                               GError **error);

/*
 * Syntactic sugar for combining _srt_open_elf() and _srt_elf_get_pt_interp()
 */
static inline gchar *
_srt_elf_path_get_pt_interp (int dfd,
                             const char *file_path,
                             GError **error)
{
  g_autoptr(Elf) elf = NULL;
  glnx_autofd int fd = -1;

  if (!_srt_open_elf (dfd, file_path, &fd, &elf, error))
    return NULL;

  return _srt_elf_get_pt_interp (elf, fd, error);
}

/* This can be moved to library.h if it turns out to be useful as API,
 * but for now it's only here */
typedef enum
{
  SRT_LIBRARY_ERROR_FAILED = 0,
  SRT_LIBRARY_ERROR_NO_INTERPRETER,
} SrtLibraryError;

#define SRT_LIBRARY_ERROR (srt_library_error_quark ())
GQuark srt_library_error_quark (void);
