/*
 * Copyright © 2019-2025 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#include "steam-runtime-tools/architecture.h"
#include "steam-runtime-tools/architecture-checks-internal.h"

#include "steam-runtime-tools/architecture-internal.h"
#include "steam-runtime-tools/utils-internal.h"

gboolean
_srt_architecture_can_run (SrtSubprocessRunner *runner,
                           GQuark arch_quark,
                           const SrtKnownArchitecture *known_arch)
{
  g_autoptr(SrtCompletedSubprocess) completed = NULL;
  g_autoptr(GPtrArray) argv = NULL;
  g_autoptr(GError) error = NULL;
  /* x-y-z-true is self-contained, so we can run it with the sysroot's
   * ld.so and library search paths to have a good guess at whether we
   * would be able to run a simple executable in the sysroot */
  SrtHelperFlags helper_flags = SRT_HELPER_FLAGS_WORKS_IN_SYSROOT;
  const char *multiarch;

  g_return_val_if_fail (SRT_IS_SUBPROCESS_RUNNER (runner), FALSE);
  g_return_val_if_fail (arch_quark != SRT_ARCHITECTURE_QUARK_NONE, FALSE);
  g_return_val_if_fail (_srt_check_not_setuid (), FALSE);

  multiarch = g_quark_to_string (arch_quark);
  argv = _srt_subprocess_runner_get_helper (runner,
                                            multiarch,
                                            known_arch,
                                            "true",
                                            helper_flags,
                                            &error);

  if (argv == NULL)
    {
      g_debug ("%s", error->message);
      return FALSE;
    }

  g_ptr_array_add (argv, NULL);

  completed = _srt_subprocess_runner_run_sync (runner,
                                               helper_flags,
                                               arch_quark,
                                               (const char * const *) argv->pdata,
                                               SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
                                               SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
                                               &error);

  if (completed == NULL || !_srt_completed_subprocess_check (completed, &error))
    {
      g_debug ("... %s", error->message);
      return FALSE;
    }

  g_debug ("... it works");
  return TRUE;
}

/**
 * srt_architecture_can_run_i386:
 *
 * Check whether we can run an i386 (%SRT_ABI_I386) executable.
 *
 * For this check to work as intended, the contents of the
 * `libsteam-runtime-tools-0-helpers:i386` package must be available
 * in the same directory hierarchy as the `libsteam-runtime-tools-0`
 * shared library, something like this:
 *
 * |[
 * any directory/
 *      lib/
 *          x86_64-linux-gnu/
 *              libsteam-runtime-tools-0.so.0
 *      libexec/
 *          steam-runtime-tools-0/
 *              i386-linux-gnu-*
 *              x86_64-linux-gnu-*
 * ]|
 *
 * Returns: %TRUE if we can run an i386 executable.
 */
gboolean
srt_architecture_can_run_i386 (void)
{
  g_autoptr(SrtSubprocessRunner) runner = _srt_subprocess_runner_new ();

  return _srt_architecture_can_run (runner,
                                    g_quark_from_static_string (SRT_ABI_I386),
                                    _srt_architecture_get_by_tuple (SRT_ABI_I386));
}

/**
 * srt_architecture_can_run_x86_64:
 *
 * Check whether we can run an x86_64 (%SRT_ABI_X86_64) executable.
 *
 * For this check to work as intended, the contents of the
 * `libsteam-runtime-tools-0-helpers:amd64` package must be available
 * in the same directory hierarchy as the `libsteam-runtime-tools-0`
 * shared library. See srt_architecture_can_run_i386() for details.
 *
 * Returns: %TRUE if we can run an x86_64 executable.
 */
gboolean
srt_architecture_can_run_x86_64 (void)
{
  g_autoptr(SrtSubprocessRunner) runner = _srt_subprocess_runner_new ();

  return _srt_architecture_can_run (runner,
                                    g_quark_from_static_string (SRT_ABI_X86_64),
                                    _srt_architecture_get_by_tuple (SRT_ABI_X86_64));
}
