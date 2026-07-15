/*
 * Copyright © 2019-2023 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#include "steam-runtime-tools/subprocess-internal.h"

#include "steam-runtime-tools/architecture-internal.h"
#include "steam-runtime-tools/enums.h"
#include "steam-runtime-tools/utils-internal.h"

/* Enabling debug logging for this is rather too verbose, so only
 * enable it when actively debugging this module */
#if 0
#define trace(...) g_debug (__VA_ARGS__)
#else
#define trace(...) do { } while (0)
#endif

static void
gstring_free0 (GString *str)
{
  if (str != NULL)
    g_string_free (str, TRUE);
}

/*
 * SrtCompletedSubprocess:
 *
 * Object representing a subprocess that has finished running,
 * similar to Python `subprocess.CompletedProcess`.
 * It has standard output (if captured),
 * standard error (if captured),
 * and a wait status which encodes whether it exited normally or was
 * killed by a signal.
 *
 * Unlike the equivalent Python object, this object also has an
 * indication of whether it timed out.
 */

struct _SrtCompletedSubprocess
{
  GObject parent;
  gchar *out;
  gchar *err;
  SrtHelperFlags flags;
  SrtSubprocessOutput out_mode;
  SrtSubprocessOutput err_mode;
  int wait_status;
  unsigned timed_out : 1;
};

struct _SrtCompletedSubprocessClass
{
  GObjectClass parent_class;
};

G_DEFINE_TYPE (SrtCompletedSubprocess, _srt_completed_subprocess, G_TYPE_OBJECT)

static SrtCompletedSubprocess *
_srt_completed_subprocess_new (void)
{
  return g_object_new (SRT_TYPE_COMPLETED_SUBPROCESS,
                       NULL);
}

static void
_srt_completed_subprocess_init (SrtCompletedSubprocess *self)
{
  self->wait_status = -1;
}

static void
_srt_completed_subprocess_finalize (GObject *object)
{
  SrtCompletedSubprocess *self = SRT_COMPLETED_SUBPROCESS (object);

  g_free (self->out);
  g_free (self->err);

  G_OBJECT_CLASS (_srt_completed_subprocess_parent_class)->finalize (object);
}

static void
_srt_completed_subprocess_class_init (SrtCompletedSubprocessClass *cls)
{
  GObjectClass *object_class = G_OBJECT_CLASS (cls);

  object_class->finalize = _srt_completed_subprocess_finalize;
}

static void
_srt_completed_subprocess_dump (SrtCompletedSubprocess *self)
{
  if ((self->out_mode == SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG)
      && self->out != NULL
      && self->out[0] != '\0')
    g_debug ("stdout: %s", self->out);

  if ((self->err_mode == SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG)
      && self->err != NULL
      && self->err[0] != '\0')
    g_debug ("stderr: %s", self->err);

  g_debug ("Wait status %d", self->wait_status);
}

/*
 * Return %TRUE if @self has completed successfully and had exit status 0.
 * If it exited with an unsuccessful status, attempt to add whatever it
 * wrote to stderr to the error message.
 */
gboolean
_srt_completed_subprocess_check (SrtCompletedSubprocess *self,
                                 GError **error)
{
  gboolean ret;

  _srt_completed_subprocess_dump (self);
  ret = g_spawn_check_wait_status (self->wait_status, error);

  if (error != NULL
      && *error != NULL
      && self->err != NULL
      && self->err[0] != '\0')
    {
      g_autoptr(GError) original = g_steal_pointer (error);

      g_set_error (error, original->domain, original->code,
                   "%s: %s", original->message, self->err);
    }

  return ret;
}

/*
 * _srt_subprocess_report:
 * @self: the subprocess
 * @wait_status_out: (out): a wait()-style status, or -1 if not applicable
 * @exit_status_out: (out): an exit status, or -1 if killed by a signal
 *  or some other non-exit() result
 * @terminating_signal_out: (out): the signal that terminated the process,
 *  or 0 if not terminated by a signal
 * @timed_out_out: (out): %TRUE if the process reached a timeout
 *
 * Return %TRUE if @self has completed successfully, and set
 * various out parameters to reflect further details.
 */
gboolean
_srt_completed_subprocess_report (SrtCompletedSubprocess *self,
                                  int *wait_status_out,
                                  int *exit_status_out,
                                  int *terminating_signal_out,
                                  gboolean *timed_out_out)
{
  if (wait_status_out != NULL)
    *wait_status_out = self->wait_status;

  if (exit_status_out != NULL)
    *exit_status_out = -1;

  if (terminating_signal_out != NULL)
    *terminating_signal_out = 0;

  if (timed_out_out != NULL)
    *timed_out_out = self->timed_out;

  _srt_completed_subprocess_dump (self);

  if (WIFEXITED (self->wait_status))
    {
      int exit_status = WEXITSTATUS (self->wait_status);

      if (exit_status_out != NULL)
        *exit_status_out = exit_status;

      if ((self->flags & SRT_HELPER_FLAGS_SHELL_EXIT_STATUS)
          && exit_status > 128
          && exit_status <= 128 + SIGRTMAX)
        {
          g_debug ("-> subprocess killed by signal %d", (exit_status - 128));

          if (terminating_signal_out != NULL)
            *terminating_signal_out = (exit_status - 128);
        }
      else
        {
          g_debug ("-> exit status %d", exit_status);
        }
    }
  else if (WIFSIGNALED (self->wait_status))
    {
      g_debug ("-> killed by signal %d", WTERMSIG (self->wait_status));

      if (terminating_signal_out != NULL)
        *terminating_signal_out = WTERMSIG (self->wait_status);
    }
  else
    {
      g_critical ("Somehow got a wait_status that was neither exited nor signaled");
      g_return_val_if_reached (FALSE);
    }

  return self->wait_status == 0;
}

/*
 * Return %TRUE if the process timed out, %FALSE if it completed for
 * any other reason.
 */
gboolean
_srt_completed_subprocess_timed_out (SrtCompletedSubprocess *self)
{
  gboolean ret = FALSE;

  _srt_completed_subprocess_report (self, NULL, NULL, NULL, &ret);
  return ret;
}

/*
 * Return what the subprocess wrote to stdout.
 * If _srt_completed_subprocess_steal_stdout() was previously called,
 * or if the output mode was INHERIT or SILENCE, then this will be %NULL.
 * Otherwise it will be non-%NULL (but possibly empty).
 *
 * Returns: (transfer none):
 */
const char *
_srt_completed_subprocess_get_stdout (SrtCompletedSubprocess *self)
{
  return self->out;
}

/*
 * Same as _srt_completed_subprocess_get_stdout(), but for stderr.
 *
 * Returns: (transfer none):
 */
const char *
_srt_completed_subprocess_get_stderr (SrtCompletedSubprocess *self)
{
  return self->err;
}

/*
 * Return what the subprocess wrote to stdout, the same as
 * _srt_completed_subprocess_get_stdout(), but without copying.
 * The caller is given ownership of the result, and subsequent calls to
 * _srt_completed_subprocess_steal_stdout() will return %NULL.
 *
 * Returns: (transfer full):
 */
gchar *
_srt_completed_subprocess_steal_stdout (SrtCompletedSubprocess *self)
{
  return g_steal_pointer (&self->out);
}

/*
 * Same as _srt_completed_subprocess_steal_stdout(), but for stderr.
 *
 * Returns: (transfer full):
 */
gchar *
_srt_completed_subprocess_steal_stderr (SrtCompletedSubprocess *self)
{
  return g_steal_pointer (&self->err);
}

