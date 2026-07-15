/*
 * Copyright © 2025 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#include "steam-runtime-tools/emulator-server-internal.h"

#include "steam-runtime-tools/utils-internal.h"

/*
 * SrtEmulatorServer:
 *
 * Object representing a server helping to implement a CPU emulator,
 * for example `FEXServer`.
 *
 * This object can safely be shared between threads,
 * as long as each thread holds a reference.
 */

struct _SrtEmulatorServer
{
  GObject parent;
  GMutex lock;

  /* Protected by @lock */
  int exit_fd;
  int ready_fd;
};

struct _SrtEmulatorServerClass
{
  GObjectClass parent_class;
};

G_DEFINE_TYPE (SrtEmulatorServer, _srt_emulator_server, G_TYPE_OBJECT)

static void
_srt_emulator_server_init (SrtEmulatorServer *self)
{
  g_mutex_init (&self->lock);
  self->exit_fd = -1;
  self->ready_fd = -1;
}

static void
_srt_emulator_server_finalize (GObject *object)
{
  SrtEmulatorServer *self = SRT_EMULATOR_SERVER (object);

  g_clear_fd (&self->exit_fd, NULL);
  g_clear_fd (&self->ready_fd, NULL);
  g_mutex_clear (&self->lock);

  G_OBJECT_CLASS (_srt_emulator_server_parent_class)->finalize (object);
}

static void
_srt_emulator_server_class_init (SrtEmulatorServerClass *cls)
{
  GObjectClass *object_class = G_OBJECT_CLASS (cls);

  object_class->finalize = _srt_emulator_server_finalize;
}

static void
emulator_server_child_setup_cb (void *nil)
{
  _srt_child_setup_unblock_signals (NULL);
  g_fdwalk_set_cloexec (3);
}

/*
 * _srt_emulator_server_maybe_start:
 * @emulator: (nullable): An emulator, or %NULL
 * @envp: (nullable): Environment variables to be modified by those from
 *  the @emulator, or %NULL
 * @server_out: (out) (not optional) (transfer full): Set to a newly
 *  created #SrtEmulatorServer object if appropriate
 *
 * If @emulator is non-%NULL and requires a server process,
 * start the server process in an execution environment based on @envp
 * and output it via @server_out, returning %TRUE on success.
 * The server is not necessarily ready, and the caller should call
 * _srt_emulator_server_wait_for_ready() before starting other emulator
 * processes.
 *
 * If @emulator is %NULL or does not require a server process,
 * return %TRUE leaving @server_out set to %NULL.
 *
 * If the server could not be started, return %FALSE.
 *
 * Returns: %TRUE on success, even if no emulator server was needed
 */
