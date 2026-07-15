/*
 * Copyright 2025 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#include <steam-runtime-tools/steam-runtime-tools.h>

#include "steam-runtime-tools/architecture-internal.h"
#include "steam-runtime-tools/glib-backports-internal.h"
#include "steam-runtime-tools/subprocess-internal.h"

int
main (int argc,
      char **argv)
{
  g_autoptr (GError) error = NULL;
  g_autoptr (SrtSubprocessRunner) runner = _srt_subprocess_runner_new ();
  g_autoptr (SrtCompletedSubprocess) completed = NULL;
  const char * const shell_argv[] =
  {
    "/bin/sh",
    "-euc",
    ("sleeper_pid=0\n"
     "terminated () {\n"
     "  echo 'child shell: Received SIGTERM' >&2\n"
     "  kill \"$sleeper_pid\"\n"
     "  exit 255\n"
     "}\n"
     "trap terminated TERM\n"
     "sleep 3600 &\n"
     "sleeper_pid=$!\n"
     "echo \"child shell: Now run: kill -TERM $PPID\" >&2\n"
     "echo \"and make sure that processes $$ and $sleeper_pid terminate\" >&2\n"
     "wait"),
  };

  completed = _srt_subprocess_runner_run_sync (runner,
                                               SRT_HELPER_FLAGS_TERMINATE_WITH_PARENT,
                                               SRT_ARCHITECTURE_QUARK_NONE,
                                               shell_argv,
                                               SRT_SUBPROCESS_OUTPUT_INHERIT,
                                               SRT_SUBPROCESS_OUTPUT_INHERIT,
                                               &error);
  g_assert_no_error (error);
  return 0;
}
