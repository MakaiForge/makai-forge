/*
 * Copyright 2026 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

/*
 * Helper process for testing s-r-supervisor.
 *
 * A parent process (intended to be the COMMAND for s-r-supervisor)
 * forks a child process, sets up its own SIGTERM handler,
 * writes "Parent ready\n" to the --parent-report-ready fd,
 * then reads stdin until EOF, copying it to stdout.
 * It will exit after EOF on stdin.
 *
 * Meanwhile, the child process sets up its own SIGTERM handler,
 * writes "Child ready\n" to the --child-report-ready fd,
 * then reads the --child-stdin fd until EOF, copying it
 * to the --child-stdout fd.
 *
 * Neither process closes stdout until it exits or is terminated.
 *
 * For predictable behaviour, each process should be allowed to run until
 * they both report ready via the --(role)-report-ready fd,
 * before allowing either of them to exit gracefully, or sending a signal
 * to either of them or to their supervisor.
 *
 * Each process exits with status 0 after EOF, unless it is terminated
 * by SIGTERM (in which case it writes a message to the
 * --parent-report-sigterm or --child-report-sigterm fd, as appropriate,
 * and exits with status SIGTERM unless --parent-ignore-sigterm or
 * --child-ignore-sigterm was given) or some other fatal signal
 * (in which case the default signal disposition terminates it).
 */

#include "config.h"

#include <err.h>
#include <errno.h>
#include <fcntl.h>
#include <getopt.h>
#include <signal.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static const char *me = "parent";

static void info (const char *format, ...) __attribute__((format (printf, 1, 2)));

static void
info (const char *format,
      ...)
{
  char *str = NULL;
  va_list args;
  int ret;

  fprintf (stderr, "%s[%d]: ", me, getpid ());
  va_start (args, format);
  ret = vasprintf (&str, format, args);
  va_end (args);

  if (ret < 0)
    err (EXIT_FAILURE, "vasprintf");

  fprintf (stderr, "%s\n", str);
  free (str);
}

static void
close_fd (int *fdp)
{
  int fd = *fdp;

  *fdp = -1;

  if (fd < 0)
    return;

  if (close (fd) == 0)
    return;

  if (errno == EBADF)
    err (EXIT_FAILURE, "close");
}

static void
write_all (int out_fd,
           const void *data,
           size_t available)
{
  const char *next = data;

  while (available > 0)
    {
      ssize_t write_result;
      size_t wrote;

      write_result = TEMP_FAILURE_RETRY (write (out_fd, next, available));

      if (write_result < 0)
        err (EXIT_FAILURE, "write");

      wrote = (size_t) write_result;

      if (wrote > available)
        errx (EXIT_FAILURE, "internal error: wrote too many bytes");

      next += wrote;
      available -= wrote;
    }
}

static void
stream_to_eof (int in_fd,
               int out_fd)
{
  ssize_t read_result;

  do
    {
      char buf[4096];
      size_t available;

      read_result = TEMP_FAILURE_RETRY (read (in_fd, buf, sizeof (buf)));

      if (read_result < 0)
        err (EXIT_FAILURE, "read");

      available = (size_t) read_result;

      if (available > sizeof (buf))
        errx (EXIT_FAILURE, "internal error: read too many bytes");

      if (out_fd >= 0)
        write_all (out_fd, buf, available);
    }
  while (read_result != 0);
}

static void
xdup2 (int fd,
       int to_fd)
{
  if (dup2 (fd, to_fd) != to_fd)
    err (EXIT_FAILURE, "dup2");
}

static void
write_str (int fd,
           const char *str)
{
  write_all (fd, str, strlen (str));
}

enum
{
  PIPE_END_READ = 0,
  PIPE_END_WRITE = 1
};
static bool child_ignore_sigterm = false;
static int child_report_ready = -1;
static int child_report_sigterm = -1;
static int child_stdin = -1;
static int child_stdout = -1;

static void
child_sigterm_cb (int signum)
{
  if (child_report_sigterm >= 0)
    write_str (child_report_sigterm, "Child received SIGTERM\n");

  if (!child_ignore_sigterm)
    _exit (SIGTERM);
}

static void run_child (void) __attribute__((noreturn));

static void
run_child (void)
{
  struct sigaction act = {};
  int child_stdin_was = child_stdin;
  int child_stdout_was = child_stdout;

  me = "child";

  if (child_stdin >= 0 && child_stdin != STDIN_FILENO)
    xdup2 (child_stdin, STDIN_FILENO);

  if (child_stdout >= 0 && child_stdout != STDOUT_FILENO)
    xdup2 (child_stdout, STDOUT_FILENO);

  if (child_stdin > STDERR_FILENO)
    close_fd (&child_stdin);

  if (child_stdout > STDERR_FILENO)
    close_fd (&child_stdout);

  act.sa_handler = child_sigterm_cb;

  if (sigaction (SIGTERM, &act, NULL) < 0)
    err (EXIT_FAILURE, "sigaction");

  info ("Child process %d reporting ready", getpid ());

  if (child_report_ready >= 0)
    write_str (child_report_ready, "Child ready\n");

  if (child_report_ready > STDERR_FILENO)
    close_fd (&child_report_ready);

  info ("Child process %d streaming fd %d to %d",
        getpid (), child_stdin_was, child_stdout_was);
  stream_to_eof (STDIN_FILENO, STDOUT_FILENO);
  info ("Child process %d exiting successfully", getpid ());
  _exit (0);
}