/*
 * SrtSubprocess:
 *
 * Internal data structure representing a subprocess that has been launched
 * and might not yet have completed.
 */
typedef struct
{
  /* Thread safety: Not thread safe.
   * All members must only be accessed from the thread where it was created. */
  GString *out;
  GString *err;
  GError *error;
  GMainContext *completing_context;
  GSource *sigterm_source;
  GSource *sigkill_source;
  SrtHelperFlags flags;
  SrtSubprocessOutput out_mode;
  SrtSubprocessOutput err_mode;
  GPid pid;
  unsigned sigterm_seconds;
  unsigned sigkill_seconds;
  int wait_status;
  int stdout_fd;
  int stderr_fd;
  unsigned can_use_waitid : 1;
  unsigned timed_out : 1;
  unsigned waiting_in_thread : 1;
} SrtSubprocess;

#define SRT_SUBPROCESS_INIT \
{ .wait_status = -1, .stdout_fd = -1, .stderr_fd = -1 }

static void
_srt_subprocess_cancel_timeout (SrtSubprocess *self)
{
  if (self->sigterm_source != NULL)
    g_source_destroy (self->sigterm_source);

  if (self->sigkill_source != NULL)
    g_source_destroy (self->sigkill_source);

  g_clear_pointer (&self->sigterm_source, g_source_unref);
  g_clear_pointer (&self->sigkill_source, g_source_unref);
}

static void
_srt_subprocess_clear (SrtSubprocess *self)
{
  _srt_subprocess_cancel_timeout (self);
  g_clear_fd (&self->stdout_fd, NULL);
  g_clear_fd (&self->stderr_fd, NULL);
  gstring_free0 (self->out);
  gstring_free0 (self->err);
  g_clear_pointer (&self->completing_context, g_main_context_unref);
}

static void
_srt_subprocess_free (void *self)
{
  _srt_subprocess_clear (self);
  g_free (self);
}

G_DEFINE_AUTO_CLEANUP_CLEAR_FUNC (SrtSubprocess, _srt_subprocess_clear)
G_DEFINE_AUTOPTR_CLEANUP_FUNC (SrtSubprocess, _srt_subprocess_free)

/*
 * Return %TRUE if @self has completed successfully or might still complete
 * successfully in future. Return %FALSE with error if it already failed.
 */
static gboolean
_srt_subprocess_check_no_error (SrtSubprocess *self,
                                GError **error)
{
  if (self->error != NULL)
    {
      g_set_error_literal (error, self->error->domain, self->error->code,
                           self->error->message);
      return FALSE;
    }

  return TRUE;
}

/* Read from stdout or stderr into one of the internal buffers */
static gboolean
_srt_subprocess_read (SrtSubprocess *self,
                      const char *label,
                      GString *string,
                      int *fd_p)
{
  char buf[1024];
  ssize_t len;

  trace ("Data available on process %d %s", self->pid, label);

  len = read (*fd_p, buf, sizeof (buf));

  if (len < 0)
    {
      g_autoptr(GError) error = NULL;
      int saved_errno = errno;

      if (saved_errno == EAGAIN)
        return G_SOURCE_CONTINUE;

      error = g_error_new (G_IO_ERROR,
                           g_io_error_from_errno (saved_errno),
                           "Error reading from subprocess %d %s: %s",
                           self->pid, label, g_strerror (saved_errno));

      g_debug ("%s", error->message);

      if (self->error == NULL)
        self->error = g_steal_pointer (&error);

      if (!g_clear_fd (fd_p, NULL))
        g_debug ("Error closing subprocess %d %s: %s",
                 self->pid, label, g_strerror (errno));

      return G_SOURCE_REMOVE;   /* Destroys the source */
    }
  else if (len == 0)
    {
      trace ("EOF reading from subprocess %d %s", self->pid, label);

      if (!g_clear_fd (fd_p, NULL))
        g_debug ("Error closing subprocess %d %s: %s",
                 self->pid, label, g_strerror (errno));

      return G_SOURCE_REMOVE;   /* Destroys the source */
    }
  else
    {
      trace ("%zd bytes from subprocess %d %s",
             len, self->pid, label);
      g_string_append_len (string, buf, len);
      return G_SOURCE_CONTINUE;
    }
}

static gboolean
_srt_subprocess_read_stdout_cb (int fd,
                                GIOCondition condition,
                                void *user_data)
{
  SrtSubprocess *self = user_data;

  return _srt_subprocess_read (self, "stdout", self->out, &self->stdout_fd);
}

static gboolean
_srt_subprocess_read_stderr_cb (int fd,
                                GIOCondition condition,
                                void *user_data)
{
  SrtSubprocess *self = user_data;

  return _srt_subprocess_read (self, "stderr", self->err, &self->stderr_fd);
}

/* Iterate @completing_context until everything has been read from stdout
 * and/or stderr */
static void
_srt_subprocess_read_pipes (SrtSubprocess *self)
{
  g_autoptr(GSource) stdout_source = NULL;
  g_autoptr(GSource) stderr_source = NULL;

  if (self->stdout_fd >= 0)
    {
      g_assert (self->out != NULL);
      stdout_source = g_unix_fd_source_new (self->stdout_fd, G_IO_IN);
      g_source_set_callback (stdout_source,
                             G_SOURCE_FUNC (_srt_subprocess_read_stdout_cb),
                             self, NULL);
      g_source_set_name (stdout_source, "read child process stdout");
      g_source_attach (stdout_source, self->completing_context);
    }

  if (self->stderr_fd >= 0)
    {
      g_assert (self->err != NULL);
      stderr_source = g_unix_fd_source_new (self->stderr_fd, G_IO_IN);
      g_source_set_callback (stderr_source,
                             G_SOURCE_FUNC (_srt_subprocess_read_stderr_cb),
                             self, NULL);
      g_source_set_name (stderr_source, "read child process stderr");
      g_source_attach (stderr_source, self->completing_context);
    }

  /* Each fd is closed and cleared when error or EOF is reached */
  while (self->stdout_fd >= 0 || self->stderr_fd >= 0)
    g_main_context_iteration (self->completing_context, TRUE);

  g_assert (stdout_source == NULL || g_source_is_destroyed (stdout_source));
  g_assert (stderr_source == NULL || g_source_is_destroyed (stderr_source));
}

static void
_srt_subprocess_waitpid (SrtSubprocess *self,
                         int waitpid_flags)
{
  pid_t pid;

  g_return_if_fail (self->pid > 0);
  pid = TEMP_FAILURE_RETRY (waitpid (self->pid,
                                     &self->wait_status,
                                     waitpid_flags));

  if (pid < 0)
    {
      int saved_errno = errno;

      g_assert (self->error == NULL);
      self->error = g_error_new (G_IO_ERROR,
                                 g_io_error_from_errno (saved_errno),
                                 "Error waiting for subprocess %d: %s",
                                 self->pid, g_strerror (saved_errno));
      g_debug ("%s", self->error->message);
      self->wait_status = -1;
    }

  if (pid == 0)
    {
      if (waitpid_flags & WNOHANG)
        return;

      /* waitpid() should never return 0 otherwise */
      g_return_if_reached ();
    }

  /* The child process no longer exists, so we must not kill it */
  self->pid = 0;
}

