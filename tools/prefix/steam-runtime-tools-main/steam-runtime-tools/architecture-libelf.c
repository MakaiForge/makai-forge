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

#include "steam-runtime-tools/architecture.h"
#include "steam-runtime-tools/architecture-internal.h"

#include "steam-runtime-tools/glib-backports-internal.h"

#include "steam-runtime-tools/elf-utils-internal.h"

/*
 * @dfd: a directory file descriptor, `AT_FDCWD` or -1,
 *  or an open file descriptor for the library or executable itself
 *  if @file_path is %NULL
 * @file_path: (type filename): Filename to open, or %NULL if @dfd
 *  is an open file descriptor for the executable or library
 * @cls: (not optional) (out): ELF class, normally `ELFCLASS32` or `ELFCLASS64`
 * @data_encoding: (not optional) (out): ELF data encoding, normally
 *  `ELFDATA2LSB` or `ELFDATA2MSB`
 * @machine: (not optional) (out): ELF machine, for example `EM_X86_64` or
 *  `EM_386`
 * @error: On failure set to GIOErrorEnum, used to describe the error
 *
 * Returns: %TRUE on success
 */
static gboolean
_srt_architecture_read_elf (int dfd,
                            const char *file_path,
                            guint8 *cls,
                            guint8 *data_encoding,
                            guint16 *machine,
                            GError **error)
{
  glnx_autofd int fd = -1;
  g_autoptr(Elf) elf = NULL;
  GElf_Ehdr eh;

  g_return_val_if_fail (file_path == NULL || file_path[0] != '\0', FALSE);
  g_return_val_if_fail (file_path != NULL || dfd >= 0, FALSE);
  g_return_val_if_fail (cls != NULL, FALSE);
  g_return_val_if_fail (machine != NULL, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  if (!_srt_open_elf (dfd, file_path, &fd, &elf, error))
    return FALSE;

  if (gelf_getehdr (elf, &eh) == NULL)
    return glnx_throw (error, "Error reading \"%s\" ELF header: %s",
                       file_path, elf_errmsg (elf_errno ()));

  *cls = eh.e_ident[EI_CLASS];
  *data_encoding = eh.e_ident[EI_DATA];
  *machine = eh.e_machine;

  return TRUE;
}

/*
 * @dfd: a directory file descriptor, `AT_FDCWD` or -1,
 *  or an open file descriptor for the library or executable itself
 *  if @file_path is %NULL
 * @file_path: (type filename): Filename to open, or %NULL if @dfd
 *  is an open file descriptor for the executable or library
 * @error: On failure set to GIOErrorEnum or SrtArchitectureError, used to
 *  describe the error
 *
 * Returns: (nullable): The known architecture object, or %NULL on error
 */
const SrtKnownArchitecture *
_srt_architecture_guess_from_elf (int dfd,
                                  const char *file_path,
                                  GError **error)
{
  const SrtKnownArchitecture *known_architectures = _srt_architecture_get_known();
  guint8 cls = ELFCLASSNONE;
  guint8 data_encoding = ELFDATANONE;
  guint16 machine = EM_NONE;
  gsize i;

  g_return_val_if_fail (file_path == NULL || file_path[0] != '\0', NULL);
  g_return_val_if_fail (file_path != NULL || dfd >= 0, NULL);

  if (!_srt_architecture_read_elf (dfd, file_path, &cls, &data_encoding, &machine, error))
    return NULL;

  for (i = 0; known_architectures[i].multiarch_tuple != NULL; i++)
    {
      if (machine == known_architectures[i].machine_type
          && cls == known_architectures[i].elf_class
          && data_encoding == known_architectures[i].elf_encoding)
        return &known_architectures[i];
    }

  g_set_error (error, SRT_ARCHITECTURE_ERROR, SRT_ARCHITECTURE_ERROR_NO_INFORMATION,
               "ELF class, data encoding and machine (%u,%u,%u) are unknown",
               cls, data_encoding, machine);
  return NULL;
}
