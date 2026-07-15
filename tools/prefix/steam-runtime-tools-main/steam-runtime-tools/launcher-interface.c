/*
 * steam-runtime-launcher-interface-0 — convenience interface for compat tools
 *
 * Copyright © 2022-2025 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

/* NO GLIB DEPENDENCIES HERE PLEASE
 * This translation unit is used in s-r-launcher-interface-0(1) which is
 * intentionally minimal, to minimize its impact on Proton startup time. */

#include "steam-runtime-tools/launcher-interface-internal.h"

#include "steam-runtime-tools/libc-utils-internal.h"

/*
 * _srt_launcher_interface_get_options:
 * @argc_out: (optional) (out): Number of non-%NULL options returned
 *
 * Return an array of options to be passed to
 * steam-runtime-launcher-service(1) when implementing the
 * steam-runtime-launcher-interface-0(1) interface,
 * followed by a %NULL which is not included in the count assigned
 * to `*argc_out`.
 *
 * The final `argv` should be (pseudocode)
 *
 * ```
 * ["/path/to/s-r-launcher-service"]
 * + _srt_launcher_interface_get_options()
 * + ["--"]
 * + [COMMAND, ARGUMENTS...]
 * ```
 *
 * Returns: (transfer none) (array zero-terminated=1 length=argc_out): Zero
 *  or more constant options
 */
const char * const *
_srt_launcher_interface_get_options (size_t *argc_out)
{
  static const char * const launcher_interface_options[] =
    {
      "--exec-fallback",
      "--hint",
      "--inside-app",
      "--no-stop-on-name-loss",
      "--replace",
      "--session",
      NULL
    };

  if (argc_out != NULL)
    *argc_out = N_ELEMENTS (launcher_interface_options) - 1;

  return launcher_interface_options;
}
