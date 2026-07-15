/*
 * Copyright © 2025 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#include "steam-runtime-tools/subprocess-internal.h"

#include "steam-runtime-tools/architecture-internal.h"
#include "steam-runtime-tools/utils-internal.h"
#include "test-utils.h"

typedef struct
{
  TestsOpenFdSet old_fds;
  GError *error;
  SrtEmulator *emulator;
  gchar *real_true;
  gchar *mock_true;
  GStrv argv;
  GQuark emulated_arch;
  GQuark native_arch;
} Fixture;

typedef struct
{
  int unused;
} Config;

static void
setup (Fixture *f,
       gconstpointer context)
{
  G_GNUC_UNUSED const Config *config = context;
  g_autoptr(GPtrArray) argv = NULL;
  g_autofree char *json = NULL;

  f->native_arch = g_quark_from_static_string ("mock-native");
  f->emulated_arch = g_quark_from_static_string ("mock-emulated");

  /* The default GMainContext is created and never freed, and it owns
   * a GWakeup, which owns a file descriptor; so we have to ensure that
   * it exists before we start tracking whether our own code has leaked
   * any file descriptors. */
  g_main_context_default ();

  f->old_fds = tests_check_fd_leaks_enter ();

  f->real_true = g_find_program_in_path ("true");
  g_assert_nonnull (f->real_true);
  f->mock_true = g_test_build_filename (G_TEST_BUILT, "mock-true", NULL);

  json = g_test_build_filename (G_TEST_DIST, "emulator-mock.json", NULL);
  f->emulator = _srt_emulator_new_from_manifest (json, &f->error);
  g_assert_no_error (f->error);

  argv = g_ptr_array_new_with_free_func (g_free);
  g_ptr_array_add (argv, g_strdup (f->mock_true));
  g_ptr_array_add (argv, g_strdup ("--arg"));
  g_ptr_array_add (argv, g_strdup ("argh!"));
  g_ptr_array_add (argv, NULL);
  f->argv = (gchar **) g_ptr_array_free (g_steal_pointer (&argv), FALSE);
}

static void
teardown (Fixture *f,
          gconstpointer context)
{
  G_GNUC_UNUSED const Config *config = context;

  g_clear_error (&f->error);
  g_clear_object (&f->emulator);
  g_free (f->mock_true);
  g_free (f->real_true);
  g_strfreev (f->argv);

  tests_check_fd_leaks_leave (f->old_fds);
}

static void
dump_error (const char *label,
            const GError *error)
{
  if (error == NULL)
    g_test_message ("%s -> no error", label);
  else
    g_test_message ("%s -> %s %d %s",
                    label,
                    g_quark_to_string (error->domain),
                    error->code,
                    error->message);
}

/*
 * Exercises a very basic successful command
 */
