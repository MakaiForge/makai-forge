/*
 * Copyright © 2019-2025 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

/*
 * Helper executable that just execs its arguments, searching the PATH.
 *
 * This might seem useless at first glance, but for example this is useful
 * if we need to run an executable that might be from the PATH, while
 * wrapped by an emulator that does not search the PATH, and this needs
 * to be done in an executable of the same architecture as the target.
 *
 * It is designed to make other options possible, but none are currently
 * implemented, other than --help and --version.
 */

#include <errno.h>
#include <getopt.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

/* Chosen to be similar to env(1) */
enum
{
  LAUNCH_EX_USAGE = 125,
  LAUNCH_EX_FAILED = 125,
  LAUNCH_EX_CANNOT_INVOKE = 126,
  LAUNCH_EX_NOT_FOUND = 127,
  LAUNCH_EX_CANNOT_REPORT = 255
};

enum
{
  OPTION_HELP = 1,
  OPTION_VERSION,
};

struct option long_options[] =
{
    { "help", no_argument, NULL, OPTION_HELP },
    { "version", no_argument, NULL, OPTION_VERSION },
    { NULL, 0, NULL, 0 }
};

static void usage (int code) __attribute__((__noreturn__));

/*
 * Print usage information and exit with status @code.
 */
static void
usage (int code)
{
  FILE *fp;

  if (code == 0)
    fp = stdout;
  else
    fp = stderr;

  fprintf (fp, "Usage: %s [OPTIONS] -- PROGRAM [ARG...]\n",
           program_invocation_short_name);
  exit (code);
}

int
main (int argc,
      char **argv)
{
  int opt;

  while ((opt = getopt_long (argc, argv, "", long_options, NULL)) != -1)
    {
      switch (opt)
        {
          case OPTION_HELP:
            usage (0);
            break;

          case OPTION_VERSION:
            /* Output version number as YAML for machine-readability,
             * inspired by `ostree --version` and `docker version` */
            printf (
                "%s:\n"
                " Package: steam-runtime-tools\n"
                " Version: %s\n",
                program_invocation_short_name, VERSION);
            return 0;

          case '?':
          default:
            usage (LAUNCH_EX_USAGE);
            break;  /* not reached */
        }
    }

  if (argc < optind + 1)
    usage (1);

  execvp (argv[optind], &argv[optind]);

  if (errno == ENOENT)
    return LAUNCH_EX_NOT_FOUND;

  return LAUNCH_EX_CANNOT_INVOKE;
}
