/*<private_header>*/
/*
 * Copyright © 2025 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#pragma once

#include <steam-runtime-tools/macros.h>
#include <steam-runtime-tools/glib-backports-internal.h>

#include "steam-runtime-tools/emulator-internal.h"

typedef struct _SrtEmulatorServer SrtEmulatorServer;
typedef struct _SrtEmulatorServerClass SrtEmulatorServerClass;

#define SRT_TYPE_EMULATOR_SERVER (_srt_emulator_server_get_type ())
#define SRT_EMULATOR_SERVER(o) (G_TYPE_CHECK_INSTANCE_CAST ((o), SRT_TYPE_EMULATOR_SERVER, SrtEmulatorServer))
#define SRT_IS_EMULATOR_SERVER(o) (G_TYPE_CHECK_INSTANCE_TYPE ((o), SRT_TYPE_EMULATOR_SERVER))
#define SRT_EMULATOR_SERVER_GET_CLASS(o) (G_TYPE_INSTANCE_GET_CLASS ((o), SRT_TYPE_EMULATOR_SERVER, SrtEmulatorServerClass))
#define SRT_EMULATOR_SERVER_CLASS(c) (G_TYPE_CHECK_CLASS_CAST ((c), SRT_TYPE_EMULATOR_SERVER, SrtEmulatorServerClass))
#define SRT_IS_EMULATOR_SERVER_CLASS(c) (G_TYPE_CHECK_CLASS_TYPE ((c), SRT_TYPE_EMULATOR_SERVER))

GType _srt_emulator_server_get_type (void);
G_DEFINE_AUTOPTR_CLEANUP_FUNC (SrtEmulatorServer, g_object_unref)

gboolean _srt_emulator_server_maybe_start (SrtEmulator *emulator,
                                           const char * const *envp,
                                           SrtEmulatorServer **server_out,
                                           GError **error);
gboolean _srt_emulator_server_wait_for_ready (SrtEmulatorServer *self,
                                              GError **error);
int _srt_emulator_server_steal_exit_fd (SrtEmulatorServer *self);