gboolean
_srt_emulator_server_maybe_start (SrtEmulator *emulator,
                                  const char * const *envp,
                                  SrtEmulatorServer **server_out,
                                  GError **error)
{
  g_autoptr(SrtEmulatorServer) server = NULL;
  g_auto(GStrv) modified_envp = NULL;
  GPid pid = 0;
  const SrtEnvOverlay *emulator_env;
  const char * const *argv;

  g_return_val_if_fail (server_out != NULL, FALSE);
  g_return_val_if_fail (*server_out == NULL, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  if (emulator == NULL)
    return TRUE;

  argv = _srt_emulator_get_server_argv (emulator);

  if (argv == NULL)
    {
      g_debug ("Emulator does not need a server");
      return TRUE;
    }

  g_return_val_if_fail (argv[0] != NULL, FALSE);

  g_debug ("Arguments for emulator's server");

  for (size_t i = 0; argv[i] != NULL; i++)
    {
      g_autofree gchar *quoted = g_shell_quote (argv[i]);

      g_debug ("\t%" G_GSIZE_FORMAT ": %s", i, quoted);
    }

  if (envp != NULL)
    modified_envp = _srt_strdupv (envp);
  else
    modified_envp = g_get_environ ();

  emulator_env = _srt_emulator_get_environment (emulator);
  modified_envp = _srt_env_overlay_apply (emulator_env, modified_envp);

  server = g_object_new (SRT_TYPE_EMULATOR_SERVER,
                         NULL);

  /* Like Flatpak, we work around a potential deadlock in GLib < 2.60
   * by using G_SPAWN_LEAVE_DESCRIPTORS_OPEN and setting CLOEXEC ourselves.
   * We can probably stop doing this when pressure-vessel is built with
   * steamrt3c or newer on all platforms. */
  if (!g_spawn_async_with_pipes (NULL,
                                 (char **) argv,
                                 modified_envp,
                                 (G_SPAWN_LEAVE_DESCRIPTORS_OPEN
                                  | G_SPAWN_CLOEXEC_PIPES),
                                 emulator_server_child_setup_cb,
                                 NULL,  /* user data */
                                 &pid,
                                 &server->exit_fd,
                                 &server->ready_fd,
                                 NULL,  /* let stderr inherit */
                                 error))
    return FALSE;

  g_debug ("emulator's server is process %d", pid);

  if (server_out != NULL)
    *server_out = g_steal_pointer (&server);

  return TRUE;
}

/*
 * _srt_emulator_server_steal_exit_fd:
 * @self: An emulator server
 *
 * If this method has not already been called,
 * return a non-negative file descriptor representing the emulator server.
 * As long as this file descriptor remains open, the emulator server
 * should continue to run.
 * When this file descriptor is closed, the emulator server is
 * assumed not to be required and will exit shortly afterward.
 *
 * If this method has already been called, return a negative number.
 *
 * This method may be called from any thread. It may block.
 *
 * Returns: a file descriptor owned by the caller
 */
int
_srt_emulator_server_steal_exit_fd (SrtEmulatorServer *self)
{
  int ret;

  g_return_val_if_fail (SRT_IS_EMULATOR_SERVER (self), FALSE);

  g_mutex_lock (&self->lock);
    {
      ret = g_steal_fd (&self->exit_fd);
    }
  g_mutex_unlock (&self->lock);

  return ret;
}

#define READY_MESSAGE "READY=1\n"

/*
 * _srt_emulator_server_wait_for_ready:
 * @self: An emulator server
 *
 * Wait for the emulator server to become ready,
 * returning %TRUE if it is, or %FALSE with @error set if an error occurs.
 *
 * This method may be called from any thread. It may block.
 *
 * Returns: %TRUE if the server is ready
 */
gboolean
_srt_emulator_server_wait_for_ready (SrtEmulatorServer *self,
                                     GError **error)
{
  gboolean ret;

  g_return_val_if_fail (SRT_IS_EMULATOR_SERVER (self), FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  g_mutex_lock (&self->lock);
    {
      if (self->ready_fd < 0)
        {
          g_debug ("Emulator server already ready");
          ret = TRUE;
        }
      else
        {
          g_autoptr(GString) buf = g_string_new (NULL);
          gboolean closed_ok;

          g_debug ("Waiting for emulator server to be ready...");
          ret = _srt_string_read_fd_until_eof (buf, self->ready_fd, error);
          g_debug ("... done");

          if (ret)
            {
              if (strlen (buf->str) != buf->len)
                ret = glnx_throw (error,
                                  "stdout from emulator server contains \\0");
              else if (!_srt_string_ends_with (buf, READY_MESSAGE))
                ret = glnx_throw (error,
                                  "Last output line from emulator server was not READY=1\\n");

              /* We want to close the fd even if the output is not what
               * we wanted, but avoid overwriting @error if we already
               * set it. g_clear_fd() guarantees to set errno on failure,
               * so this is most straightforward to achieve by using that. */
              closed_ok = g_clear_fd (&self->ready_fd, NULL);

              if (ret && !closed_ok)
                ret = glnx_throw_errno_prefix (error,
                                               "Unable to close pipe from emulator server");
            }
        }
    }
  g_mutex_unlock (&self->lock);

  return ret;
}