static gboolean
_srt_subprocess_sigkill_cb (void *user_data)
{
  SrtSubprocess *self = user_data;

  trace ("Process %d SIGKILL timeout reached", self->pid);

  self->timed_out = 1;
  g_clear_pointer (&self->sigkill_source, g_source_unref);

  if (self->pid > 0)
    {
      g_debug ("Process %d timed out, sending SIGKILL", self->pid);
      kill (self->pid, SIGKILL);
      kill (self->pid, SIGCONT);
    }

  return G_SOURCE_REMOVE;
}

static void
_srt_subprocess_schedule_sigkill (SrtSubprocess *self)
{
  g_return_if_fail (self->pid > 0);
  trace ("Scheduling SIGKILL after %u seconds", self->sigkill_seconds);
  self->sigkill_source = g_timeout_source_new_seconds (self->sigkill_seconds);
  g_source_set_callback (self->sigkill_source, _srt_subprocess_sigkill_cb, self, NULL);
  g_source_set_name (self->sigkill_source, "send SIGKILL to timed-out child");
  g_source_attach (self->sigkill_source, self->completing_context);
}

static gboolean
_srt_subprocess_sigterm_cb (void *user_data)
{
  SrtSubprocess *self = user_data;

  trace ("Process %d SIGTERM timeout reached", self->pid);

  self->timed_out = 1;
  g_clear_pointer (&self->sigterm_source, g_source_unref);

  if (self->pid > 0)
    {
      g_debug ("Process %d timed out, sending SIGTERM", self->pid);
      kill (self->pid, SIGTERM);

      if (self->sigkill_seconds > 0)
        _srt_subprocess_schedule_sigkill (self);
    }

  return G_SOURCE_REMOVE;
}

static void
_srt_subprocess_schedule_sigterm (SrtSubprocess *self)
{
  g_return_if_fail (self->pid > 0);
  trace ("Scheduling SIGTERM after %u seconds", self->sigterm_seconds);
  self->sigterm_source = g_timeout_source_new_seconds (self->sigterm_seconds);
  g_source_set_callback (self->sigterm_source, _srt_subprocess_sigterm_cb, self, NULL);
  g_source_set_name (self->sigterm_source, "send SIGTERM to timed-out child");
  g_source_attach (self->sigterm_source, self->completing_context);
}

static gboolean
_srt_subprocess_poll_cb (void *user_data)
{
  SrtSubprocess *self = user_data;

  _srt_subprocess_waitpid (self, WNOHANG);

  if (self->pid == 0)
    {
      _srt_subprocess_cancel_timeout (self);
      return G_SOURCE_REMOVE;
    }
  else
    {
      return G_SOURCE_CONTINUE;
    }
}

typedef struct
{
  /* Thread safety: ownership is transferred to the thread pool when
   * this data structure is enqueued, and transferred back when
   * _srt_subprocess_child_waitid_cb() is invoked.
   * Do not access any member from a thread that is not the current owner. */
  SrtSubprocess *self;
  GMainContext *send_to_context;
  GPid pid;
  int saved_errno;
} WaitidInThread;

/* Thread safety: Called from the thread that is calling
 * _srt_subprocess_complete_sync(). */
static gboolean
_srt_subprocess_child_waitid_cb (void *user_data)
{
  WaitidInThread *state = user_data;
  SrtSubprocess *self = state->self;

  trace ("Notified that process %d has exited", state->pid);
  g_return_val_if_fail (self->waiting_in_thread, G_SOURCE_REMOVE);

  _srt_subprocess_cancel_timeout (self);
  /* Call waitpid(), allowing the process to be reaped */
  _srt_subprocess_waitpid (self, 0);

  if (self->pid != 0)
    {
      g_warning ("Failed to get exit status of process %d: %s",
                 self->pid, g_strerror (errno));
      self->wait_status = -1;
      /* We can't expect that waiting for it again will work any better. */
      self->pid = 0;
    }

  trace ("Process %d wait status %d", state->pid, self->wait_status);
  self->waiting_in_thread = FALSE;
  return G_SOURCE_REMOVE;
}

/* Called in a background thread, be careful with thread safety.
 * @state is owned by this thread until we send it back to the calling thread. */
static void *
_srt_subprocess_waitid_in_thread (void *user_data)
{
  WaitidInThread *state = user_data;
  GMainContext *send_to_context = state->send_to_context;
  siginfo_t info = { .si_pid = 0 };

  g_return_val_if_fail (state->self != NULL, NULL);
  g_return_val_if_fail (state->send_to_context != NULL, NULL);
  g_return_val_if_fail (state->pid > 0, NULL);

  if (TEMP_FAILURE_RETRY (waitid (P_PID, state->pid, &info, WEXITED|WNOWAIT)) == 0)
    {
      state->saved_errno = 0;
      trace ("Process %d code %d, status %d: waking up main loop",
             info.si_pid, info.si_code, info.si_status);
    }
  else
    {
      state->saved_errno = errno;
      trace ("Process %d waitid() error, waking up main loop: %s",
             pid, g_strerror (state->saved_errno));
    }

  /* Thread safety: this call transfers ownership of @state back to the
   * calling thread. It must not be used after this point. */
  g_main_context_invoke (send_to_context,
                         _srt_subprocess_child_waitid_cb,
                         g_steal_pointer (&state));
  return NULL;
}

/* Similar to g_subprocess_communicate() */
static void
_srt_subprocess_complete_sync (SrtSubprocess *self)
{
  g_return_if_fail (self->completing_context == NULL);
  self->completing_context = g_main_context_new ();

  g_main_context_push_thread_default (self->completing_context);
    {
      if (self->sigterm_seconds > 0)
        _srt_subprocess_schedule_sigterm (self);
      else if (self->sigkill_seconds > 0)
        _srt_subprocess_schedule_sigkill (self);

      _srt_subprocess_read_pipes (self);

      if (self->flags & SRT_HELPER_FLAGS_TIME_OUT)
        {
          g_autoptr(GSource) tick_source = NULL;

          /* Opportunistically check whether the process already exited:
           * if it has, there's no need to go to the expense of creating a
           * thread to wait for it. */
          _srt_subprocess_waitpid (self, WNOHANG);

          if (self->pid == 0)
            goto out;

          if (self->can_use_waitid)
            {
              GThread *thread;
              WaitidInThread thread_data =
              {
                .self = self,
                .send_to_context = self->completing_context,
                .pid = self->pid,
              };

              /* Thread safety: @thread_data is owned by the thread pool
               * until it sends it back to
               * _srt_subprocess_child_waitid_cb(), which clears
               * self->waiting_in_thread. */
              self->waiting_in_thread = TRUE;
              thread = g_thread_new ("srt-waitid",
                                     _srt_subprocess_waitid_in_thread,
                                     &thread_data);

              while (self->waiting_in_thread)
                g_main_context_iteration (self->completing_context, TRUE);

              g_thread_join (thread);
            }
          else
            {
              tick_source = g_timeout_source_new (100);
              g_source_set_callback (tick_source, _srt_subprocess_poll_cb,
                                     self, NULL);
              g_source_set_name (tick_source, "poll child process");
              g_source_attach (tick_source, self->completing_context);

              while (self->pid != 0)
                g_main_context_iteration (self->completing_context, TRUE);

              g_source_destroy (tick_source);
            }
        }
      else
        {
          /* There's no timeout, so we can just wait forever */
          _srt_subprocess_waitpid (self, 0);
        }
    }
out:
  g_main_context_pop_thread_default (self->completing_context);
}