static void
test_basic (Fixture *f,
            gconstpointer context)
{
  g_autoptr(SrtSubprocessRunner) runner = NULL;
  g_autoptr(SrtCompletedSubprocess) completed = NULL;
  g_auto(GStrv) environ_copy = NULL;
  g_autofree char *bin_path_copy = NULL;
  g_autofree char *helpers_path_copy = NULL;
  SrtTestFlags flags_copy = (SrtTestFlags) -1;
  const char *path;
  int wait_status = -1;
  int exit_status = -1;
  int terminating_signal = -1;
  gboolean ok;
  gboolean timed_out = TRUE;

  runner = _srt_subprocess_runner_new_full (NULL,     /* emulator */
                                            NULL,     /* emulator server */
                                            NULL,     /* envp */
                                            "/path/to/bin",
                                            "/path/to/libexec/steam-runtime-tools-0",
                                            NULL,     /* sysroot */
                                            SRT_TEST_FLAGS_NONE,
                                            NULL);   /* cwd */
  g_assert_nonnull (_srt_subprocess_runner_get_environ (runner));
  g_assert_cmpstr (_srt_subprocess_runner_getenv (runner, "PATH"),
                   ==, g_getenv ("PATH"));
  g_assert_cmpstr (_srt_subprocess_runner_get_bin_path (runner),
                   ==, "/path/to/bin");
  g_assert_cmpstr (_srt_subprocess_runner_get_helpers_path (runner),
                   ==, "/path/to/libexec/steam-runtime-tools-0");
  path = _srt_subprocess_runner_resolve_helpers_path (runner, &f->error);
  g_assert_no_error (f->error);
  g_assert_cmpstr (path, ==, "/path/to/libexec/steam-runtime-tools-0");
  g_assert_cmpint (_srt_subprocess_runner_get_test_flags (runner),
                   ==, SRT_TEST_FLAGS_NONE);

  g_object_get (runner,
                "bin-path", &bin_path_copy,
                "environ", &environ_copy,
                "helpers-path", &helpers_path_copy,
                "test-flags", &flags_copy,
                NULL);
  g_assert_nonnull (environ_copy);
  g_assert_cmpstr (g_environ_getenv (environ_copy, "PATH"),
                   ==, g_getenv ("PATH"));
  g_assert_cmpstr (bin_path_copy, ==, "/path/to/bin");
  g_assert_cmpstr (helpers_path_copy, ==, "/path/to/libexec/steam-runtime-tools-0");
  g_assert_cmpint (flags_copy, ==, SRT_TEST_FLAGS_NONE);

  /* We don't actually assert that the command is not logged, only that
   * asking for it not to be logged doesn't crash. */
  completed = _srt_subprocess_runner_run_sync (runner,
                                               SRT_HELPER_FLAGS_QUIET,
                                               SRT_ARCHITECTURE_QUARK_NONE,
                                               _srt_const_strv (f->argv),
                                               SRT_SUBPROCESS_OUTPUT_CAPTURE,
                                               SRT_SUBPROCESS_OUTPUT_INHERIT,
                                               &f->error);
  g_assert_no_error (f->error);
  g_assert_nonnull (completed);
  _srt_completed_subprocess_check (completed, &f->error);
  g_assert_no_error (f->error);
  g_assert_cmpstr (_srt_completed_subprocess_get_stdout (completed),
                   ==, "");
  /* stderr wasn't captured */
  g_assert_null (_srt_completed_subprocess_get_stderr (completed));

  ok = _srt_completed_subprocess_report (completed,
                                         &wait_status,
                                         &exit_status,
                                         &terminating_signal,
                                         &timed_out);
  g_assert_cmpint (exit_status, ==, 0);
  g_assert_cmpint (wait_status, ==, 0);
  g_assert_cmpint (terminating_signal, ==, 0);
  g_assert_true (ok);
  g_assert_false (timed_out);
}

/*
 * Exercises capture of stdout and stderr.
 * Also exercises a nonzero exit status, TIME_OUT in the trivial case where
 * the command doesn't take too long, and the default bin_path and helpers_path.
 */
