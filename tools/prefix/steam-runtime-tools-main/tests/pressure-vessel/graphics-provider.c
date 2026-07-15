/*
 * Copyright © 2023 Collabora Ltd.
 *
 * SPDX-License-Identifier: MIT
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

#include <stdlib.h>
#include <unistd.h>

#include <glib.h>
#include <glib/gstdio.h>

#include "steam-runtime-tools/glib-backports-internal.h"
#include "steam-runtime-tools/utils-internal.h"
#include "libglnx.h"

#include "tests/test-utils.h"

#include "graphics-provider.h"

typedef struct
{
  TestsOpenFdSet old_fds;
  GLnxTmpDir tmpdir;
} Fixture;

typedef struct
{
  int unused;
} Config;

static void
setup (Fixture *f,
       gconstpointer context)
{
  g_autoptr(GError) local_error = NULL;
  g_autofree gchar *linuxbrew = NULL;
  g_autofree gchar *linuxbrew_exe = NULL;
  g_autofree gchar *linuxbrew_home = NULL;
  g_autofree gchar *linuxbrew_home_exe = NULL;
  g_autofree gchar *bin = NULL;
  g_autofree gchar *bin_exe = NULL;
  g_autofree gchar *local_bin = NULL;
  g_autofree gchar *local_bin_not_exe = NULL;
  const gchar *executable = "ldconfig";

  f->old_fds = tests_check_fd_leaks_enter ();
  glnx_mkdtemp ("pressure-vessel-tests.XXXXXX", 0700, &f->tmpdir, &local_error);
  g_assert_no_error (local_error);

  linuxbrew = g_build_filename (f->tmpdir.path, ".linuxbrew", "bin", NULL);
  g_assert_no_errno (g_mkdir_with_parents (linuxbrew, 0755));
  linuxbrew_exe = g_build_filename (".linuxbrew", "bin", executable, NULL);
  glnx_file_replace_contents_with_perms_at (f->tmpdir.fd, linuxbrew_exe,
                                            (const guint8 *) "", 0,
                                            (mode_t) 755, (uid_t) -1, (gid_t) -1,
                                            0, NULL, &local_error);
  g_assert_no_error (local_error);

  linuxbrew_home = g_build_filename (f->tmpdir.path, "home", "linuxbrew",
                                     ".local", "bin", NULL);
  g_assert_no_errno (g_mkdir_with_parents (linuxbrew_home, 0755));
  linuxbrew_home_exe = g_build_filename ("home", "linuxbrew", ".local", "bin", executable, NULL);
  glnx_file_replace_contents_with_perms_at (f->tmpdir.fd, linuxbrew_home_exe,
                                            (const guint8 *) "", 0,
                                            (mode_t) 755, (uid_t) -1, (gid_t) -1,
                                            0, NULL, &local_error);
  g_assert_no_error (local_error);

  bin = g_build_filename (f->tmpdir.path, "bin", NULL);
  g_assert_no_errno (g_mkdir_with_parents (bin, 0755));
  bin_exe = g_build_filename ("bin", executable, NULL);
  glnx_file_replace_contents_with_perms_at (f->tmpdir.fd, bin_exe,
                                            (const guint8 *) "", 0,
                                            (mode_t) 755, (uid_t) -1, (gid_t) -1,
                                            0, NULL, &local_error);
  g_assert_no_error (local_error);

  local_bin = g_build_filename (f->tmpdir.path, "home", "user",
                                ".local", "bin", NULL);
  g_assert_no_errno (g_mkdir_with_parents (local_bin, 0755));
  local_bin_not_exe = g_build_filename ("home", "user", ".local", "bin", executable, NULL);
  /* Create an ldconfig that is unexpectedly not an executable */
  glnx_file_replace_contents_with_perms_at (f->tmpdir.fd, local_bin_not_exe,
                                            (const guint8 *) "", 0,
                                            (mode_t) 644, (uid_t) -1, (gid_t) -1,
                                            0, NULL, &local_error);
  g_assert_no_error (local_error);
}

static void
teardown (Fixture *f,
          gconstpointer context)
{
  g_autoptr(GError) local_error = NULL;

  glnx_tmpdir_delete (&f->tmpdir, NULL, &local_error);
  g_assert_no_error (local_error);

  tests_check_fd_leaks_leave (f->old_fds);
}