static bool parent_ignore_sigterm = false;
static int parent_report_ready = -1;
static int parent_report_sigterm = -1;

static void
parent_sigterm_cb (int signum)
{
  if (parent_report_sigterm >= 0)
    write_str (parent_report_sigterm, "Parent received SIGTERM\n");

  if (!parent_ignore_sigterm)
    _exit (SIGTERM);
}

static int
run_parent (pid_t child)
{
  struct sigaction act = {};

  info ("Child process is %d", child);

  act.sa_handler = parent_sigterm_cb;

  if (sigaction (SIGTERM, &act, NULL) < 0)
    err (EXIT_FAILURE, "sigaction");

  info ("Parent process %d reporting ready", getpid ());

  if (parent_report_ready >= 0)
    write_str (parent_report_ready, "Parent ready\n");

  if (parent_report_ready > STDERR_FILENO)
    close_fd (&parent_report_ready);

  stream_to_eof (STDIN_FILENO, STDOUT_FILENO);
  info ("Parent process %d exiting successfully", getpid ());
  return 0;
}

enum
{
  OPTION_0 = 0,
  OPTION_CHILD_IGNORE_SIGTERM,
  OPTION_CHILD_REPORT_READY,
  OPTION_CHILD_REPORT_SIGTERM,
  OPTION_CHILD_STDIN,
  OPTION_CHILD_STDOUT,
  OPTION_PARENT_IGNORE_SIGTERM,
  OPTION_PARENT_REPORT_READY,
  OPTION_PARENT_REPORT_SIGTERM,
};

struct option long_options[] =
{
    { "child-ignore-sigterm", no_argument, NULL, OPTION_CHILD_IGNORE_SIGTERM },
    { "child-report-ready", required_argument, NULL,
      OPTION_CHILD_REPORT_READY },
    { "child-report-sigterm", required_argument, NULL,
      OPTION_CHILD_REPORT_SIGTERM },
    { "child-stdin", required_argument, NULL, OPTION_CHILD_STDIN },
    { "child-stdout", required_argument, NULL, OPTION_CHILD_STDOUT },
    { "parent-ignore-sigterm", no_argument, NULL, OPTION_PARENT_IGNORE_SIGTERM },
    { "parent-report-ready", required_argument, NULL,
      OPTION_PARENT_REPORT_READY },
    { "parent-report-sigterm", required_argument, NULL,
      OPTION_PARENT_REPORT_SIGTERM },
    { NULL, 0, NULL, 0 }
};

int
main (int argc,
      char *argv[])
{
  pid_t parent = getpid ();
  pid_t child;
  int opt;

  if (parent == 0)
    err (EXIT_FAILURE, "getpid");

  info ("Parent process: %d", parent);

  /* For simplicity there is no real error handling for parsing the
   * command-line - just don't invoke it wrongly */
  while ((opt = getopt_long (argc, argv, "", long_options, NULL)) != -1)
    {
      switch (opt)
        {
          case OPTION_CHILD_IGNORE_SIGTERM:
            child_ignore_sigterm = true;
            info ("Child will not exit on SIGTERM");
            break;

          case OPTION_CHILD_REPORT_READY:
            child_report_ready = atoi (optarg);
            info ("Child will report ready on fd %d", child_report_ready);
            break;

          case OPTION_CHILD_REPORT_SIGTERM:
            child_report_sigterm = atoi (optarg);
            info ("Child will report SIGTERM on fd %d", child_report_sigterm);
            break;

          case OPTION_CHILD_STDIN:
            child_stdin = atoi (optarg);
            info ("Child will use fd %d as stdin", child_stdin);
            break;

          case OPTION_CHILD_STDOUT:
            child_stdout = atoi (optarg);
            info ("Child will use fd %d as stdout", child_stdout);
            break;

          case OPTION_PARENT_IGNORE_SIGTERM:
            parent_ignore_sigterm = true;
            info ("Parent will not exit on SIGTERM");
            break;

          case OPTION_PARENT_REPORT_READY:
            parent_report_ready = atoi (optarg);
            info ("Parent will report ready on fd %d", parent_report_ready);
            break;

          case OPTION_PARENT_REPORT_SIGTERM:
            parent_report_sigterm = atoi (optarg);
            info ("Parent will report SIGTERM on fd %d", parent_report_sigterm);
            break;

          case '?':
          default:
            errx (EXIT_FAILURE, "Can't parse command line");
            break;
        }
    }

  child = fork ();

  if (child < 0)
    err (EXIT_FAILURE, "fork");

  if (child == 0)
    {
      if (parent_report_ready > STDERR_FILENO)
        close_fd (&parent_report_ready);

      if (parent_report_sigterm > STDERR_FILENO)
        close_fd (&parent_report_sigterm);

      run_child ();
    }
  else
    {
      if (child_report_ready > STDERR_FILENO)
        close_fd (&child_report_ready);

      if (child_report_sigterm > STDERR_FILENO)
        close_fd (&child_report_sigterm);

      if (child_stdin > STDERR_FILENO)
        close_fd (&child_stdin);

      if (child_stdout > STDERR_FILENO)
        close_fd (&child_stdout);

      return run_parent (child);
    }
}