static SrtCompletedSubprocess *
_srt_completed_subprocess_new_from_subprocess (SrtSubprocess *self)
{
  g_autoptr(SrtCompletedSubprocess) completed = _srt_completed_subprocess_new ();

  completed->flags = self->flags;
  completed->out_mode = self->out_mode;
  completed->err_mode = self->err_mode;
  completed->wait_status = self->wait_status;
  completed->timed_out = self->timed_out;

  if (self->flags & SRT_HELPER_FLAGS_CHOMP)
    {
      if (self->out != NULL)
        _srt_string_chomp_newline (self->out);

      if (self->err != NULL)
        _srt_string_chomp_newline (self->err);
    }

  if (self->out != NULL)
    completed->out = g_string_free_and_steal (g_steal_pointer (&self->out));

  if (self->err != NULL)
    completed->err = g_string_free_and_steal (g_steal_pointer (&self->err));

  return g_steal_pointer (&completed);
}

/*
 * SrtSubprocessRunner:
 *
 * Object representing a context in which subprocesses can be run.
 *
 * Because all members are read-only (immutable) after construction,
 * this object may be used concurrently in more than one thread.
 */
struct _SrtSubprocessRunner
{
  GObject parent;
  /* For now we assume that we won't need more than one emulator,
   * so this is just a nullable pointer to the emulator and a nullable
   * pointer to its server, rather than an array of (emulator,server)
   * pairs. */
  SrtEmulator *emulator;
  SrtEmulatorServer *emulator_server;
  /* Environment */
  GStrv envp;
  /* Path to find steam-runtime-launch-client etc., or %NULL */
  gchar *bin_path;
  /* Path to find helper executables, or %NULL to use $SRT_HELPERS_PATH
   * or the installed helpers */
  gchar *helpers_path;
  /* Working directory, or %NULL to use current */
  gchar *working_directory;
  SrtSysroot *sysroot;
  SrtTestFlags test_flags;
  unsigned can_use_waitid : 1;
};

struct _SrtSubprocessRunnerClass
{
  GObjectClass parent_class;
};

G_DEFINE_TYPE (SrtSubprocessRunner, _srt_subprocess_runner, G_TYPE_OBJECT)

enum
{
  PROP_0,
  PROP_BIN_PATH,
  PROP_EMULATOR,
  PROP_EMULATOR_SERVER,
  PROP_ENVIRON,
  PROP_HELPERS_PATH,
  PROP_SYSROOT,
  PROP_TEST_FLAGS,
  PROP_WORKING_DIRECTORY,
  N_PROPERTIES
};

static GParamSpec *properties[N_PROPERTIES] = { NULL };

static void
_srt_subprocess_runner_init (SrtSubprocessRunner *self)
{
}

static void
_srt_subprocess_runner_constructed (GObject *object)
{
  SrtSubprocessRunner *self = SRT_SUBPROCESS_RUNNER (object);
  siginfo_t siginfo = {};

  if (self->envp == NULL)
    self->envp = _srt_filter_gameoverlayrenderer_from_envp (_srt_peek_environ_nonnull ());

  /* Check whether we can use waitid() with WNOWAIT.
   * This process cannot be its own child process, so we expect that
   * waitid() will fail with ECHILD ("The process specified ... is not a
   * child of the calling process") if the flags are supported. */
  errno = 0;
  waitid (P_PID, getpid (), &siginfo, WEXITED|WNOHANG|WNOWAIT);

  if (errno == ECHILD)
    self->can_use_waitid = TRUE;
  else
    g_warning_once ("WNOWAIT not supported, will fall back to polling");

  G_OBJECT_CLASS (_srt_subprocess_runner_parent_class)->constructed (object);
}

static void
_srt_subprocess_runner_get_property (GObject *object,
                                     guint prop_id,
                                     GValue *value,
                                     GParamSpec *pspec)
{
  SrtSubprocessRunner *self = SRT_SUBPROCESS_RUNNER (object);

  switch (prop_id)
    {
      case PROP_BIN_PATH:
        g_value_set_string (value, self->bin_path);
        break;

      case PROP_EMULATOR:
        g_value_set_object (value, self->emulator);
        break;

      case PROP_EMULATOR_SERVER:
        g_value_set_object (value, self->emulator_server);
        break;

      case PROP_ENVIRON:
        g_value_set_boxed (value, self->envp);
        break;

      case PROP_HELPERS_PATH:
        g_value_set_string (value, self->helpers_path);
        break;

      case PROP_SYSROOT:
        g_value_set_object (value, self->sysroot);
        break;

      case PROP_TEST_FLAGS:
        g_value_set_flags (value, self->test_flags);
        break;

      case PROP_WORKING_DIRECTORY:
        g_value_set_string (value, self->working_directory);
        break;

      default:
        G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
    }
}

static void
_srt_subprocess_runner_set_property (GObject *object,
                                     guint prop_id,
                                     const GValue *value,
                                     GParamSpec *pspec)
{
  SrtSubprocessRunner *self = SRT_SUBPROCESS_RUNNER (object);
  const char * const *envp;

  switch (prop_id)
    {
      case PROP_BIN_PATH:
        /* Construct-only */
        g_return_if_fail (self->bin_path == NULL);
        self->bin_path = g_value_dup_string (value);
        break;

      case PROP_EMULATOR:
        /* Construct-only */
        g_return_if_fail (self->emulator == NULL);
        self->emulator = g_value_dup_object (value);
        break;

      case PROP_EMULATOR_SERVER:
        /* Construct-only */
        g_return_if_fail (self->emulator_server == NULL);
        self->emulator_server = g_value_dup_object (value);
        break;

      case PROP_ENVIRON:
        /* Construct-only */
        g_return_if_fail (self->envp == NULL);
        envp = g_value_get_boxed (value);

        if (envp != NULL)
          self->envp = _srt_filter_gameoverlayrenderer_from_envp (envp);

        break;

      case PROP_HELPERS_PATH:
        /* Construct-only */
        g_return_if_fail (self->helpers_path == NULL);
        self->helpers_path = g_value_dup_string (value);
        break;

      case PROP_SYSROOT:
        /* Construct-only */
        g_return_if_fail (self->sysroot == NULL);
        self->sysroot = g_value_dup_object (value);
        break;

      case PROP_TEST_FLAGS:
        /* Construct-only */
        g_return_if_fail (self->test_flags == SRT_TEST_FLAGS_NONE);
        self->test_flags = g_value_get_flags (value);
        break;

      case PROP_WORKING_DIRECTORY:
        /* Construct-only */
        g_return_if_fail (self->working_directory == NULL);
        self->working_directory = g_value_dup_string (value);
        break;

      default:
        G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
    }
}

static void
_srt_subprocess_runner_dispose (GObject *object)
{
  SrtSubprocessRunner *self = SRT_SUBPROCESS_RUNNER (object);

  g_clear_object (&self->emulator);
  g_clear_object (&self->emulator_server);
  g_clear_object (&self->sysroot);

  G_OBJECT_CLASS (_srt_subprocess_runner_parent_class)->dispose (object);
}

static void
_srt_subprocess_runner_finalize (GObject *object)
{
  SrtSubprocessRunner *self = SRT_SUBPROCESS_RUNNER (object);

  g_strfreev (self->envp);
  g_free (self->bin_path);
  g_free (self->helpers_path);
  g_free (self->working_directory);

  G_OBJECT_CLASS (_srt_subprocess_runner_parent_class)->finalize (object);
}