static void
test_capture (Fixture *f,
              gconstpointer context)
{
  static const char * const produce_output[] =
    {
      "/bin/sh", "-c", "echo STD''OUT; echo STD''ERR >&2; exit 137", NULL
    };
  g_autoptr(SrtSubprocessRunner) runner = _srt_subprocess_runner_new ();
  g_autoptr(SrtCompletedSubprocess) completed = NULL;
  g_auto(GStrv) environ_copy = NULL;
  g_autofree char *bin_path_copy = NULL;
  g_autofree char *helpers_path_copy = NULL;
  g_autofree char *out = NULL;
  g_autofree char *out2 = NULL;
  g_autofree char *err = NULL;
  g_autofree char *err2 = NULL;
  SrtTestFlags flags_copy = (SrtTestFlags) -1;
  const char *path;
  int wait_status = -1;
  int exit_status = -1;
  int terminating_signal = -1;
  gboolean ok;
  gboolean timed_out = TRUE;


  g_assert_nonnull (_srt_subprocess_runner_get_environ (runner));
  g_assert_cmpstr (_srt_subprocess_runner_getenv (runner, "PATH"),
                   ==, g_getenv ("PATH"));
  g_assert_cmpstr (_srt_subprocess_runner_get_bin_path (runner), ==, NULL);
  g_assert_cmpstr (_srt_subprocess_runner_get_helpers_path (runner), ==, NULL);
  path = _srt_subprocess_runner_resolve_helpers_path (runner, &f->error);
  g_assert_no_error (f->error);
  g_test_message ("resolve helpers path -> %s", path);

  if (g_getenv ("SRT_HELPERS_PATH") != NULL)
    g_assert_cmpstr (path, ==, g_getenv ("SRT_HELPERS_PATH"));

  g_assert_cmpint (_srt_subprocess_runner_get_test_flags (runner),
                   ==, SRT_TEST_FLAGS_NONE);

  g_object_get (runner,
                "bin-path", &bin_path_copy,
                "environ", &environ_copy,
                "helpers-path", &helpers_path_copy,
                "test-flags", &flags_copy,
                NULL);
  g_assert_nonnull (environ_copy);
  g_assert_cmpstr (g_environ_getenv (environ_copy, "PATH"),
                   ==, g_getenv ("PATH"));
  g_assert_cmpstr (bin_path_copy, ==, NULL);
  g_assert_cmpstr (helpers_path_copy, ==, NULL);
  g_assert_cmpint (flags_copy, ==, SRT_TEST_FLAGS_NONE);

  completed = _srt_subprocess_runner_run_sync (runner,
                                               SRT_HELPER_FLAGS_TIME_OUT,
                                               SRT_ARCHITECTURE_QUARK_NONE,
                                               produce_output,
                                               SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
                                               SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
                                               &f->error);
  g_assert_no_error (f->error);
  g_assert_nonnull (completed);
  _srt_completed_subprocess_check (completed, &f->error);
  dump_error ("command that exits 137", f->error);
  g_assert_error (f->error, G_SPAWN_EXIT_ERROR, 137);
  g_assert_nonnull (strstr (f->error->message, "STDERR"));
  g_clear_error (&f->error);
  g_assert_false (_srt_completed_subprocess_timed_out (completed));

  ok = _srt_completed_subprocess_report (completed,
                                         &wait_status,
                                         &exit_status,
                                         &terminating_signal,
                                         &timed_out);
  g_assert_cmpint (exit_status, ==, 137);
  g_assert_true (WIFEXITED (wait_status));
  g_assert_cmpint (WEXITSTATUS (wait_status), ==, 137);
  g_assert_cmpint (terminating_signal, ==, 0);
  g_assert_false (ok);
  g_assert_false (timed_out);

  out = g_strdup (_srt_completed_subprocess_get_stdout (completed));
  g_assert_cmpstr (out, ==, "STDOUT\n");
  out2 = _srt_completed_subprocess_steal_stdout (completed);
  g_assert_cmpstr (out, ==, out2);
  g_assert_null (_srt_completed_subprocess_get_stdout (completed));
  g_assert_null (_srt_completed_subprocess_steal_stdout (completed));

  err = g_strdup (_srt_completed_subprocess_get_stderr (completed));
  /* We don't assert that it *is* STDERR, because there might be other
   * diagnostic/debug output on stderr; but we can assert that it
   * *contains* STDERR */
  g_assert_nonnull (strstr (err, "STDERR"));
  err2 = _srt_completed_subprocess_steal_stderr (completed);
  g_assert_cmpstr (err, ==, err2);
  g_assert_null (_srt_completed_subprocess_get_stderr (completed));
  g_assert_null (_srt_completed_subprocess_steal_stderr (completed));
}

static void
test_chdir (Fixture *f,
            gconstpointer context)
{
  g_autoptr(SrtSubprocessRunner) runner = NULL;
  g_autoptr(SrtCompletedSubprocess) completed = NULL;
  const char * const argv[] = { "pwd", NULL };

  runner = _srt_subprocess_runner_new_full (NULL,     /* emulator */
                                            NULL,     /* emulator server */
                                            NULL,     /* envp */
                                            NULL,     /* ./bin */
                                            NULL,     /* ./libexec/s-r-t-0 */
                                            NULL,     /* sysroot */
                                            SRT_TEST_FLAGS_NONE,
                                            "/");

  completed = _srt_subprocess_runner_run_sync (runner,
                                               SRT_HELPER_FLAGS_SEARCH_PATH,
                                               SRT_ARCHITECTURE_QUARK_NONE,
                                               argv,
                                               SRT_SUBPROCESS_OUTPUT_CAPTURE,
                                               SRT_SUBPROCESS_OUTPUT_INHERIT,
                                               &f->error);
  g_assert_no_error (f->error);
  g_assert_nonnull (completed);
  _srt_completed_subprocess_check (completed, &f->error);
  g_assert_no_error (f->error);
  g_assert_cmpstr (_srt_completed_subprocess_get_stdout (completed),
                   ==, "/\n");
  g_clear_object (&completed);
}

