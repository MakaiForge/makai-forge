/*<private_header>*/
/*
 * Copyright © 2025 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#pragma once

#include "steam-runtime-tools/emulator-internal.h"

struct _SrtEmulator
{
  GObject parent;
  GStrv argv;
  GStrv container_argv;
  SrtEnvOverlay *container_environment;
  GQuark *emulated_architectures;
  SrtEnvOverlay *environment;
  GStrv main_argv;
  gchar *manifest;
  GQuark *required_architectures;
  GStrv required_libraries;
  GStrv server_argv;
  size_t n_emulated_architectures;
  size_t n_required_architectures;
};