static void
_srt_subprocess_runner_class_init (SrtSubprocessRunnerClass *cls)
{
  GObjectClass *object_class = G_OBJECT_CLASS (cls);

  object_class->constructed = _srt_subprocess_runner_constructed;
  object_class->get_property = _srt_subprocess_runner_get_property;
  object_class->set_property = _srt_subprocess_runner_set_property;
  object_class->dispose = _srt_subprocess_runner_dispose;
  object_class->finalize = _srt_subprocess_runner_finalize;

  properties[PROP_BIN_PATH] =
    g_param_spec_string ("bin-path", NULL, NULL, NULL,
                         G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                         G_PARAM_STATIC_STRINGS);
  properties[PROP_EMULATOR] =
    g_param_spec_object ("emulator", NULL, NULL, SRT_TYPE_EMULATOR,
                        G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                        G_PARAM_STATIC_STRINGS);
  properties[PROP_EMULATOR_SERVER] =
    g_param_spec_object ("emulator-server", NULL, NULL,
                        SRT_TYPE_EMULATOR_SERVER,
                        G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                        G_PARAM_STATIC_STRINGS);
  properties[PROP_ENVIRON] =
    g_param_spec_boxed ("environ", NULL, NULL, G_TYPE_STRV,
                        G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                        G_PARAM_STATIC_STRINGS);
  properties[PROP_HELPERS_PATH] =
    g_param_spec_string ("helpers-path", NULL, NULL, NULL,
                         G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                         G_PARAM_STATIC_STRINGS);
  properties[PROP_SYSROOT] =
    g_param_spec_object ("sysroot", NULL, NULL, SRT_TYPE_SYSROOT,
                         G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                         G_PARAM_STATIC_STRINGS);
  properties[PROP_TEST_FLAGS] =
    g_param_spec_flags ("test-flags", NULL, NULL,
                        SRT_TYPE_TEST_FLAGS, SRT_TEST_FLAGS_NONE,
                        G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                        G_PARAM_STATIC_STRINGS);
  properties[PROP_WORKING_DIRECTORY] =
    g_param_spec_string ("working-directory", NULL, NULL, NULL,
                         G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                         G_PARAM_STATIC_STRINGS);

  g_object_class_install_properties (object_class, N_PROPERTIES, properties);
}

SrtSubprocessRunner *
_srt_subprocess_runner_new_swap_envp (SrtSubprocessRunner *self,
                                      const char * const *envp)
{
  g_return_val_if_fail (SRT_IS_SUBPROCESS_RUNNER (self), NULL);
  return _srt_subprocess_runner_new_full (self->emulator,
                                          self->emulator_server,
                                          envp,
                                          self->bin_path,
                                          self->helpers_path,
                                          self->sysroot,
                                          self->test_flags,
                                          self->working_directory);
}

SrtSubprocessRunner *
_srt_subprocess_runner_new_swap_helpers_path (SrtSubprocessRunner *self,
                                              const char *path)
{
  g_return_val_if_fail (SRT_IS_SUBPROCESS_RUNNER (self), NULL);
  return _srt_subprocess_runner_new_full (self->emulator,
                                          self->emulator_server,
                                          _srt_const_strv (self->envp),
                                          self->bin_path,
                                          path,
                                          self->sysroot,
                                          self->test_flags,
                                          self->working_directory);
}

SrtSubprocessRunner *
_srt_subprocess_runner_new_swap_sysroot (SrtSubprocessRunner *self,
                                         SrtSysroot *sysroot)
{
  g_return_val_if_fail (SRT_IS_SUBPROCESS_RUNNER (self), NULL);
  return _srt_subprocess_runner_new_full (self->emulator,
                                          self->emulator_server,
                                          _srt_const_strv (self->envp),
                                          self->bin_path,
                                          self->helpers_path,
                                          sysroot,
                                          self->test_flags,
                                          self->working_directory);
}

SrtSubprocessRunner *
_srt_subprocess_runner_new_swap_test_flags (SrtSubprocessRunner *self,
                                            SrtTestFlags flags)
{
  g_return_val_if_fail (SRT_IS_SUBPROCESS_RUNNER (self), NULL);
  return _srt_subprocess_runner_new_full (self->emulator,
                                          self->emulator_server,
                                          _srt_const_strv (self->envp),
                                          self->bin_path,
                                          self->helpers_path,
                                          self->sysroot,
                                          flags,
                                          self->working_directory);
}

SrtSubprocessRunner *
_srt_subprocess_runner_new_swap_working_directory (SrtSubprocessRunner *self,
                                                   const char *working_directory)
{
  g_return_val_if_fail (SRT_IS_SUBPROCESS_RUNNER (self), NULL);
  return _srt_subprocess_runner_new_full (self->emulator,
                                          self->emulator_server,
                                          _srt_const_strv (self->envp),
                                          self->bin_path,
                                          self->helpers_path,
                                          self->sysroot,
                                          self->test_flags,
                                          working_directory);
}

/*
 * Returns: The emulator, or %NULL if none.
 */
SrtEmulator *
_srt_subprocess_runner_get_emulator (SrtSubprocessRunner *self)
{
  g_return_val_if_fail (SRT_IS_SUBPROCESS_RUNNER (self), NULL);
  return self->emulator;
}

/*
 * Returns: The environment. Never %NULL unless a programming error occurs.
 */
const char * const *
_srt_subprocess_runner_get_environ (SrtSubprocessRunner *self)
{
  g_return_val_if_fail (SRT_IS_SUBPROCESS_RUNNER (self), NULL);
  return _srt_const_strv (self->envp);
}

/*
 * Returns: The value of environment variable @var, or %NULL if unset.
 */
const char *
_srt_subprocess_runner_getenv (SrtSubprocessRunner *self,
                               const char *var)
{
  g_return_val_if_fail (SRT_IS_SUBPROCESS_RUNNER (self), NULL);
  return g_environ_getenv (self->envp, var);
}

/*
 * Returns: The path to `steam-runtime-launch-client` and so on,
 *  or %NULL to use a default.
 */
const char *
_srt_subprocess_runner_get_bin_path (SrtSubprocessRunner *self)
{
  g_return_val_if_fail (SRT_IS_SUBPROCESS_RUNNER (self), NULL);
  return self->bin_path;
}

/*
 * Returns: The path to `x86_64-linux-gnu-check-gl` and so on,
 *  or %NULL to use a default.
 */
const char *
_srt_subprocess_runner_get_helpers_path (SrtSubprocessRunner *self)
{
  g_return_val_if_fail (SRT_IS_SUBPROCESS_RUNNER (self), NULL);
  return self->helpers_path;
}

/*
 * Returns: The path to `x86_64-linux-gnu-check-gl` and so on,
 *  or %NULL if unable to find a suitable path.
 */
const char *
_srt_subprocess_runner_resolve_helpers_path (SrtSubprocessRunner *self,
                                             GError **error)
{
  const char *helpers_path;

  g_return_val_if_fail (SRT_IS_SUBPROCESS_RUNNER (self), NULL);

  /* Prefer a helper from ${SRT_HELPERS_PATH} or
   * ${libexecdir}/steam-runtime-tools-${_SRT_API_MAJOR}
   * if it exists */
  helpers_path = self->helpers_path;

  if (helpers_path == NULL)
    helpers_path = g_getenv ("SRT_HELPERS_PATH");

  if (helpers_path == NULL
      && _srt_find_myself (NULL, &helpers_path, error) == NULL)
    return NULL;

  g_return_val_if_fail (helpers_path != NULL, NULL);
  return helpers_path;
}

/*
 * Returns: (transfer none): A sysroot, or %NULL as shorthand
 *  for _srt_sysroot_new_direct()
 */
SrtSysroot *
_srt_subprocess_runner_get_sysroot (SrtSubprocessRunner *self)
{
  g_return_val_if_fail (SRT_IS_SUBPROCESS_RUNNER (self), NULL);
  return self->sysroot;
}