/*
 * Exercise SRT_HELPER_FLAGS_CHOMP, and incidentally also
 * SRT_HELPER_FLAGS_SEARCH_PATH.
 */
static void
test_chomp (Fixture *f,
            gconstpointer context)
{
  static struct
    {
      const char *input;
      const char *output;
    }
  tests[] =
    {
        { "hello\\n", "hello" },
        { "hello\\n\\n", "hello\n" },
        { "hello", "hello" },
        { "hello\\nworld", "hello\nworld" },
        { "", "" },
    };
  g_autoptr(SrtSubprocessRunner) runner = _srt_subprocess_runner_new ();

  for (size_t i = 0; i < G_N_ELEMENTS (tests); i++)
    {
      g_autoptr(SrtCompletedSubprocess) completed = NULL;
      const char *argv[] = { "printf", tests[i].input, NULL };

      completed = _srt_subprocess_runner_run_sync (runner,
                                                   (SRT_HELPER_FLAGS_SEARCH_PATH
                                                    | SRT_HELPER_FLAGS_CHOMP),
                                                   SRT_ARCHITECTURE_QUARK_NONE,
                                                   argv,
                                                   SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
                                                   SRT_SUBPROCESS_OUTPUT_INHERIT,
                                                   &f->error);
      g_assert_no_error (f->error);
      g_assert_nonnull (completed);
      _srt_completed_subprocess_check (completed, &f->error);
      g_assert_no_error (f->error);
      /* It removes exactly one newline */
      g_assert_cmpstr (_srt_completed_subprocess_get_stdout (completed),
                       ==, tests[i].output);
    }
}

/*
 * Exercises non-transparent emulation
 */
