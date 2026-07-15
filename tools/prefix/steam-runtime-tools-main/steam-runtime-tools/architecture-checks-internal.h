/*<private_header>*/
/*
 * Copyright © 2019-2025 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#pragma once

#include <glib.h>

#include "steam-runtime-tools/subprocess-internal.h"

G_GNUC_INTERNAL gboolean _srt_architecture_can_run (SrtSubprocessRunner *runner,
                                                    GQuark arch_quark,
                                                    const SrtKnownArchitecture *known_arch);