/*
 * Returns: Test flags
 */
SrtTestFlags
_srt_subprocess_runner_get_test_flags (SrtSubprocessRunner *self)
{
  g_return_val_if_fail (SRT_IS_SUBPROCESS_RUNNER (self), SRT_TEST_FLAGS_NONE);
  return self->test_flags;
}

/*
 * Returns: The working directory for subprocesses, or %NULL to inherit
 */
const char *
_srt_subprocess_runner_get_working_directory (SrtSubprocessRunner *self)
{
  g_return_val_if_fail (SRT_IS_SUBPROCESS_RUNNER (self), NULL);
  return self->working_directory;
}

/*
 * Append @ld_so and an appropriate `--library-path` to @argv,
 * so that subsequent items in @argv will run as if they were in
 * `self->sysroot`.
 *
 * This assumes that `self->sysroot` is set up in a convenient way:
 * symlinks must be relative, and library directories must be something
 * that we know about, for example Debian multiarch, FHS/Red Hat multilib
 * or Arch multilib.
 *
 * For example, if the i386 stack is in /opt/i386, we might run:
 *
 * ```
 * /opt/i386/lib/ld-linux.so.2 \
 * --library-path /opt/i386/usr/lib/i386-linux-gnu:... \
 * /path/to/i386-linux-gnu-capsule-capture-libs ...
 * ```
 */
static void
_srt_subprocess_runner_append_ld_so (SrtSubprocessRunner *self,
                                     const SrtKnownArchitecture *known_arch,
                                     GPtrArray *argv)
{
  g_autoptr(GPtrArray) libdirs = NULL;
  g_autoptr(GString) lib_path = g_string_new ("");
  const char *ld_so;
  const char *ldlp;

  g_return_if_fail (self != NULL);
  g_return_if_fail (self->sysroot != NULL);
  g_return_if_fail (argv != NULL);
  g_return_if_fail (known_arch != NULL);
  g_return_if_fail (known_arch->interoperable_runtime_linker != NULL);

  ld_so = known_arch->interoperable_runtime_linker;

  /* If we would have used a custom LD_LIBRARY_PATH when calling
   * executables outside the sysroot, we want to make use of that
   * when calling executables "inside" the sysroot. */
  ldlp = _srt_subprocess_runner_getenv (self, "LD_LIBRARY_PATH");

  if (ldlp != NULL)
    {
      g_auto(GStrv) entries = g_strsplit_set (ldlp, ":;", 0);

      for (size_t i = 0; entries != NULL && entries[i] != NULL; i++)
        {
          const char *path = entries[i];
          g_autofree char *canonicalized = NULL;
          g_autofree char *prefixed = NULL;

          if (path[0] == '\0')
            path = ".";

          /* e.g. this might be /home/me/.steam/steam/ubuntu12_32
           * or /usr/lib/sdl2-compat */
          canonicalized = g_canonicalize_filename (path, NULL);
          /* e.g. this might be /opt/i386/home/me/.steam/steam/ubuntu12_32
           * or /opt/i386/usr/lib/sdl2-compat */
          prefixed = g_build_filename (self->sysroot->path,
                                       canonicalized,
                                       NULL);
          /* We don't know whether entries in LD_LIBRARY_PATH are
           * meant to be in the sysroot or in the
           * current execution environment, so try both */
          _srt_search_path_append (lib_path, prefixed);
          _srt_search_path_append (lib_path, canonicalized);
        }
    }

  libdirs = _srt_known_architecture_get_libdirs (known_arch->multiarch_tuple,
                                                 known_arch,
                                                 SRT_LIBDIRS_FLAGS_NONE);

  for (size_t i = 0; i < libdirs->len; i++)
    {
      /* e.g. /usr/lib32 */
      const char *path = g_ptr_array_index (libdirs, i);
      g_autofree char *prefixed = NULL;

      g_warn_if_fail (g_path_is_absolute (path));

      /* e.g. /opt/i386/usr/lib32 */
      prefixed = g_build_filename (self->sysroot->path, path, NULL);
      _srt_search_path_append (lib_path, prefixed);
    }

  /* e.g. /opt/i386/lib/ld-linux.so.2 */
  g_ptr_array_add (argv, g_build_filename (self->sysroot->path, ld_so, NULL));
  g_ptr_array_add (argv, g_strdup ("--library-path"));
  g_ptr_array_add (argv, g_string_free_and_steal (g_steal_pointer (&lib_path)));

  /* We have to hope that the next argument does not start with "-"
   * because older versions of ld.so, such as the one in glibc 2.31
   * (Debian 11 and sniper), don't support the "--" pseudo-argument;
   * but in practice none of our helpers have such inadvisable names,
   * so this is fine. */
}

/*
 * _srt_subprocess_runner_get_helper:
 * @runner: The execution environment
 * @multiarch: (nullable): A multiarch tuple like %SRT_ABI_I386 to prefix
 *  to the executable name, or %NULL
 * @known_arch: (nullable): Details of @multiarch if it is a known
 *  architecture
 * @base: (not nullable): Base name of the executable
 * @flags: Flags affecting how we set up the helper
 * @error: Used to raise an error if %NULL is returned
 *
 * Find a helper executable.
 *
 * We return an array of arguments so that the
 * helper can be wrapped by an "adverb" like `env`, `timeout` or a
 * specific `ld.so` implementation if required.
 *
 * If @multiarch is non-%NULL, @known_arch must either be %NULL
 * or the same architecture.
 * If @multiarch is %NULL, @known_arch must be %NULL too.
 * It is only necessary to provide a non-%NULL @known_arch if the @flags
 * include %SRT_HELPER_FLAGS_WORKS_IN_SYSROOT and/or
 * %SRT_HELPER_FLAGS_SYSROOT_AWARE.
 *
 * Returns: (nullable) (element-type filename) (transfer container): The
 *  initial `argv` for the helper, with g_free() set as the free-function, and
 *  no %NULL terminator. Free with g_ptr_array_unref() or g_ptr_array_free().
 */
