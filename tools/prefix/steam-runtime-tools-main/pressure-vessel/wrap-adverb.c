/*
 * Copyright © 2017-2025 Collabora Ltd.
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

#include "wrap-adverb.h"

/*
 * pv_wrap_adverb_assign_stdio:
 * @adverb_argv: Arguments for `pv-adverb(1)`
 * @terminal: Whether to use `/dev/tty` for the wrapped command's stdin,
 *  stdout and stderr
 * @inherit_fds: (element-type int): Array of file descriptors to allow
 *  to be inherited across `execve()`
 * @original_stdout: Original standard output fd
 * @original_stderr: Original standard error fd
 * @tty_stdin: (out) (not optional): fd reading from the terminal,
 *  to be held open by the caller until it execs pv-adverb
 * @tty_stdout: (out) (not optional): fd writing to the terminal,
 *  to be held open by the caller until it execs pv-adverb
 *
 * Append arguments to @adverb_argv so that pv-adverb will either use
 * newly-opened fds pointing to `/dev/tty` for the stdin, stdout and stderr
 * of its child process,
 * or use @original_stdout for stdout and @original_stderr as stderr
 * (leaving stdin as-is, in practice `/dev/null`).
 *
 * Returns: %TRUE on success
 */
gboolean
pv_wrap_adverb_assign_stdio (FlatpakBwrap *adverb_argv,
                             PvTerminal terminal,
                             GArray *inherit_fds,
                             int original_stdout,
                             int original_stderr,
                             int *tty_stdin,
                             int *tty_stdout,
                             GError **error)
{
  g_return_val_if_fail (adverb_argv != NULL, FALSE);
  g_return_val_if_fail (inherit_fds != NULL, FALSE);
  g_return_val_if_fail (tty_stdin != NULL, FALSE);
  g_return_val_if_fail (*tty_stdin < 0, FALSE);
  g_return_val_if_fail (tty_stdout != NULL, FALSE);
  g_return_val_if_fail (*tty_stdout < 0, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  if (terminal == PV_TERMINAL_TTY)
    {
      g_debug ("Replacing original stdin, stdout, stderr with tty");

      *tty_stdin = open ("/dev/tty", O_RDONLY);

      if (*tty_stdin < 0)
        return glnx_throw_errno_prefix (error,
                                        "Cannot open /dev/tty for reading");

      *tty_stdout = open ("/dev/tty", O_WRONLY);

      if (*tty_stdout < 0)
        return glnx_throw_errno_prefix (error, "Cannot open /dev/tty for writing");

      /* stdin for final command < /dev/tty */
      g_array_append_vals (inherit_fds, tty_stdin, 1);
      flatpak_bwrap_add_arg_printf (adverb_argv, "--assign-fd=%d=%d",
                                    STDIN_FILENO, *tty_stdin);

      /* stdout, stderr for final command > /dev/tty */
      g_array_append_vals (inherit_fds, tty_stdout, 1);
      flatpak_bwrap_add_arg_printf (adverb_argv, "--assign-fd=%d=%d",
                                    STDOUT_FILENO, *tty_stdout);
      flatpak_bwrap_add_arg_printf (adverb_argv, "--assign-fd=%d=%d",
                                    STDERR_FILENO, *tty_stdout);
    }
  else
    {
      /* Copy original stdout/stderr back to final stdout/stderr */
      g_array_append_val (inherit_fds, original_stdout);
      flatpak_bwrap_add_arg_printf (adverb_argv, "--assign-fd=%d=%d",
                                    STDOUT_FILENO, original_stdout);
      g_array_append_val (inherit_fds, original_stderr);
      flatpak_bwrap_add_arg_printf (adverb_argv, "--assign-fd=%d=%d",
                                    STDERR_FILENO, original_stderr);
    }

  return TRUE;
}