static void
test_emulator (Fixture *f,
               gconstpointer context)
{
  g_autoptr(SrtSubprocessRunner) runner = NULL;
  g_autoptr(SrtCompletedSubprocess) completed = NULL;
  static const struct
    {
      const char *label;
      const char *argv0;
      const char *expect_exe;
      SrtHelperFlags flags;
      gboolean expect_error;
    }
  emulation_tests[] =
    {
      {
        .label = "PATH search fails",
        .flags = SRT_HELPER_FLAGS_SEARCH_PATH,
        .argv0 = "if this exists in the PATH I will be very surprised!",
        .expect_error = TRUE,
      },
      {
        .label = "PATH search succeeds",
        .flags = SRT_HELPER_FLAGS_SEARCH_PATH,
        .argv0 = "true",
      },
      {
        .label = "PATH search not relevant because exe is relative",
        .flags = SRT_HELPER_FLAGS_SEARCH_PATH,
        .argv0 = "../relative",
        .expect_exe = "../relative",
      },
      {
        .label = "PATH search not relevant because exe is absolute",
        .flags = SRT_HELPER_FLAGS_SEARCH_PATH,
        .argv0 = "/bin/false",
        .expect_exe = "/bin/false",
      },
      {
        .label = "Not searching the PATH so we explicitly prevent it",
        .flags = SRT_HELPER_FLAGS_NONE,
        .argv0 = "just-a-basename",
        .expect_exe = "./just-a-basename",
      },
      {
        .label = "Not searching the PATH but exe is absolute anyway",
        .flags = SRT_HELPER_FLAGS_NONE,
      },
    };

  runner = _srt_subprocess_runner_new_full (f->emulator,
                                            NULL,     /* emulator server */
                                            NULL,   /* envp */
                                            NULL,   /* bin_path */
                                            NULL,   /* helpers_path */
                                            NULL,   /* sysroot */
                                            SRT_TEST_FLAGS_NONE,
                                            NULL);  /* cwd */

  /* Unspecified architecture is assumed to be directly executable */
  completed = _srt_subprocess_runner_run_sync (runner,
                                               SRT_HELPER_FLAGS_NONE,
                                               SRT_ARCHITECTURE_QUARK_NONE,
                                               _srt_const_strv (f->argv),
                                               SRT_SUBPROCESS_OUTPUT_CAPTURE,
                                               SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
                                               &f->error);
  g_assert_no_error (f->error);
  g_assert_nonnull (completed);
  _srt_completed_subprocess_check (completed, &f->error);
  g_assert_no_error (f->error);
  g_assert_cmpstr (_srt_completed_subprocess_get_stdout (completed),
                   ==, "");
  g_clear_object (&completed);

  /* Architecture with no emulator set is assumed to be directly executable */
  completed = _srt_subprocess_runner_run_sync (runner,
                                               SRT_HELPER_FLAGS_NONE,
                                               f->native_arch,
                                               _srt_const_strv (f->argv),
                                               SRT_SUBPROCESS_OUTPUT_CAPTURE,
                                               SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
                                               &f->error);
  g_assert_no_error (f->error);
  g_assert_nonnull (completed);
  _srt_completed_subprocess_check (completed, &f->error);
  g_assert_no_error (f->error);
  g_assert_cmpstr (_srt_completed_subprocess_get_stdout (completed),
                   ==, "");
  g_clear_object (&completed);

  /* Architecture with an emulator set is run via the emulator */
  for (size_t i = 0; i < G_N_ELEMENTS (emulation_tests); i++)
    {
      g_autoptr(GString) expected = NULL;
      g_auto(GStrv) argv = g_strdupv (f->argv);
      SrtHelperFlags flags = emulation_tests[i].flags;
      const char * const *emulator_argv;
      size_t argc;

      if (emulation_tests[i].argv0 != NULL)
        {
          g_clear_pointer (&argv[0], g_free);
          argv[0] = g_strdup (emulation_tests[i].argv0);
        }

      expected = g_string_new ("");
      argc = 0;
      emulator_argv = _srt_emulator_get_argv (f->emulator);

      for (size_t j = 0; emulator_argv[j] != NULL; j++)
        g_string_append_printf (expected, "argv[%zu]=%s\n", argc++, emulator_argv[j]);

      if (emulation_tests[i].expect_exe != NULL)
        g_string_append_printf (expected, "argv[%zu]=%s\n",
                                argc++, emulation_tests[i].expect_exe);
      else if (g_strcmp0 (emulation_tests[i].argv0, "true") == 0)
        g_string_append_printf (expected, "argv[%zu]=%s\n",
                                argc++, f->real_true);
      else
        g_string_append_printf (expected, "argv[%zu]=%s\n",
                                argc++, f->mock_true);

      g_string_append_printf (expected, "argv[%zu]=--arg\n", argc++);
      g_string_append_printf (expected, "argv[%zu]=argh!\n", argc++);
      g_string_append (expected, "$SET=set\n");
      g_string_append (expected, "$UNSET=unset\n");
      g_string_append (expected, "not really running it\n");
      completed = _srt_subprocess_runner_run_sync (runner,
                                                   flags,
                                                   f->emulated_arch,
                                                   _srt_const_strv (argv),
                                                   SRT_SUBPROCESS_OUTPUT_CAPTURE,
                                                   SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
                                                   &f->error);

      if (f->error == NULL)
        g_test_message ("emulation test %zu \"%s\" -> success",
                        i, emulation_tests[i].label);
      else
        g_test_message ("emulation test %zu \"%s\" -> %s %d %s",
                        i, emulation_tests[i].label,
                        g_quark_to_string (f->error->domain),
                        f->error->code,
                        f->error->message);

      if (emulation_tests[i].expect_error)
        {
          g_assert_nonnull (f->error);
          g_assert_null (completed);
          g_clear_error (&f->error);
        }
      else
        {
          g_assert_no_error (f->error);
          g_assert_nonnull (completed);
          _srt_completed_subprocess_check (completed, &f->error);
          g_assert_no_error (f->error);
          g_assert_cmpstr (_srt_completed_subprocess_get_stdout (completed),
                           ==, expected->str);
          g_clear_object (&completed);
        }
    }
}

/*
 * Exercises environment variable manipulation
 */
