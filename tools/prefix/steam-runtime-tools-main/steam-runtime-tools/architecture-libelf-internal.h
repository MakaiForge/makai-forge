/*<private_header>*/
/*
 * Copyright © 2019-2025 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#pragma once

#include <glib.h>

const SrtKnownArchitecture *_srt_architecture_guess_from_elf (int dfd,
                                                              const char *file_path,
                                                              GError **error);
