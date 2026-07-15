/*<private_header>*/
/*
 * Copyright © 2023 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#pragma once

#include <steam-runtime-tools/macros.h>
#include <steam-runtime-tools/glib-backports-internal.h>

#include "steam-runtime-tools/architecture-internal.h"
#include "steam-runtime-tools/emulator-internal.h"
#include "steam-runtime-tools/emulator-server-internal.h"
#include "steam-runtime-tools/resolve-in-sysroot-internal.h"
#include "steam-runtime-tools/system-info.h"

typedef struct _SrtCompletedSubprocess SrtCompletedSubprocess;
typedef struct _SrtCompletedSubprocessClass SrtCompletedSubprocessClass;

#define SRT_TYPE_COMPLETED_SUBPROCESS (_srt_completed_subprocess_get_type ())
#define SRT_COMPLETED_SUBPROCESS(o) (G_TYPE_CHECK_INSTANCE_CAST ((o), SRT_TYPE_COMPLETED_SUBPROCESS, SrtCompletedSubprocess))
#define SRT_IS_COMPLETED_SUBPROCESS(o) (G_TYPE_CHECK_INSTANCE_TYPE ((o), SRT_TYPE_COMPLETED_SUBPROCESS))
#define SRT_COMPLETED_SUBPROCESS_GET_CLASS(o) (G_TYPE_INSTANCE_GET_CLASS ((o), SRT_TYPE_COMPLETED_SUBPROCESS, SrtCompletedSubprocessClass))
#define SRT_COMPLETED_SUBPROCESS_CLASS(c) (G_TYPE_CHECK_CLASS_CAST ((c), SRT_TYPE_COMPLETED_SUBPROCESS, SrtCompletedSubprocessClass))
#define SRT_IS_COMPLETED_SUBPROCESS_CLASS(c) (G_TYPE_CHECK_CLASS_TYPE ((c), SRT_TYPE_COMPLETED_SUBPROCESS))

GType _srt_completed_subprocess_get_type (void);
G_DEFINE_AUTOPTR_CLEANUP_FUNC (SrtCompletedSubprocess, g_object_unref)

gboolean _srt_completed_subprocess_check (SrtCompletedSubprocess *self,
                                          GError **error);
gboolean _srt_completed_subprocess_report (SrtCompletedSubprocess *self,
                                           int *wait_status_out,
                                           int *exit_status_out,
                                           int *terminating_signal_out,
                                           gboolean *timed_out_out);
gboolean _srt_completed_subprocess_timed_out (SrtCompletedSubprocess *self);
const char *_srt_completed_subprocess_get_stdout (SrtCompletedSubprocess *self);
const char *_srt_completed_subprocess_get_stderr (SrtCompletedSubprocess *self);
gchar *_srt_completed_subprocess_steal_stdout (SrtCompletedSubprocess *self);
gchar *_srt_completed_subprocess_steal_stderr (SrtCompletedSubprocess *self);

typedef struct _SrtSubprocessRunner SrtSubprocessRunner;
typedef struct _SrtSubprocessRunnerClass SrtSubprocessRunnerClass;

#define SRT_TYPE_SUBPROCESS_RUNNER (_srt_subprocess_runner_get_type ())
#define SRT_SUBPROCESS_RUNNER(o) (G_TYPE_CHECK_INSTANCE_CAST ((o), SRT_TYPE_SUBPROCESS_RUNNER, SrtSubprocessRunner))
#define SRT_IS_SUBPROCESS_RUNNER(o) (G_TYPE_CHECK_INSTANCE_TYPE ((o), SRT_TYPE_SUBPROCESS_RUNNER))
#define SRT_SUBPROCESS_RUNNER_GET_CLASS(o) (G_TYPE_INSTANCE_GET_CLASS ((o), SRT_TYPE_SUBPROCESS_RUNNER, SrtSubprocessRunnerClass))
#define SRT_SUBPROCESS_RUNNER_CLASS(c) (G_TYPE_CHECK_CLASS_CAST ((c), SRT_TYPE_SUBPROCESS_RUNNER, SrtSubprocessRunnerClass))
#define SRT_IS_SUBPROCESS_RUNNER_CLASS(c) (G_TYPE_CHECK_CLASS_TYPE ((c), SRT_TYPE_SUBPROCESS_RUNNER))

GType _srt_subprocess_runner_get_type (void);
G_DEFINE_AUTOPTR_CLEANUP_FUNC (SrtSubprocessRunner, g_object_unref)

static inline SrtSubprocessRunner *
_srt_subprocess_runner_new (void)
{
  return g_object_new (SRT_TYPE_SUBPROCESS_RUNNER,
                       NULL);
}

static inline SrtSubprocessRunner *
_srt_subprocess_runner_new_full (SrtEmulator *emulator,
                                 SrtEmulatorServer *emulator_server,
                                 const char * const *envp,
                                 const char *bin_path,
                                 const char *helpers_path,
                                 SrtSysroot *sysroot,
                                 SrtTestFlags flags,
                                 const char *working_directory)
{
  g_return_val_if_fail (emulator != NULL || emulator_server == NULL, NULL);

  return g_object_new (SRT_TYPE_SUBPROCESS_RUNNER,
                       "emulator", emulator,
                       "emulator-server", emulator_server,
                       "environ", envp,
                       "bin-path", bin_path,
                       "helpers-path", helpers_path,
                       "sysroot", sysroot,
                       "test-flags", flags,
                       "working-directory", working_directory,
                       NULL);
}

SrtSubprocessRunner *_srt_subprocess_runner_new_swap_envp (SrtSubprocessRunner *self,
                                                           const char * const *envp);
SrtSubprocessRunner *_srt_subprocess_runner_new_swap_helpers_path (SrtSubprocessRunner *self,
                                                                   const char *path);
SrtSubprocessRunner *_srt_subprocess_runner_new_swap_sysroot (SrtSubprocessRunner *self,
                                                              SrtSysroot *sysroot);
SrtSubprocessRunner *_srt_subprocess_runner_new_swap_test_flags (SrtSubprocessRunner *self,
                                                                 SrtTestFlags flags);
SrtSubprocessRunner *_srt_subprocess_runner_new_swap_working_directory (SrtSubprocessRunner *self,
                                                                        const char *working_directory);

SrtEmulator *_srt_subprocess_runner_get_emulator (SrtSubprocessRunner *self);
gboolean _srt_subprocess_runner_await_emulator (SrtSubprocessRunner *self,
                                                GQuark architecture,
                                                SrtEmulator **emulator_out,
                                                SrtEmulatorServer **emulator_server_out,
                                                GError **error);
const char * const *_srt_subprocess_runner_get_environ (SrtSubprocessRunner *self);
const char *_srt_subprocess_runner_getenv (SrtSubprocessRunner *self, const char *var);
const char *_srt_subprocess_runner_get_bin_path (SrtSubprocessRunner *self);
const char *_srt_subprocess_runner_get_helpers_path (SrtSubprocessRunner *self);
SrtSysroot *_srt_subprocess_runner_get_sysroot (SrtSubprocessRunner *self);
SrtTestFlags _srt_subprocess_runner_get_test_flags (SrtSubprocessRunner *self);
const char *_srt_subprocess_runner_get_working_directory (SrtSubprocessRunner *self);

typedef enum
{
  SRT_HELPER_FLAGS_SEARCH_PATH = (1 << 0),
  SRT_HELPER_FLAGS_TIME_OUT = (1 << 1),
  SRT_HELPER_FLAGS_LIBGL_VERBOSE = (1 << 2),
  SRT_HELPER_FLAGS_SHELL_EXIT_STATUS = (1 << 3),
  SRT_HELPER_FLAGS_IN_BIN_DIR = (1 << 4),
  SRT_HELPER_FLAGS_QUIET = (1 << 5),
  SRT_HELPER_FLAGS_LEAVE_FDS_OPEN = (1 << 6),
  SRT_HELPER_FLAGS_CHOMP = (1 << 7),
  SRT_HELPER_FLAGS_TERMINATE_WITH_PARENT = (1 << 8),
  SRT_HELPER_FLAGS_WORKS_IN_SYSROOT = (1 << 9),
  SRT_HELPER_FLAGS_SYSROOT_AWARE = (1 << 10),
  SRT_HELPER_FLAGS_NONE = 0
} SrtHelperFlags;

typedef enum
{
  SRT_SUBPROCESS_OUTPUT_CAPTURE = 0,
  SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
  SRT_SUBPROCESS_OUTPUT_INHERIT,
  SRT_SUBPROCESS_OUTPUT_SILENCE
} SrtSubprocessOutput;

const char *_srt_subprocess_runner_resolve_helpers_path (SrtSubprocessRunner *self,
                                                         GError **error);
GPtrArray *_srt_subprocess_runner_get_helper (SrtSubprocessRunner *self,
                                              const char *multiarch,
                                              const SrtKnownArchitecture *known_arch,
                                              const char *base,
                                              SrtHelperFlags flags,
                                              GError **error);
SrtCompletedSubprocess *_srt_subprocess_runner_run_sync (SrtSubprocessRunner *self,
                                                         SrtHelperFlags flags,
                                                         GQuark architecture,
                                                         const char * const *argv,
                                                         SrtSubprocessOutput stdout_mode,
                                                         SrtSubprocessOutput stderr_mode,
                                                         GError **error);