static void
test_environ (Fixture *f,
              gconstpointer context)
{
  g_autoptr(SrtSubprocessRunner) runner = NULL;
  g_auto(GStrv) envp = g_get_environ ();

  envp = g_environ_setenv (envp, "LD_PRELOAD",
                           "/path/to/Steam/ubuntu12_32/gameoverlayrenderer.so",
                           TRUE);
  envp = g_environ_unsetenv (envp, "LIBGL_DEBUG");

  runner = _srt_subprocess_runner_new_full (NULL,    /* emulator */
                                            NULL,     /* emulator server */
                                            _srt_const_strv (envp),
                                            NULL,    /* ./bin */
                                            NULL,    /* ./libexec/s-r-t-0 */
                                            NULL,    /* sysroot */
                                            SRT_TEST_FLAGS_NONE,
                                            NULL);   /* cwd */

  for (unsigned libgl_verbose = 0; libgl_verbose <= 1; libgl_verbose++)
    {
      static const char * const echo_vars[] =
        {
          "/bin/sh", "-c", "echo \"L_D=${LIBGL_DEBUG-unset}\"; echo \"L_P=$LD_PRELOAD\"", NULL
        };
      g_autoptr(SrtCompletedSubprocess) completed = NULL;
      SrtHelperFlags flags = SRT_HELPER_FLAGS_NONE;
      const char *out;

      if (libgl_verbose)
        flags |= SRT_HELPER_FLAGS_LIBGL_VERBOSE;

      completed = _srt_subprocess_runner_run_sync (runner,
                                                   flags,
                                                   SRT_ARCHITECTURE_QUARK_NONE,
                                                   echo_vars,
                                                   SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
                                                   SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
                                                   &f->error);
      g_assert_no_error (f->error);
      g_assert_nonnull (completed);
      _srt_completed_subprocess_check (completed, &f->error);
      g_assert_no_error (f->error);

      out = _srt_completed_subprocess_get_stdout (completed);

      if (libgl_verbose)
        g_assert_cmpstr (out, ==, "L_D=verbose\nL_P=\n");
      else
        g_assert_cmpstr (out, ==, "L_D=unset\nL_P=\n");
    }
}

/*
 * Exercises execve() failing
 */
static void
test_exec_failure (Fixture *f,
                   gconstpointer context)
{
  static const char * const argv[] = { "/dev/null", NULL };
  g_autoptr(SrtSubprocessRunner) runner = _srt_subprocess_runner_new ();
  g_autoptr(SrtCompletedSubprocess) completed = NULL;

  completed = _srt_subprocess_runner_run_sync (runner,
                                               SRT_HELPER_FLAGS_NONE,
                                               SRT_ARCHITECTURE_QUARK_NONE,
                                               argv,
                                               SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
                                               SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
                                               &f->error);
  dump_error ("command that can't be run", f->error);
  g_assert_nonnull (f->error);
}

static void
test_fds_open (Fixture *f,
               gconstpointer context)
{
  g_autoptr(SrtSubprocessRunner) runner = _srt_subprocess_runner_new ();
  g_autoptr(SrtCompletedSubprocess) completed = NULL;
  g_auto(SrtPipe) pipe_fds = _SRT_PIPE_INIT;
  g_autofree char *proc_self_fd;
  const char *argv[] = { "cat", "<placeholder>", NULL };

  _srt_pipe_open (&pipe_fds, &f->error);
  g_assert_no_error (f->error);
  /* This assumes the pipe buffer is large enough to write the whole
   * string without deadlocking, but Linux guarantees at least 1 page (4K)
   * so that should be fine */
  g_assert_no_errno (glnx_loop_write (pipe_fds.fds[_SRT_PIPE_END_WRITE],
                                      "hello", strlen ("hello")));
  g_clear_fd (&pipe_fds.fds[_SRT_PIPE_END_WRITE], &f->error);
  g_assert_no_error (f->error);

  /* Verify that the read end of the pipe was left open in the child
   * process, by reading from it and checking for the intended bytes */
  _srt_fd_unset_close_on_exec (pipe_fds.fds[_SRT_PIPE_END_READ]);
  proc_self_fd = g_strdup_printf ("/proc/self/fd/%d",
                                  pipe_fds.fds[_SRT_PIPE_END_READ]);
  argv[1] = proc_self_fd;
  completed = _srt_subprocess_runner_run_sync (runner,
                                               (SRT_HELPER_FLAGS_LEAVE_FDS_OPEN
                                                | SRT_HELPER_FLAGS_SEARCH_PATH),
                                               SRT_ARCHITECTURE_QUARK_NONE,
                                               argv,
                                               SRT_SUBPROCESS_OUTPUT_CAPTURE,
                                               SRT_SUBPROCESS_OUTPUT_INHERIT,
                                               &f->error);
  g_assert_no_error (f->error);
  g_assert_nonnull (completed);
  _srt_completed_subprocess_check (completed, &f->error);
  g_assert_no_error (f->error);
  g_assert_cmpstr (_srt_completed_subprocess_get_stdout (completed),
                   ==, "hello");
  g_clear_object (&completed);
}

