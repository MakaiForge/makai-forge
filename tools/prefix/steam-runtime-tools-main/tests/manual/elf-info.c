/*
 * Copyright 2025 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#include <steam-runtime-tools/steam-runtime-tools.h>

#include "steam-runtime-tools/glib-backports-internal.h"

#include "steam-runtime-tools/elf-utils-internal.h"

static gboolean
inspect (const char *path,
         GError **error)
{
  g_autoptr(Elf) elf = NULL;
  glnx_autofd int fd = -1;
  g_autofree gchar *pt_interp = NULL;

  g_printerr ("%s:\n", path);

  if (!_srt_open_elf (AT_FDCWD, path, &fd, &elf, error))
    return FALSE;

  pt_interp = _srt_elf_get_pt_interp (elf, fd, error);

  if (pt_interp == NULL)
    return FALSE;

  g_printerr ("\tELF interpreter: %s\n", pt_interp);

  return TRUE;
}

static const GOptionEntry option_entries[] = { { NULL } };

static gboolean
run (int argc,
     char **argv,
     GError **error)
{
  g_autoptr(GOptionContext) option_context = NULL;

  option_context = g_option_context_new ("COMMAND [ARGUMENTS...]");
  g_option_context_add_main_entries (option_context, option_entries, NULL);

  if (!g_option_context_parse (option_context, &argc, &argv, error))
    return FALSE;

  for (int i = 1; i < argc; i++)
    {
      if (!inspect (argv[i], error))
        return FALSE;
    }

  return TRUE;
}

int
main (int argc,
      char **argv)
{
  g_autoptr(GError) error = NULL;

  if (!run (argc, argv, &error))
    {
      if (error == NULL)
        g_set_error (&error, G_IO_ERROR, G_IO_ERROR_FAILED, "Assertion failure");

      g_printerr ("%s\n", error->message);
      return 1;
    }

  return 0;
}
