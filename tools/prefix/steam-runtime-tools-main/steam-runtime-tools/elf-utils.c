/*
 * Copyright © 2019-2025 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#include "steam-runtime-tools/elf-utils-internal.h"

#include <elf.h>

#include "steam-runtime-tools/glib-backports-internal.h"
#include "steam-runtime-tools/utils-internal.h"

/*
 * SRT_LIBRARY_ERROR:
 *
 * The error domain for library-related errors.
 */

G_DEFINE_QUARK (srt-library-error-quark, srt_library_error)

/**
 * _srt_open_elf:
 * @dfd: A directory file descriptor, `AT_FDCWD` or -1,
 *  or an open file descriptor for the library or executable itself
 *  if @file_path is %NULL
 * @file_path: (type filename): Non-empty path to a library relative to @dfd,
 *  or %NULL to use @dfd itself
 * @fd: (out) (not optional): Used to return a file descriptor of the opened library,
 *  or -1 if @file_path was the empty string
 * @elf: (out): Used to return an initialized Elf of the library
 * @error: Used to raise an error on failure
 *
 * Returns: %TRUE if the Elf has been opened correctly
 */
gboolean
_srt_open_elf (int dfd,
               const gchar *file_path,
               int *fd,
               Elf **elf,
               GError **error)
{
  glnx_autofd int file_fd = -1;
  int fd_to_open;
  g_autoptr(Elf) local_elf = NULL;

  g_return_val_if_fail (file_path == NULL || file_path[0] != '\0', FALSE);
  g_return_val_if_fail (file_path != NULL || dfd >= 0, FALSE);
  g_return_val_if_fail (fd != NULL, FALSE);
  g_return_val_if_fail (*fd < 0, FALSE);
  g_return_val_if_fail (elf != NULL, FALSE);
  g_return_val_if_fail (*elf == NULL, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  if (elf_version (EV_CURRENT) == EV_NONE)
    return glnx_throw (error, "elf_version(EV_CURRENT): %s",
                       elf_errmsg (elf_errno ()));

  if (file_path == NULL)
    {
      fd_to_open = dfd;
    }
  else
    {
      dfd = glnx_dirfd_canonicalize (dfd);

      if ((file_fd = openat (dfd, file_path, O_RDONLY | O_CLOEXEC, 0)) < 0)
        return glnx_throw_errno_prefix (error, "Error reading \"%s\"", file_path);

      fd_to_open = file_fd;
    }

  if ((local_elf = elf_begin (fd_to_open, ELF_C_READ, NULL)) == NULL)
    return glnx_throw (error, "Error reading library \"%s\": %s",
                       file_path, elf_errmsg (elf_errno ()));

  *fd = g_steal_fd (&file_fd);
  *elf = g_steal_pointer (&local_elf);

  return TRUE;
}

/*
 * _srt_elf_get_pt_interp:
 * @elf: An ELF program or library
 * @fd: A readable file descriptor opened on @elf
 *
 * Get the `PT_INTERP` section of @elf.
 *
 * Raise %SRT_LIBRARY_ERROR_NO_INTERPRETER if @elf does not have an ELF
 * intepreter, for example if it is a statically-linked executable.
 *
 * Raise an unspecified other error code, most likely from the
 * %SRT_LIBRARY_ERROR or %G_IO_ERROR domains, if something else went wrong.
 *
 * Returns: (type filename): The PT_INTERP section of @elf
 */
gchar *
_srt_elf_get_pt_interp (Elf *elf,
                        int fd,
                        GError **error)
{
  size_t phnum = 0;

  if (elf_getphdrnum (elf, &phnum) < 0)
    {
      g_set_error (error, SRT_LIBRARY_ERROR,
                   SRT_LIBRARY_ERROR_FAILED,
                   "Unable to determine number of program headers: %s",
                   elf_errmsg (elf_errno ()));
      return NULL;
    }

  for (size_t i = 0; i < phnum; i++)
    {
      GElf_Phdr phdr_mem;
      GElf_Phdr *phdr = gelf_getphdr (elf, i, &phdr_mem);

      /* The ELF interpreter is a program header of type PT_INTERP */
      if (phdr != NULL && phdr->p_type == PT_INTERP)
        {
          g_autofree gchar *buf = NULL;
          guint64 len;
          size_t n = 0;

          if (!(phdr->p_flags & PF_R))
            {
              g_set_error (error, SRT_LIBRARY_ERROR,
                           SRT_LIBRARY_ERROR_FAILED,
                           "ELF interpreter section not readable");
              return NULL;
            }

          len = phdr->p_filesz;

          /* The size needs to be plausible: the Linux kernel checks
           * for the range [2, PATH_MAX] so let's use that.
           * This avoids memcpying some ridiculously large range if the
           * size is somehow corrupt or we can't understand it. */
          if (len < 2 || len >= PATH_MAX)
            {
              g_set_error (error, SRT_LIBRARY_ERROR,
                           SRT_LIBRARY_ERROR_FAILED,
                           "ELF interpreter size %" G_GUINT64_FORMAT " out of range",
                           len);
              return NULL;
            }

          buf = g_new0 (char, len);

          if (!_srt_fd_offset_read_loop (fd, phdr->p_offset, buf, len, &n, error))
            return NULL;

          if (n != len)
            {
              g_set_error (error, SRT_LIBRARY_ERROR, SRT_LIBRARY_ERROR_FAILED,
                           "End-of-file in PT_INTERP section");
              return NULL;
            }

          /* Must start with a slash, end with \0 and contain no embedded \0 */
          if (buf[0] != '/'
              || buf[n - 1] != '\0'
              || strlen (buf) != n - 1)
            {
              g_set_error (error, SRT_LIBRARY_ERROR, SRT_LIBRARY_ERROR_FAILED,
                           "PT_INTERP section does not contain a valid path");
              return NULL;
            }

          return g_steal_pointer (&buf);
        }
    }

  g_set_error (error, SRT_LIBRARY_ERROR, SRT_LIBRARY_ERROR_NO_INTERPRETER,
               "No PT_INTERP section (not a dynamic executable?)");
  return NULL;
}