/*
 * Exercises parsing of sh(1)-style exit status (128+n -> killed by signal n)
 */
static void
test_shell_exit_status (Fixture *f,
                        gconstpointer context)
{
  g_autoptr(SrtSubprocessRunner) runner = _srt_subprocess_runner_new ();

  for (unsigned parse_exit_status = 0; parse_exit_status <= 1; parse_exit_status++)
    {
      static const char * const mock_shell_sigkill[] =
        {
          "/bin/sh", "-c", "exit 137", NULL
        };
      g_autoptr(SrtCompletedSubprocess) completed = NULL;
      SrtHelperFlags flags = SRT_HELPER_FLAGS_NONE;
      int wait_status = 0;
      int exit_status = 0;
      int terminating_signal = -1;
      gboolean ok;
      gboolean timed_out = TRUE;

      if (parse_exit_status)
        flags |= SRT_HELPER_FLAGS_SHELL_EXIT_STATUS;

      completed = _srt_subprocess_runner_run_sync (runner,
                                                   flags,
                                                   SRT_ARCHITECTURE_QUARK_NONE,
                                                   mock_shell_sigkill,
                                                   SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
                                                   SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
                                                   &f->error);
      g_assert_no_error (f->error);
      g_assert_nonnull (completed);
      _srt_completed_subprocess_check (completed, &f->error);
      dump_error ("sh child pretending to receive SIGKILL", f->error);
      g_assert_nonnull (f->error);
      g_clear_error (&f->error);
      g_assert_false (_srt_completed_subprocess_timed_out (completed));

      ok = _srt_completed_subprocess_report (completed,
                                             &wait_status,
                                             &exit_status,
                                             &terminating_signal,
                                             &timed_out);
      g_assert_cmpint (exit_status, ==, 137);
      g_assert_true (WIFEXITED (wait_status));
      g_assert_cmpint (WEXITSTATUS (wait_status), ==, 137);

      if (parse_exit_status)
        g_assert_cmpint (terminating_signal, ==, 9);
      else
        g_assert_cmpint (terminating_signal, ==, 0);

      g_assert_false (ok);
      g_assert_false (timed_out);
    }
}

/*
 * Exercises WTERMSIG, and incidentally also SEARCH_PATH and
 * SRT_SUBPROCESS_OUTPUT_SILENCE
 */
static void
test_terminating_signal (Fixture *f,
                         gconstpointer context)
{
  static const char * const die_with_signal[] =
    {
      "sh", "-c", "kill -TERM $$", NULL
    };
  g_autoptr(SrtSubprocessRunner) runner = _srt_subprocess_runner_new ();
  g_autoptr(SrtCompletedSubprocess) completed = NULL;
  int wait_status = 0;
  int exit_status = 0;
  int terminating_signal = -1;
  gboolean ok;
  gboolean timed_out;

  completed = _srt_subprocess_runner_run_sync (runner,
                                               SRT_HELPER_FLAGS_SEARCH_PATH,
                                               SRT_ARCHITECTURE_QUARK_NONE,
                                               die_with_signal,
                                               SRT_SUBPROCESS_OUTPUT_SILENCE,
                                               SRT_SUBPROCESS_OUTPUT_SILENCE,
                                               &f->error);
  g_assert_no_error (f->error);
  g_assert_nonnull (completed);
  _srt_completed_subprocess_check (completed, &f->error);
  dump_error ("command that dies with SIGTERM", f->error);
  g_assert_nonnull (f->error);
  g_clear_error (&f->error);
  g_assert_false (_srt_completed_subprocess_timed_out (completed));

  ok = _srt_completed_subprocess_report (completed,
                                         &wait_status,
                                         &exit_status,
                                         &terminating_signal,
                                         &timed_out);
  g_assert_cmpint (exit_status, ==, -1);
  g_assert_true (WIFSIGNALED (wait_status));
  g_assert_cmpint (WTERMSIG (wait_status), ==, SIGTERM);
  g_assert_cmpint (terminating_signal, ==, SIGTERM);
  g_assert_false (ok);
  g_assert_false (timed_out);

  g_assert_null (_srt_completed_subprocess_get_stdout (completed));
  g_assert_null (_srt_completed_subprocess_get_stderr (completed));
}

/*
 * Exercises TIME_OUT in the non-trivial case where the command takes too long
 */
