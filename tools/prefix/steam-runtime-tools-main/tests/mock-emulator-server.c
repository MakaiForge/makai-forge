/*
 * Copyright © 2025 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#include <err.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/poll.h>
#include <sys/stat.h>
#include <unistd.h>

#define USEC_PER_SEC (1000000)
#define READY_MESSAGE "READY=1\n"

int
main (int argc,
      char **argv)
{
  const char *state_dir = getenv ("MOCK_EMULATOR_SERVER_STATE");
  char *flag = NULL;
  ssize_t written;

  if (state_dir != NULL && asprintf (&flag, "%s/server-flag", state_dir) < 0)
    err (1, "asprintf");

  warnx ("Please imagine some setup being done here");
  /* In real life we'd wait until listen() on a socket had succeeded,
   * or something, but for this example we arbitrarily wait 100ms
   * and create a directory. */
  usleep (USEC_PER_SEC / 10);

  if (flag != NULL && mkdir (flag, 0755) < 0)
    err (1, "mkdir %s", flag);

  /* We signal ready by writing a message to stdout and closing it. */
  warnx ("Signalling ready");

  written = write (STDOUT_FILENO, READY_MESSAGE, strlen (READY_MESSAGE));

  /* write() of less than PIPE_BUF bytes to a pipe is atomic */
  if (written < 0)
    err (1, "write to stdout");
  else if (strlen (READY_MESSAGE) != (size_t) written)
    errx (1, "short write to stdout, %zd/%zu bytes",
          written, strlen (READY_MESSAGE));

  if (close (STDOUT_FILENO) < 0)
    err (1, "close stdout");

  /* pressure-vessel signals that the server is no longer needed by
   * causing EOF on stdin.
   * In real life we would also poll a listening server socket,
   * but for the purposes of this example we only poll standard input.
   * We could do blocking reads, but poll() is more realistic. */
  while (1)
    {
      struct pollfd pfd = { .fd = STDIN_FILENO, .revents = POLLIN };
      int ret;

      ret = poll (&pfd, 1, -1 /* infinite timeout */);

      if (ret < 0)
        err (1, "poll");

      if (ret > 0)
        {
          char buf[4096];
          ssize_t n = read (STDIN_FILENO, &buf, sizeof (buf));

          if (n < 0)
            {
              if (errno == EINTR || errno == EAGAIN)
                continue;
              else
                err (1, "read");
            }

          if (n == 0)
            {
              warnx ("EOF reached on stdin, shutting down gracefully");
              break;
            }

          warnx ("Unexpectedly read %zd bytes from stdin", n);
          continue;
        }
    }

  warnx ("Please imagine some teardown being done here");

  if (flag != NULL && rmdir (flag) < 0)
    err (1, "rmdir %s", flag);

  free (flag);
  return 0;
}