GPtrArray *
_srt_subprocess_runner_get_helper (SrtSubprocessRunner *self,
                                   const char *multiarch,
                                   const SrtKnownArchitecture *known_arch,
                                   const char *base,
                                   SrtHelperFlags flags,
                                   GError **error)
{
  g_autofree gchar *bin_path = NULL;
  const char *helpers_path;
  g_autoptr(GPtrArray) argv = NULL;
  g_autofree gchar *path = NULL;
  g_autofree gchar *prefixed = NULL;

  g_return_val_if_fail (_srt_check_not_setuid (), NULL);
  g_return_val_if_fail (base != NULL, NULL);
  g_return_val_if_fail (known_arch == NULL || multiarch != NULL, NULL);
  g_return_val_if_fail (known_arch == NULL
                        || g_str_equal (known_arch->multiarch_tuple, multiarch), NULL);
  g_return_val_if_fail (error == NULL || *error == NULL, NULL);

  argv = g_ptr_array_new_with_free_func (g_free);

  if (self->sysroot != NULL
      && !_srt_sysroot_is_direct (self->sysroot)
      && !(self->test_flags & SRT_TEST_FLAGS_HELPERS_WORK_IN_SYSROOT))
    {
      if (flags & SRT_HELPER_FLAGS_WORKS_IN_SYSROOT)
        {
          if (known_arch != NULL
              && known_arch->interoperable_runtime_linker != NULL)
            {
              _srt_subprocess_runner_append_ld_so (self, known_arch, argv);
            }
          else
            {
              g_set_error (error, G_IO_ERROR, G_IO_ERROR_NOT_SUPPORTED,
                           "Helper \"%s\" can't be used in sysroot \"%s\" "
                           "without knowing the appropriate ld.so(8)",
                           base, self->sysroot->path);
              return NULL;
            }
        }
      else if (flags & SRT_HELPER_FLAGS_SYSROOT_AWARE)
        {
          if (known_arch != NULL
              && known_arch->interoperable_runtime_linker != NULL
              && !g_file_test (known_arch->interoperable_runtime_linker,
                               G_FILE_TEST_IS_EXECUTABLE))
            _srt_subprocess_runner_append_ld_so (self, known_arch, argv);
        }
      else
        {
          g_set_error (error, G_IO_ERROR, G_IO_ERROR_NOT_SUPPORTED,
                       "Helper \"%s\" can't be used in sysroot \"%s\"",
                       base, self->sysroot->path);
          return NULL;
        }
    }

  if (flags & SRT_HELPER_FLAGS_IN_BIN_DIR)
    {
      /* Prefer a program from ${SRT_BIN_PATH} or ${bindir} if it exists */
      helpers_path = self->bin_path;

      if (helpers_path == NULL)
        helpers_path = g_getenv ("SRT_BIN_PATH");

      if (helpers_path == NULL)
        {
          const char *prefix = _srt_find_myself (NULL, NULL, error);

          if (prefix == NULL)
            return NULL;

          bin_path = g_build_filename (prefix, "bin", NULL);
          helpers_path = bin_path;
        }
    }
  else
    {
      helpers_path = _srt_subprocess_runner_resolve_helpers_path (self, error);

      if (helpers_path == NULL)
        return NULL;
    }

  path = g_strdup_printf ("%s/%s%s%s",
                          helpers_path,
                          multiarch == NULL ? "" : multiarch,
                          multiarch == NULL ? "" : "-",
                          base);

  g_debug ("Looking for %s", path);

  if (g_file_test (path, G_FILE_TEST_IS_EXECUTABLE))
    {
      g_ptr_array_add (argv, g_steal_pointer (&path));
      return g_steal_pointer (&argv);
    }

  if ((flags & SRT_HELPER_FLAGS_SEARCH_PATH) == 0)
    {
      g_set_error (error, G_IO_ERROR, G_IO_ERROR_NOT_FOUND,
                   "%s not found", path);
      return NULL;
    }

  /* For helpers that are not part of steam-runtime-tools
   * (historically this included *-wflinfo), we fall back to searching $PATH */

  if (multiarch == NULL)
    prefixed = g_strdup (base);
  else
    prefixed = g_strdup_printf ("%s-%s", multiarch, base);

  g_ptr_array_add (argv, g_steal_pointer (&prefixed));
  return g_steal_pointer (&argv);
}

typedef struct
{
  SrtHelperFlags flags;
} ChildSetupData;

static void
_srt_subprocess_runner_child_setup_cb (gpointer user_data)
{
  const ChildSetupData *data = user_data;

  /* Note that we can't use the GError here, because a GSpawnChildSetupFunc
   * needs to follow signal-safety(7) rules.
   *
   * Reporting this internal error as though terminated by SIGABRT is somewhat
   * arbitrary. */
  if ((data->flags & SRT_HELPER_FLAGS_TERMINATE_WITH_PARENT)
      && !_srt_raise_on_parent_death (SIGTERM, NULL))
    _srt_async_signal_safe_error ("srt-subprocess-runner",
                                  "Failed to set up parent-death signal",
                                  128 + SIGABRT);

  /* Unblock all signals and reset signal disposition to SIG_DFL */
  _srt_child_setup_unblock_signals (NULL);
}

static SrtEmulator *
_srt_subprocess_runner_get_emulator_for_arch (SrtSubprocessRunner *self,
                                              GQuark architecture)
{
  const GQuark *archs;
  size_t n = 0;

  g_return_val_if_fail (architecture != SRT_ARCHITECTURE_QUARK_NONE, NULL);

  if (self->emulator == NULL)
    return NULL;

  archs = _srt_emulator_get_emulated_architectures (self->emulator, &n);

  for (size_t i = 0; i < n; i++)
    {
      if (archs[i] == architecture)
        return self->emulator;
    }

  return NULL;
}

/*
 * _srt_subprocess_runner_await_emulator:
 * @self: The subprocess runner
 * @architecture: An architecture tuple, or %SRT_ARCHITECTURE_QUARK_NONE
 *  to wait for any emulator(s) in use regardless of architecture
 * @emulator_out: (out) (transfer none) (optional) (nullable): On success,
 *  used to return a pointer to the emulator,
 *  valid as long as a reference to @self is held
 * @emulator_out: (out) (transfer none) (optional) (nullable): On success,
 *  used to return a pointer to the emulator server,
 *  valid as long as a reference to @self is held
 *
 * If the emulator for @self has an associated server,
 * block the current thread until it is ready,
 * returning %FALSE if that fails.
 *
 * On success,
 * put a pointer to the emulator (if any) in @emulator_out
 * and a pointer to the emulator server (if any) in @emulator_server_out,
 * and return %TRUE.
 *
 * Returns: %TRUE on success
 */
