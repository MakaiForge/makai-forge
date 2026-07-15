/*<private_header>*/
/*
 * Copyright © 2025 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#pragma once

#include <steam-runtime-tools/macros.h>
#include <steam-runtime-tools/glib-backports-internal.h>

#include "steam-runtime-tools/env-overlay-internal.h"
#include "steam-runtime-tools/system-info.h"

typedef struct _SrtEmulator SrtEmulator;
typedef struct _SrtEmulatorClass SrtEmulatorClass;

#define SRT_TYPE_EMULATOR (_srt_emulator_get_type ())
#define SRT_EMULATOR(o) (G_TYPE_CHECK_INSTANCE_CAST ((o), SRT_TYPE_EMULATOR, SrtEmulator))
#define SRT_IS_EMULATOR(o) (G_TYPE_CHECK_INSTANCE_TYPE ((o), SRT_TYPE_EMULATOR))
#define SRT_EMULATOR_GET_CLASS(o) (G_TYPE_INSTANCE_GET_CLASS ((o), SRT_TYPE_EMULATOR, SrtEmulatorClass))
#define SRT_EMULATOR_CLASS(c) (G_TYPE_CHECK_CLASS_CAST ((c), SRT_TYPE_EMULATOR, SrtEmulatorClass))
#define SRT_IS_EMULATOR_CLASS(c) (G_TYPE_CHECK_CLASS_TYPE ((c), SRT_TYPE_EMULATOR))

GType _srt_emulator_get_type (void);
G_DEFINE_AUTOPTR_CLEANUP_FUNC (SrtEmulator, g_object_unref)

const char * const *_srt_emulator_get_argv (SrtEmulator *self);
const char * const *_srt_emulator_get_container_argv (SrtEmulator *self);
const char * const *_srt_emulator_get_main_argv (SrtEmulator *self);
const char * const *_srt_emulator_get_server_argv (SrtEmulator *self);
const GQuark *_srt_emulator_get_emulated_architectures (SrtEmulator *self,
                                                        size_t *n_out);
const char * const *_srt_emulator_get_required_libraries (SrtEmulator *self);
const char *_srt_emulator_get_manifest (SrtEmulator *self);
const GQuark *_srt_emulator_get_required_architectures (SrtEmulator *self,
                                                        size_t *n_out);
const SrtEnvOverlay *_srt_emulator_get_environment (SrtEmulator *self);
const SrtEnvOverlay *_srt_emulator_get_container_environment (SrtEmulator *self);

static inline SrtEmulator *
_srt_emulator_new (const char * const *argv,
                   const char * const *container_argv,
                   const SrtEnvOverlay *container_environment,
                   GArray *emulated_architectures,
                   const SrtEnvOverlay *environment,
                   const char * const *main_argv,
                   const char *manifest,
                   GArray *required_architectures,
                   const char * const *required_libraries,
                   const char * const *server_argv)
{
  g_return_val_if_fail (argv != NULL, NULL);
  g_return_val_if_fail (argv[0] != NULL, NULL);
  g_return_val_if_fail (container_argv == NULL || container_argv[0] != NULL,
                        NULL);
  g_return_val_if_fail (emulated_architectures != NULL, NULL);
  g_return_val_if_fail (emulated_architectures->len != 0, NULL);
  g_return_val_if_fail (main_argv == NULL || main_argv[0] != NULL, NULL);
  /* manifest may be NULL */
  /* required_architectures may be NULL */
  /* required_libraries may be NULL */
  g_return_val_if_fail (server_argv == NULL || server_argv[0] != NULL, NULL);

  return g_object_new (SRT_TYPE_EMULATOR,
                       "argv", argv,
                       "container-argv", container_argv,
                       "container-environment", container_environment,
                       "emulated-architectures", emulated_architectures,
                       "environment", environment,
                       "main-argv", main_argv,
                       "manifest", manifest,
                       "required-architectures", required_architectures,
                       "required-libraries", required_libraries,
                       "server-argv", server_argv,
                       NULL);
}

SrtEmulator *_srt_emulator_new_from_manifest (const char *path,
                                              GError **error);
SrtEmulator *_srt_emulator_new_for_container (SrtEmulator *self,
                                              const char *replacement_argv0,
                                              const char *replacement_main_argv0);
gchar *_srt_emulator_serialize_manifest (SrtEmulator *self);
gboolean _srt_emulator_write_manifest (SrtEmulator *self,
                                       const char *path,
                                       GError **error);