typedef struct
{
  const gchar *description;
  const gchar *path_value;
  const gchar *search_result;
  const gchar *search_result_suffix;
} GraphicsProviderTest;

static const GraphicsProviderTest graphics_provider_test[] =
{
  {
    .description = "`ldconfig` should be available in `/bin`",
    .path_value = "/usr/bin:/bin:/usr/sbin:/sbin",
    .search_result = "/bin/ldconfig",
  },

  {
    .description = "`.linuxbrew` is expected to be skipped",
    .path_value = "/.linuxbrew/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    .search_result = "/bin/ldconfig",
  },

  {
    .description = "If the user is called `linuxbrew` we shouldn't skip it",
    .path_value = "/.linuxbrew/bin:/home/linuxbrew/.local/bin::/bin",
    .search_result = "/home/linuxbrew/.local/bin/ldconfig",
  },

  {
    .description = "If `/home/user/.local/bin/ldconfig` is not an executable, it should be skipped",
    .path_value = "/home/user/.local/bin:/home/linuxbrew/.local/bin",
    .search_result = "/home/linuxbrew/.local/bin/ldconfig",
  },

  {
    .description = "`ldconfig` is expected to be found in the hardcoded paths",
    .path_value = "/.linuxbrew/bin:/usr/sbin",
    .search_result = "/bin/ldconfig",
  },

  {
    .description = "Search in the common bin dirs when PATH is unset",
    .search_result = "/bin/ldconfig",
  },
};

static void
test_graphics_provider_search (Fixture *f,
                               gconstpointer context)
{
  g_autoptr(GPtrArray) graphics_providers = NULL;
  g_autoptr(SrtSubprocessRunner) runner = _srt_subprocess_runner_new ();
  PvGraphicsProvider *graphics_provider = NULL;
  g_autoptr(GError) error = NULL;
  GQuark tuples[2];
  const GQuark *got_tuples;
  gsize n = 0;
  gsize i;

  tuples[0] = g_quark_from_static_string ("s390x-linux-gnu");
  tuples[1] = g_quark_from_static_string ("riscv64-linux-gnu");

  /* Assume the provider path in current ns is the tmpdir. In this way we have
   * a controlled environment that we can edit for our tests.
   * To keep things simple in this unit test, don't start multi-threaded
   * graphics driver enumeration immediately. */
  graphics_providers = pv_graphics_provider_build_array (runner,
                                                         f->tmpdir.path,
                                                         NULL,
                                                         tuples,
                                                         G_N_ELEMENTS (tuples),
                                                         NULL,
                                                         PV_RUNTIME_FLAGS_SINGLE_THREAD,
                                                         &error);
  g_assert_no_error (error);
  g_assert_nonnull (graphics_providers);
  g_assert_cmpuint (graphics_providers->len, ==, 1);
  graphics_provider = g_ptr_array_index (graphics_providers, 0);
  g_assert_cmpstr (graphics_provider->path_in_container_ns,
                   ==, "/run/gfx/main");
  got_tuples = pv_graphics_provider_get_architectures (graphics_provider, &n);
  g_assert_cmpuint (n, ==, G_N_ELEMENTS (tuples));
  g_assert_cmpuint (got_tuples[n], ==, 0);

  for (i = 0; i < G_N_ELEMENTS (tuples); i++)
    g_assert_cmpstr (g_quark_to_string (tuples[i]), ==, g_quark_to_string (got_tuples[i]));


  for (i = 0; i < G_N_ELEMENTS (graphics_provider_test); i++)
    {
      const GraphicsProviderTest *test = &graphics_provider_test[i];
      g_autofree gchar *program_path = NULL;

      g_test_message ("%s", test->description);

      program_path = pv_graphics_provider_search_in_path_and_bin (graphics_provider, test->path_value, "ldconfig");

      if (test->search_result_suffix != NULL)
        g_assert_true (g_str_has_suffix (program_path, test->search_result_suffix));
      else
        g_assert_cmpstr (program_path, ==, test->search_result);
    }
}

int
main (int argc,
      char **argv)
{
  _srt_setenv_disable_gio_modules ();

  _srt_tests_init (&argc, &argv, NULL);

  g_test_add ("/graphics-provider-search", Fixture, NULL,
              setup, test_graphics_provider_search, teardown);

  return g_test_run ();
}
