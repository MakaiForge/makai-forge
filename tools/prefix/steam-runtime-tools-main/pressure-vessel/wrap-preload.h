/*
 * Copyright © 2017-2025 Collabora Ltd.
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

#pragma once

#include <glib.h>

#include "adverb-preload.h"
#include "wrap-context.h"

/**
 * PvAppendPreloadFlags:
 * @PV_APPEND_PRELOAD_FLAGS_FLATPAK_SUBSANDBOX: The game will be run in
 *  a Flatpak subsandbox
 * @PV_APPEND_PRELOAD_FLAGS_IN_UNIT_TESTS: Normalize $LIB and $PLATFORM,
 *  for unit testing
 * @PV_APPEND_PRELOAD_FLAGS_NONE: None of the above
 *
 * Flags affecting the behaviour of pv_wrap_append_preload().
 */
typedef enum
{
  PV_APPEND_PRELOAD_FLAGS_FLATPAK_SUBSANDBOX = (1 << 0),
  PV_APPEND_PRELOAD_FLAGS_IN_UNIT_TESTS = (1 << 2),
  PV_APPEND_PRELOAD_FLAGS_NONE = 0
} PvAppendPreloadFlags;

void pv_wrap_append_preloads (PvWrapContext *context,
                              GPtrArray *argv,
                              WrapPreloadModule *inputs,
                              gsize n_inputs,
                              PvAppendPreloadFlags flags);