static void
test_timeout (Fixture *f,
              gconstpointer context)
{
  static const char * const who_wants_to_live_forever[] =
    {
      "/bin/sh", "-c", "exec sleep 600", NULL
    };
  g_autoptr(SrtSubprocessRunner) runner = NULL;
  g_autoptr(SrtCompletedSubprocess) completed = NULL;
  SrtTestFlags flags_copy = (SrtTestFlags) -1;
  int wait_status = 0;
  int exit_status = 0;
  int terminating_signal = -1;
  gboolean ok;
  gboolean timed_out = FALSE;

  runner = _srt_subprocess_runner_new_full (NULL,    /* emulator */
                                            NULL,    /* emulator server */
                                            NULL,    /* envp */
                                            NULL,    /* ./bin */
                                            NULL,    /* ./libexec/s-r-t-0 */
                                            NULL,    /* sysroot */
                                            SRT_TEST_FLAGS_TIME_OUT_SOONER,
                                            NULL);   /* cwd */
  g_assert_cmpint (_srt_subprocess_runner_get_test_flags (runner),
                   ==, SRT_TEST_FLAGS_TIME_OUT_SOONER);
  g_object_get (runner,
                "test-flags", &flags_copy,
                NULL);
  g_assert_cmpint (flags_copy, ==, SRT_TEST_FLAGS_TIME_OUT_SOONER);

  completed = _srt_subprocess_runner_run_sync (runner,
                                               SRT_HELPER_FLAGS_TIME_OUT,
                                               SRT_ARCHITECTURE_QUARK_NONE,
                                               who_wants_to_live_forever,
                                               SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
                                               SRT_SUBPROCESS_OUTPUT_CAPTURE_DEBUG,
                                               &f->error);
  g_assert_no_error (f->error);
  g_assert_nonnull (completed);
  _srt_completed_subprocess_check (completed, &f->error);
  dump_error ("command that times out", f->error);
  g_assert_nonnull (f->error);
  g_clear_error (&f->error);
  g_assert_true (_srt_completed_subprocess_timed_out (completed));

  ok = _srt_completed_subprocess_report (completed,
                                         &wait_status,
                                         &exit_status,
                                         &terminating_signal,
                                         &timed_out);
  g_assert_cmpint (exit_status, ==, -1);
  g_assert_true (WIFSIGNALED (wait_status));
  /* We expect this to be SIGTERM but in principle it could be SIGKILL */
  g_assert_cmpint (terminating_signal, !=, 0);
  g_assert_cmpint (WTERMSIG (wait_status), ==, terminating_signal);
  g_assert_false (ok);
  g_assert_true (timed_out);

  g_assert_nonnull (_srt_completed_subprocess_get_stdout (completed));
  g_assert_nonnull (_srt_completed_subprocess_get_stderr (completed));
}

int
main (int argc,
      char **argv)
{
  _srt_setenv_disable_gio_modules ();
  _srt_tests_init (&argc, &argv, NULL);

  /* NOTE: do not use the path /subprocess/ here, even if it would be
   * more consistent: it has a special meaning in GLib's test framework. */
  g_test_add ("/subproc/basic", Fixture, NULL,
              setup, test_basic, teardown);
  g_test_add ("/subproc/capture", Fixture, NULL,
              setup, test_capture, teardown);
  g_test_add ("/subproc/chdir", Fixture, NULL,
              setup, test_chdir, teardown);
  g_test_add ("/subproc/chomp", Fixture, NULL,
              setup, test_chomp, teardown);
  g_test_add ("/subproc/emulator", Fixture, NULL,
              setup, test_emulator, teardown);
  g_test_add ("/subproc/environ", Fixture, NULL,
              setup, test_environ, teardown);
  g_test_add ("/subproc/exec_failure", Fixture, NULL,
              setup, test_exec_failure, teardown);
  g_test_add ("/subproc/fds_open", Fixture, NULL,
              setup, test_fds_open, teardown);
  g_test_add ("/subproc/shell_exit_status", Fixture, NULL,
              setup, test_shell_exit_status, teardown);
  g_test_add ("/subproc/terminating_signal", Fixture, NULL,
              setup, test_terminating_signal, teardown);
  g_test_add ("/subproc/timeout", Fixture, NULL,
              setup, test_timeout, teardown);

  return g_test_run ();
}
