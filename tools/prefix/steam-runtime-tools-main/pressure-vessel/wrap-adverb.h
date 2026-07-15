/*
 * Copyright © 2017-2025 Collabora Ltd.
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

#pragma once

#include "steam-runtime-tools/glib-backports-internal.h"

#include "wrap-interactive.h"

gboolean pv_wrap_adverb_assign_stdio (FlatpakBwrap *adverb_argv,
                                      PvTerminal terminal,
                                      GArray *inherit_fds,
                                      int original_stdout,
                                      int original_stderr,
                                      int *tty_stdin,
                                      int *tty_stdout,
                                      GError **error);