gboolean
_srt_subprocess_runner_await_emulator (SrtSubprocessRunner *self,
                                       GQuark architecture,
                                       SrtEmulator **emulator_out,
                                       SrtEmulatorServer **emulator_server_out,
                                       GError **error)
{
  SrtEmulator *emulator;

  g_return_val_if_fail (SRT_IS_SUBPROCESS_RUNNER (self), FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  if (emulator_out != NULL)
    *emulator_out = NULL;

  if (emulator_server_out != NULL)
    *emulator_server_out = NULL;

  if (architecture == SRT_ARCHITECTURE_QUARK_NONE)
    emulator = _srt_subprocess_runner_get_emulator (self);
  else
    emulator = _srt_subprocess_runner_get_emulator_for_arch (self, architecture);

  if (emulator != NULL
      && self->emulator_server != NULL
      && !_srt_emulator_server_wait_for_ready (self->emulator_server,
                                               error))
    return FALSE;

  if (emulator_out != NULL)
    *emulator_out = emulator;

  if (emulator_server_out != NULL)
    *emulator_server_out = self->emulator_server;

  return TRUE;
}

static gboolean
_srt_subprocess_runner_spawn (SrtSubprocessRunner *self,
                              SrtHelperFlags flags,
                              GQuark architecture,
                              const char * const *argv,
                              SrtSubprocessOutput stdout_mode,
                              SrtSubprocessOutput stderr_mode,
                              SrtSubprocess *subprocess,
                              GError **error)
{
  g_autoptr(GPtrArray) modified_argv = NULL;
  g_auto(GStrv) my_environ = NULL;
  ChildSetupData child_setup_data = { .flags = flags };
  SrtEmulator *emulator = NULL;
  GSpawnFlags spawn_flags = G_SPAWN_DO_NOT_REAP_CHILD;
  int *stdout_fdp = NULL;
  int *stderr_fdp = NULL;
  unsigned sigterm_seconds = 0;
  unsigned sigkill_seconds = 0;

  if (flags & SRT_HELPER_FLAGS_LIBGL_VERBOSE)
    {
      if (my_environ == NULL)
        my_environ = g_strdupv (self->envp);

      my_environ = g_environ_setenv (my_environ, "LIBGL_DEBUG", "verbose", TRUE);
    }

  if (flags & SRT_HELPER_FLAGS_SEARCH_PATH)
    spawn_flags |= G_SPAWN_SEARCH_PATH;

  if (flags & SRT_HELPER_FLAGS_LEAVE_FDS_OPEN)
    spawn_flags |= G_SPAWN_LEAVE_DESCRIPTORS_OPEN;

  if ((flags & SRT_HELPER_FLAGS_TIME_OUT) == 0)
    {
      trace ("Unlimited timeout");
    }
  else
    {
      if (self->test_flags & SRT_TEST_FLAGS_TIME_OUT_SOONER)
        {
          /* Speed up the failing case in automated testing */
          sigterm_seconds = sigkill_seconds = 1;
        }
      else
        {
          /* Send SIGTERM after 10 seconds. If still running 3 seconds later,
           * send SIGKILL */
          sigterm_seconds = 10;
          sigkill_seconds = 3;
        }
    }

  subprocess->flags = flags;
  subprocess->out_mode = stdout_mode;
  subprocess->err_mode = stderr_mode;
  subprocess->sigterm_seconds = sigterm_seconds;
  subprocess->sigkill_seconds = sigkill_seconds;
  subprocess->can_use_waitid = self->can_use_waitid;

  switch (stdout_mode)
    {
      case SRT_SUBPROCESS_OUTPUT_CAPTURE:
      case SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG:
        subprocess->out = g_string_new ("");
        stdout_fdp = &subprocess->stdout_fd;
        break;

      case SRT_SUBPROCESS_OUTPUT_INHERIT:
        break;

      case SRT_SUBPROCESS_OUTPUT_SILENCE:
        spawn_flags |= G_SPAWN_STDOUT_TO_DEV_NULL;
        break;

      default:
        g_return_val_if_reached (FALSE);
    }

  switch (stderr_mode)
    {
      case SRT_SUBPROCESS_OUTPUT_CAPTURE:
      case SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG:
        subprocess->err = g_string_new ("");
        stderr_fdp = &subprocess->stderr_fd;
        break;

      case SRT_SUBPROCESS_OUTPUT_INHERIT:
        break;

      case SRT_SUBPROCESS_OUTPUT_SILENCE:
        spawn_flags |= G_SPAWN_STDERR_TO_DEV_NULL;
        break;

      default:
        g_return_val_if_reached (FALSE);
    }

  if (architecture != SRT_ARCHITECTURE_QUARK_NONE
      && !_srt_subprocess_runner_await_emulator (self,
                                                 architecture,
                                                 &emulator,
                                                 NULL,
                                                 error))
    return FALSE;

  if (emulator != NULL)
    {
      const char * const *emulator_argv = _srt_emulator_get_argv (emulator);
      const SrtEnvOverlay *env;

      modified_argv = g_ptr_array_new_with_free_func (g_free);

      for (size_t i = 0; emulator_argv[i] != NULL; i++)
        g_ptr_array_add (modified_argv, g_strdup (emulator_argv[i]));

      if (strchr (argv[0], '/') == NULL)
        {
          if (flags & SRT_HELPER_FLAGS_SEARCH_PATH)
            {
              /* The emulator might not search PATH for executables
               * (in particular, FEX doesn't) so we need to implement
               * that ourselves. */
              g_autofree char *in_path = g_find_program_in_path (argv[0]);

              if (in_path == NULL)
                {
                  g_set_error (error, G_SPAWN_ERROR, G_SPAWN_ERROR_FAILED,
                               "\"%s\" not found in PATH", argv[0]);
                  return FALSE;
                }

              g_ptr_array_add (modified_argv, g_steal_pointer (&in_path));
            }
          else
            {
              /* In principle the emulator might search PATH for executables,
               * so for consistency, arrange for it to not. */
              g_ptr_array_add (modified_argv, g_strdup_printf ("./%s", argv[0]));
            }
        }
      else
        {
          /* Absolute or relative path, can use as-is */
          g_ptr_array_add (modified_argv, g_strdup (argv[0]));
        }

      for (size_t i = 1; argv[i] != NULL; i++)
        g_ptr_array_add (modified_argv, g_strdup (argv[i]));

      g_ptr_array_add (modified_argv, NULL);
      argv = (const char * const *) modified_argv->pdata;

      /* The emulator path from _srt_emulator_get_argv() is absolute,
       * but just to ensure consistency, don't search the path for it. */
      flags &= ~SRT_HELPER_FLAGS_SEARCH_PATH;

      env = _srt_emulator_get_environment (emulator);

      if (!_srt_env_overlay_is_empty (env))
        {
          if (my_environ == NULL)
            my_environ = g_strdupv (self->envp);

          my_environ = _srt_env_overlay_apply (env, my_environ);
        }
    }

  if (!(flags & SRT_HELPER_FLAGS_QUIET))
    {
      g_autoptr(GString) command = g_string_new ("");

      for (size_t i = 0; argv[i] != NULL; i++)
        {
          g_autofree gchar *quoted = g_shell_quote (argv[i]);

          g_string_append_printf (command, " %s", quoted);
        }

      g_debug ("run:%s", command->str);
    }

  return g_spawn_async_with_pipes (self->working_directory,
                                   (gchar **) argv,
                                   my_environ != NULL ? my_environ : self->envp,
                                   spawn_flags,
                                   _srt_subprocess_runner_child_setup_cb,
                                   &child_setup_data,
                                   &subprocess->pid,
                                   NULL,
                                   stdout_fdp,
                                   stderr_fdp,
                                   error);
}

/*
 * _srt_subprocess_runner_run_sync:
 * @self: The subprocess runner
 * @flags: Flags affecting how we run @argv
 * @architecture: The architecture of @argv, used to select an emulator
 *  if appropriate, or %SRT_ARCHITECTURE_QUARK_NONE (= 0) to assume that
 *  it is directly runnable
 * @argv: The executable and arguments to run
 * @stdout_mode: Whether to capture stdout, send it to the stdout of the
 *  current process, or send it to /dev/null
 * @stderr_mode: Same as @stdout_mode, but for stderr
 * @error: Used to raise an error on failure
 *
 * Run a subprocess and wait for it to finish.
 * If a subprocess was run (even if it timed out, crashed, or exited with a
 * nonzero status), return a non-%NULL #SrtCompletedSubprocess object.
 * If no subprocess could be run, return %NULL with @error set.
 *
 * This is functionally similar to Python `subprocess.run(check=False)`.
 *
 * Returns: (transfer full): an object representing the completed subprocess,
 *  or %NULL on failure to start it
 */
SrtCompletedSubprocess *
_srt_subprocess_runner_run_sync (SrtSubprocessRunner *self,
                                 SrtHelperFlags flags,
                                 GQuark architecture,
                                 const char * const *argv,
                                 SrtSubprocessOutput stdout_mode,
                                 SrtSubprocessOutput stderr_mode,
                                 GError **error)
{
  g_auto(SrtSubprocess) subprocess = SRT_SUBPROCESS_INIT;

  g_return_val_if_fail (argv != NULL, NULL);
  g_return_val_if_fail (argv[0] != NULL, NULL);

  if (!_srt_subprocess_runner_spawn (self, flags,
                                     architecture, argv,
                                     stdout_mode, stderr_mode,
                                     &subprocess, error))
    return NULL;

  _srt_subprocess_complete_sync (&subprocess);

  if (!_srt_subprocess_check_no_error (&subprocess, error))
    return NULL;

  return _srt_completed_subprocess_new_from_subprocess (&subprocess);
}
