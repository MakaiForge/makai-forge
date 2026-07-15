/*
 * Copyright © 2020-2025 Collabora Ltd.
 *
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

#pragma once

#include <glib.h>

/**
 * PvRuntimeFlags:
 * @PV_RUNTIME_FLAGS_SINGLE_THREAD: Run in a single thread, for easier
 *  debugging
 * @PV_RUNTIME_FLAGS_GENERATE_LOCALES: Generate missing locales
 * @PV_RUNTIME_FLAGS_GC_RUNTIMES: Garbage-collect old temporary runtimes
 * @PV_RUNTIME_FLAGS_VERBOSE: Be more verbose
 * @PV_RUNTIME_FLAGS_IMPORT_VULKAN_LAYERS: Include host Vulkan layers
 * @PV_RUNTIME_FLAGS_COPY_RUNTIME: Copy the runtime and modify the copy
 * @PV_RUNTIME_FLAGS_FLATPAK_SUBSANDBOX: The runtime will be used in a
 *  Flatpak subsandbox
 * @PV_RUNTIME_FLAGS_INTERPRETER_ROOT: The runtime is being set up as a
 *  root filesystem overlay for an interpreter like FEX-Emu
 * @PV_RUNTIME_FLAGS_DETERMINISTIC: Try harder to achieve deterministic
 *  order, even where it shouldn't matter functionally
 * @PV_RUNTIME_FLAGS_IMPORT_CA_CERTS: Try to import CA certificates from
 *  the host system, which is assumed to be Debian-compatible
 * @PV_RUNTIME_FLAGS_IMPORT_OPENXR_1_RUNTIMES: Include host OpenXR 1 runtimes
 * @PV_RUNTIME_FLAGS_IMPORT_OPENXR_1_LAYERS: Include host OpenXR 1 layers
 * @PV_RUNTIME_FLAGS_NONE: None of the above
 *
 * Flags affecting how we set up the runtime.
 */
typedef enum
{
  PV_RUNTIME_FLAGS_SINGLE_THREAD = (1 << 0),
  PV_RUNTIME_FLAGS_GENERATE_LOCALES = (1 << 1),
  PV_RUNTIME_FLAGS_GC_RUNTIMES = (1 << 2),
  PV_RUNTIME_FLAGS_VERBOSE = (1 << 3),
  PV_RUNTIME_FLAGS_IMPORT_VULKAN_LAYERS = (1 << 4),
  PV_RUNTIME_FLAGS_COPY_RUNTIME = (1 << 5),
  PV_RUNTIME_FLAGS_UNPACK_ARCHIVE = (1 << 6),
  PV_RUNTIME_FLAGS_FLATPAK_SUBSANDBOX = (1 << 7),
  PV_RUNTIME_FLAGS_INTERPRETER_ROOT = (1 << 8),
  PV_RUNTIME_FLAGS_DETERMINISTIC = (1 << 9),
  PV_RUNTIME_FLAGS_IMPORT_CA_CERTS = (1 << 10),
  PV_RUNTIME_FLAGS_IMPORT_OPENXR_1_RUNTIMES = (1 << 11),
  PV_RUNTIME_FLAGS_IMPORT_OPENXR_1_LAYERS = (1 << 12),
  PV_RUNTIME_FLAGS_NONE = 0
} PvRuntimeFlags;

#define PV_RUNTIME_FLAGS_MASK \
  (PV_RUNTIME_FLAGS_SINGLE_THREAD \
   | PV_RUNTIME_FLAGS_GENERATE_LOCALES \
   | PV_RUNTIME_FLAGS_GC_RUNTIMES \
   | PV_RUNTIME_FLAGS_VERBOSE \
   | PV_RUNTIME_FLAGS_IMPORT_VULKAN_LAYERS \
   | PV_RUNTIME_FLAGS_COPY_RUNTIME \
   | PV_RUNTIME_FLAGS_UNPACK_ARCHIVE \
   | PV_RUNTIME_FLAGS_FLATPAK_SUBSANDBOX \
   | PV_RUNTIME_FLAGS_INTERPRETER_ROOT \
   | PV_RUNTIME_FLAGS_DETERMINISTIC \
   | PV_RUNTIME_FLAGS_IMPORT_CA_CERTS \
   | PV_RUNTIME_FLAGS_IMPORT_OPENXR_1_RUNTIMES \
   | PV_RUNTIME_FLAGS_IMPORT_OPENXR_1_LAYERS \
   )

/**
 * PvGraphicsProviderFlags:
 * @PV_GRAPHICS_PROVIDER_FLAGS_INTERPRETER_HOST: The graphics provider is
 *  for the host architecture that is running an interpreter such as FEX
 * @PV_GRAPHICS_PROVIDER_FLAGS_NONE: None of the above
 *
 * Flags affecting how a graphics stack provider is used.
 */
typedef enum
{
  PV_GRAPHICS_PROVIDER_FLAGS_INTERPRETER_HOST = (1 << 0),
  PV_GRAPHICS_PROVIDER_FLAGS_NONE = 0
} PvGraphicsProviderFlags;
