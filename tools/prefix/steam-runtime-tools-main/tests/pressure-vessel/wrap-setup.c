/*
 * Copyright © 2019-2021 Collabora Ltd.
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

#include <stdbool.h>
#include <stdlib.h>
#include <unistd.h>

#include <glib.h>
#include <glib/gstdio.h>

#include "steam-runtime-tools/glib-backports-internal.h"
#include "steam-runtime-tools/architecture-internal.h"
#include "steam-runtime-tools/launcher-interface-internal.h"
#include "steam-runtime-tools/utils-internal.h"
#include "libglnx.h"

#include "tests/test-utils.h"

#include "bwrap.h"
#include "passwd.h"
#include "supported-architectures.h"
#include "wrap-context.h"
#include "wrap-home.h"
#include "wrap-interactive.h"
#include "wrap-preload.h"
#include "wrap-setup.h"
#include "utils.h"

/* These match the first entry in PvMultiArchdetails.platforms,
 * which is the easiest realistic thing for a mock implementation of
 * srt_system_info_check_library() to use. */
#define MOCK_PLATFORM_32 "i686"
#define MOCK_PLATFORM_64 "xeon_phi"
#define MOCK_PLATFORM_GENERIC "mock"

/* This matches Debian multiarch, which is as good a thing as any for
 * a mock implementation of srt_system_info_check_library() to use. */
#define MOCK_LIB_32 "lib/" SRT_ABI_I386

typedef struct PayloadCommandTest PayloadCommandTest;

typedef struct
{
  const char * const *architectures;
  const PayloadCommandTest *payload_command_test;
  PvRuntimeFlags runtime_flags;
  PvAppendPreloadFlags preload_flags;
  PvWorkaroundFlags workarounds;
} Config;

typedef struct
{
  const Config *config;
  TestsOpenFdSet old_fds;
  GLnxTmpDir tmpdir;
  PvWrapContext *context;
  SrtSysroot *mock_host;
  FlatpakBwrap *bwrap;
  gchar *home;
  gchar *mock_runtime;
  gchar *var;
  GQuark primary_abi;
  gchar *primary_platform;
  gchar *primary_lib;
  int mock_runtime_fd;
  int var_fd;
} Fixture;

static const char * const x86_archs[] =
{
  SRT_ABI_X86_64,
  SRT_ABI_I386,
  NULL
};

static const char * const aarch64_archs[] =
{
  SRT_ABI_AARCH64,
  NULL
};

static const Config default_config = {};
static const Config copy_config =
{
  .runtime_flags = PV_RUNTIME_FLAGS_COPY_RUNTIME,
};
static const Config interpreter_root_config =
{
  .runtime_flags = (PV_RUNTIME_FLAGS_COPY_RUNTIME
                    | PV_RUNTIME_FLAGS_INTERPRETER_ROOT),
};
static const Config aarch64_config =
{
  .architectures = aarch64_archs,
};
static const Config x86_config =
{
  .architectures = x86_archs,
};
static const Config limit_shared_dirs_config =
{
  .workarounds = PV_WORKAROUND_FLAGS_LIMIT_SHARED_DIRS,
};

static int
open_or_die (const char *path,
             int flags,
             int mode)
{
  glnx_autofd int fd = open (path, flags | O_CLOEXEC, mode);

  if (fd >= 0)
    return g_steal_fd (&fd);
  else
    g_error ("open(%s, 0x%x): %s", path, flags, g_strerror (errno));
}

static inline gboolean
fixture_has_arch (Fixture *f,
                  const char *tuple)
{
  return pv_wrap_options_has_architecture (&f->context->options,
                                           g_quark_from_string (tuple));
}

/*
 * Populate root_fd with the given directories and symlinks.
 * The paths use a simple domain-specific language:
 * - symlinks are given as "link>target"
 * - directories are given as "dir/"
 * - any other string is created as a regular 0-byte file
 */
static void
fixture_populate_dir (Fixture *f,
                      int root_fd,
                      const char * const *paths,
                      gsize n_paths)
{
  g_autoptr(GError) local_error = NULL;
  gsize i;

  for (i = 0; i < n_paths; i++)
    {
      const char *path = paths[i];

      /* All paths we create should be created relative to the mock root */
      while (path[0] == '/')
        path++;

      if (strchr (path, '>'))
        {
          g_auto(GStrv) pieces = g_strsplit (path, ">", 2);

          g_test_message ("Creating symlink %s -> %s", pieces[0], pieces[1]);
          g_assert_no_errno (TEMP_FAILURE_RETRY (symlinkat (pieces[1], root_fd, pieces[0])));
        }
      else if (g_str_has_suffix (path, "/"))
        {
          g_test_message ("Creating directory %s", path);

          glnx_shutil_mkdir_p_at (root_fd, path, 0755, NULL, &local_error);
          g_assert_no_error (local_error);
        }
      else
        {
          g_autofree char *dir = g_path_get_dirname (path);

          g_test_message ("Creating directory %s", dir);
          glnx_shutil_mkdir_p_at (root_fd, dir, 0755, NULL, &local_error);
          g_assert_no_error (local_error);

          g_test_message ("Creating file %s", path);
          glnx_file_replace_contents_at (root_fd, path,
                                         (const guint8 *) "", 0, 0, NULL,
                                         &local_error);
          g_assert_no_error (local_error);
        }
    }
}

static void
fixture_create_exports (Fixture *f)
{
  glnx_autofd int fd = open_or_die (f->mock_host->path, O_RDONLY | O_DIRECTORY, 0755);

  g_return_if_fail (f->context->exports == NULL);
  f->context->exports = flatpak_exports_new ();
  flatpak_exports_take_host_fd (f->context->exports, g_steal_fd (&fd));
}

static void
fixture_create_runtime (Fixture *f,
                        PvRuntimeFlags flags)
{
  g_autoptr(SrtSubprocessRunner) runner = _srt_subprocess_runner_new ();
  g_autoptr(GArray) archs_arr = NULL;
  g_autoptr(GError) local_error = NULL;
  g_autoptr(GPtrArray) graphics_providers = NULL;
  PvGraphicsProvider *graphics_provider;
  const char *expected_gfx_in_container;
  GQuark tuples[3];
  const GQuark *got_tuples;
  gsize n = 0;
  gsize i;

  g_assert_null (f->context->runtime);
  g_assert_nonnull (f->context->original_environ);

  tuples[0] = g_quark_from_static_string ("arm-linux-gnueabihf");
  tuples[1] = g_quark_from_static_string ("arm-linux-gnueabi");
  tuples[2] = g_quark_from_static_string (SRT_ABI_AARCH64);

  flags |= (PV_RUNTIME_FLAGS_VERBOSE | PV_RUNTIME_FLAGS_SINGLE_THREAD);

  if (flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT)
    expected_gfx_in_container = "/var/pressure-vessel/gfx/main";
  else if (flags & PV_RUNTIME_FLAGS_FLATPAK_SUBSANDBOX)
    expected_gfx_in_container = "/run/parent";
  else
    expected_gfx_in_container = "/run/host";

  graphics_providers = pv_graphics_provider_build_array (runner,
                                                         "/",
                                                         NULL,
                                                         tuples,
                                                         G_N_ELEMENTS (tuples),
                                                         NULL,
                                                         flags,
                                                         &local_error);
  g_assert_no_error (local_error);
  g_assert_nonnull (graphics_providers);
  g_assert_cmpuint (graphics_providers->len, ==, 1);
  graphics_provider = g_ptr_array_index (graphics_providers, 0);
  g_assert_cmpstr (graphics_provider->path_in_container_ns,
                   ==, expected_gfx_in_container);
  got_tuples = pv_graphics_provider_get_architectures (graphics_provider, &n);
  g_assert_cmpuint (n, ==, G_N_ELEMENTS (tuples));
  g_assert_cmpuint (got_tuples[n], ==, 0);

  for (i = 0; i < G_N_ELEMENTS (tuples); i++)
    g_assert_cmpstr (g_quark_to_string (tuples[i]), ==, g_quark_to_string (got_tuples[i]));

  archs_arr = g_array_new (FALSE, FALSE, sizeof (GQuark));
  g_array_append_vals (archs_arr, tuples, G_N_ELEMENTS (tuples));
  f->context->runtime = pv_runtime_new (f->mock_runtime,
                                        f->var,
                                        NULL,
                                        archs_arr,
                                        graphics_providers,
                                        "/home/me",
                                        _srt_const_strv (f->context->original_environ),
                                        runner,
                                        flags,
                                        PV_WORKAROUND_FLAGS_NONE,
                                        &local_error);
  g_assert_no_error (local_error);
  g_assert_nonnull (f->context->runtime);

  g_clear_pointer (&archs_arr, g_array_unref);
  g_object_get (f->context->runtime,
                "architectures", &archs_arr,
                NULL);
  g_assert_cmpuint (archs_arr->len, ==, G_N_ELEMENTS (tuples));
  g_assert_cmpuint (g_array_index (archs_arr, GQuark, archs_arr->len), ==, 0);

  for (i = 0; i < G_N_ELEMENTS (tuples); i++)
    g_assert_cmpstr (g_quark_to_string (tuples[i]), ==,
                     g_quark_to_string (g_array_index (archs_arr, GQuark, i)));
}

static void
fixture_recreate_context (Fixture *f)
{
  g_autoptr(GError) local_error = NULL;

  g_clear_object (&f->context);
  f->context = pv_wrap_context_new (f->mock_host, "/home/me", &local_error);
  g_assert_no_error (local_error);

  f->context->original_environ = g_environ_setenv (f->context->original_environ,
                                                   "HOME",
                                                   "/home/me",
                                                   TRUE);
  /* Some tests need to know where Steam is installed;
   * pretend that we have it installed in /steam */
  f->context->original_environ = g_environ_setenv (f->context->original_environ,
                                                   "STEAM_COMPAT_CLIENT_INSTALL_PATH",
                                                   "/steam",
                                                   TRUE);

  if (f->config->architectures != NULL)
    {
      for (size_t i = 0; f->config->architectures[i] != NULL; i++)
        {
          GQuark arch_quark = g_quark_from_static_string (f->config->architectures[i]);

          g_array_append_val (f->context->options.architectures, arch_quark);
        }
    }
  else
    {
      _srt_architecture_array_populate_with_defaults (f->context->options.architectures);
    }
}

static void
setup (Fixture *f,
       gconstpointer context)
{
  g_autoptr(GError) local_error = NULL;
  g_autofree gchar *mock_host = NULL;

  if (context != NULL)
    f->config = context;
  else
    f->config = &default_config;

  f->old_fds = tests_check_fd_leaks_enter ();
  glnx_mkdtemp ("pressure-vessel-tests.XXXXXX", 0700, &f->tmpdir, &local_error);
  g_assert_no_error (local_error);

  mock_host = g_build_filename (f->tmpdir.path, "host", NULL);
  f->mock_runtime = g_build_filename (f->tmpdir.path, "runtime", NULL);
  f->var = g_build_filename (f->tmpdir.path, "var", NULL);
  g_assert_no_errno (g_mkdir (mock_host, 0755));
  g_assert_no_errno (g_mkdir (f->mock_runtime, 0755));
  g_assert_no_errno (g_mkdir (f->var, 0755));
  f->mock_host = _srt_sysroot_new (mock_host, &local_error);
  g_assert_no_error (local_error);
  glnx_opendirat (AT_FDCWD, f->mock_runtime, TRUE, &f->mock_runtime_fd, &local_error);
  g_assert_no_error (local_error);
  glnx_opendirat (AT_FDCWD, f->var, TRUE, &f->var_fd, &local_error);
  g_assert_no_error (local_error);

  f->home = g_build_filename (f->mock_host->path, "home", "me", NULL);
  glnx_shutil_mkdir_p_at (AT_FDCWD, f->home, 0755, NULL, &local_error);
  g_assert_no_error (local_error);
  f->bwrap = flatpak_bwrap_new (flatpak_bwrap_empty_env);
  fixture_recreate_context (f);

  g_assert_cmpuint (f->context->options.architectures->len, >=, 1);
  f->primary_abi = g_array_index (f->context->options.architectures, GQuark, 0);
  /* This matches Debian multiarch, which is as good a thing as any for
   * a mock implementation of srt_system_info_check_library() to use. */
  f->primary_lib = g_strdup_printf ("lib/%s", g_quark_to_string (f->primary_abi));

  if (g_str_equal (g_quark_to_string (f->primary_abi), SRT_ABI_X86_64))
    f->primary_platform = g_strdup (MOCK_PLATFORM_64);
  else if (g_str_equal (g_quark_to_string (f->primary_abi), SRT_ABI_I386))
    f->primary_platform = g_strdup (MOCK_PLATFORM_32);
  else
    f->primary_platform = g_strdup (MOCK_PLATFORM_GENERIC);

  g_test_message ("Primary ABI: %s", g_quark_to_string (f->primary_abi));
  g_test_message ("Primary mock ${PLATFORM}: %s", f->primary_platform);
  g_test_message ("Primary mock ${LIB}: %s", f->primary_lib);
}

/*
 * ExpectedPreloadExportsFlags:
 * @EXPORT_TODO: The specified behaviour is not enforced, and whatever other
 *  flags are set/unset describe the behaviour we would ideally have
 * @EXPORT_VISIBLE: The path is visible
 * @EXPORT_IF_I386: Behave as if @EXPORT_NONE if the i386 architecture
 *  is unsupported
 * @EXPORT_IF_STEAM_OVERLAY: Behave as if @EXPORT_NONE if the Steam overlay
 *  is disabled
 * @EXPORT_NONE: None of the above
 *
 * Flags describing how an #ExpectedPreloadExports is or is not exported
 */
typedef enum
{
  EXPORT_TODO = (1 << 0),
  EXPORT_VISIBLE = (1 << 1),
  EXPORT_IF_I386 = (1 << 2),
  EXPORT_IF_STEAM_OVERLAY = (1 << 3),
  EXPORT_NONE = 0
} ExpectedPreloadExportsFlags;

/*
 * ExpectedPreloadExports:
 * @path: An absolute path, or "=" as shorthand for repeating
 *  the corresponding item of @input in #PreloadTest,
 *  with any a: or p: prefix removed.
 * @flags: The desired behaviour
 *
 * The expected disposition of a path in the #FlatpakExports
 */
typedef struct
{
  const char *path;
  ExpectedPreloadExportsFlags flags;
} ExpectedPreloadExports;

/*
 * PreloadTest:
 * @input: Colon-separated items in LD_AUDIT/LD_PRELOAD, or %NULL.
 *  If prefixed with "a:" they are assumed to be in LD_AUDIT.
 *  If prefixed with "p:" or not prefixed, they are assumed to be in
 *  LD_PRELOAD.
 * @warning: (nullable): If not null, expect the item to be ignored
 *  with this warning
 * @touch: (nullable): If not null, create these regular files associated
 *  with the item in the mock sysroot.
 *  "=" may be used as a shorthand as above, in which case any a: or p:
 *  prefix will be removed.
 * @touch_i386: (nullable): Same as @touch, but only if the i386
 *  architecture is supported.
 * @expected: The arguments we expect to see passed to
 *  `pv-adverb --ld-audit` or `--ld-preload` as a result, with no
 *  /run/host/ prefix.
 *  "=" may be used as a shorthand as above, in which case any "a:" or "p:"
 *  prefix will be kept.
 *  If prefixed with "i386:" (which must come first), then we expect the
 *  rest of the value as an argument if and only if the i386 architecture
 *  is supported.
 *  If prefixed with "a:" they are assumed to be in LD_AUDIT.
 *  If prefixed with "p:" or not prefixed, they are assumed to be in
 *  LD_PRELOAD.
 *  %NULL items are ignored.
 * @expected_exports: An array of #FlatpakExports entries somehow related
 *  to this module. Each one indicates a path that is, or is not, required
 *  to be exported if a #FlatpakExports is used.
 *  Items with a %NULL path are ignored.
 */
typedef struct
{
  /* Array lengths are arbitrary, expand as required */
  const char *input[2];
  const char *warning;
  const char *touch[2];
  const char *touch_i386[2];
  const char *expected[2];
  const ExpectedPreloadExports expected_exports[6];
  bool only_if_x86 : 1;
} PreloadTest;

static GString *
fixture_substitute (Fixture *f,
                    const char *path,
                    const PreloadTest *t,
                    gsize input_index)
{
  g_autoptr(GString) final_path = g_string_new (path);

  if (t != NULL && g_str_equal (final_path->str, "="))
    {
      g_assert (input_index < G_N_ELEMENTS (t->input));
      g_string_assign (final_path, t->input[input_index]);

      if (g_str_has_prefix (final_path->str, "a:")
          || g_str_has_prefix (final_path->str, "p:"))
        g_string_erase (final_path, 0, 2);
    }

  g_string_replace (final_path, "@PRIMARY_ABI@",
                    g_quark_to_string (f->primary_abi), 0);
  g_string_replace (final_path, "@PRIMARY_PLATFORM@",
                    f->primary_platform, 0);
  g_string_replace (final_path, "@PRIMARY_LIB@",
                    f->primary_lib, 0);

  return g_steal_pointer (&final_path);
}

static const PreloadTest ld_preload_tests[] =
{
  {
    .input = { NULL },
  },
  {
    .input = { "" },
    .warning = "Ignoring invalid loadable module \"\"",
  },
  {
    .input = { "" },
    .warning = "Ignoring invalid loadable module \"\"",
  },
  {
    .input = { "/app/lib/libpreloadA.so" },
    .touch = { "=" },
    .expected = { "=" },
    /* FlatpakExports never exports /app or anything below it. */
    .expected_exports = {
      { "=", EXPORT_NONE },
      { "/app", EXPORT_NONE },
      { "/app/lib", EXPORT_NONE },
    },
  },
  {
    .input = { "/platform/plat-$PLATFORM/libpreloadP.so" },
    .touch = { "/platform/plat-@PRIMARY_PLATFORM@/libpreloadP.so" },
    .touch_i386 = { "/platform/plat-" MOCK_PLATFORM_32 "/libpreloadP.so" },
    .expected = {
      "/platform/plat-@PRIMARY_PLATFORM@/libpreloadP.so:abi=@PRIMARY_ABI@",
      "i386:/platform/plat-" MOCK_PLATFORM_32 "/libpreloadP.so:abi=" SRT_ABI_I386,
    },
    /* We don't always export /platform, so we have to explicitly export this */
    .expected_exports = {
      { "/platform", EXPORT_NONE },
      { "/platform/plat-@PRIMARY_PLATFORM@", EXPORT_VISIBLE },
      { "/platform/plat-@PRIMARY_PLATFORM@/libpreloadP.so", EXPORT_VISIBLE },
      /* Same for i386, if supported */
      {
        "/platform/plat-" MOCK_PLATFORM_32,
        EXPORT_VISIBLE | EXPORT_IF_I386,
      },
      {
        "/platform/plat-" MOCK_PLATFORM_32 "/libpreloadP.so",
        EXPORT_VISIBLE | EXPORT_IF_I386,
      },
    },
  },
  {
    .input = { "/opt/${LIB}/libpreloadL.so" },
    .touch = { "/opt/@PRIMARY_LIB@/libpreloadL.so" },
    .touch_i386 = { "/opt/" MOCK_LIB_32 "/libpreloadL.so" },
    .expected = {
      "/opt/@PRIMARY_LIB@/libpreloadL.so:abi=@PRIMARY_ABI@",
      "i386:/opt/" MOCK_LIB_32 "/libpreloadL.so:abi=" SRT_ABI_I386,
    },
    /* We don't always export /opt, so we have to explicitly export this */
    .expected_exports = {
      { "/opt", EXPORT_NONE },
      /* This doesn't need to be exported because for the purposes of this
       * unit test we're pretending that ${LIB} is Debian-style multiarch,
       * so /opt/lib/x86_64-linux-gnu/ or similar would be sufficient */
      { "/opt/lib", EXPORT_NONE },
      { "/opt/@PRIMARY_LIB@", EXPORT_VISIBLE },
      { "/opt/@PRIMARY_LIB@/libpreloadL.so", EXPORT_VISIBLE },
      /* Same for i386, if supported */
      { "/opt/" MOCK_LIB_32, EXPORT_VISIBLE | EXPORT_IF_I386 },
      { "/opt/" MOCK_LIB_32 "/libpreloadL.so", EXPORT_VISIBLE | EXPORT_IF_I386 },
    },
  },
  {
    .input = { "/lib/libpreload-rootfs.so" },
    .touch = { "=" },
    .expected = { "=" },
    /* FlatpakExports never exports /lib as /lib */
    .expected_exports = {
      { "=", EXPORT_NONE },
      { "/lib", EXPORT_NONE },
    },
  },
  {
    .input = { "/usr/lib/libpreloadU.so" },
    .touch = { "=" },
    .expected = { "=" },
    /* FlatpakExports never exports /usr as /usr */
    .expected_exports = {
      { "=", EXPORT_NONE },
      { "/usr", EXPORT_NONE },
      { "/usr/lib", EXPORT_NONE },
    },
  },
  {
    .input = { "p:/home/me/libpreloadH.so", "a:/home/me/libaudit.so" },
    .touch = { "=", "=" },
    .expected = { "=", "=" },
    /* We don't always export /home etc. so we have to explicitly export
     * this one */
    .expected_exports = {
      { "=", EXPORT_VISIBLE },
      { "=", EXPORT_VISIBLE },
      { "/home", EXPORT_NONE },
      /* We don't want to export $HOME (and overrule --unshare-home) just
       * because it happens to have a LD_PRELOAD module in it */
      { "/home/me", EXPORT_NONE },
    },
  },
  {
    .input = { "/home/me/lib64/mangohud/libNotMangoHud.so" },
    .touch = { "=" },
    .expected = { "=" },
    .expected_exports = {
      { "=", EXPORT_VISIBLE },
      { "/home", EXPORT_NONE },
      { "/home/me", EXPORT_NONE },
      { "/home/me/lib64", EXPORT_NONE },
      /* Ideally we would export this parent, so that if libNotMangoHud.so
       * loads ${ORIGIN}/libImplementation.so, it can see the exported
       * /home/me/lib64/mangohud/libImplementation.so.
       * (This mirrors how MangoHud actually works.) */
      { "/home/me/lib64/mangohud", EXPORT_VISIBLE },
    },
  },
  {
    .input = { "/steam/lib/gameoverlayrenderer.so" },
    .touch = { "=" },
    .expected = { "=" },
    /* We assume STEAM_COMPAT_CLIENT_INSTALL_PATH is exported separately */
    .expected_exports = {
      { "=", EXPORT_NONE },
      { "/steam", EXPORT_NONE },
      { "/steam/lib", EXPORT_NONE },
    },
  },
  {
    .input = {
        "/steam/ubuntu12_64/gameoverlayrenderer.so",
        "/steam/ubuntu12_32/gameoverlayrenderer.so",
    },
    .touch = { "=", "=" },
    .expected = { "=", "=" },
    .expected_exports = {
      { "=", EXPORT_NONE },
      { "=", EXPORT_NONE },
      { "/steam", EXPORT_NONE },
      { "/steam/ubuntu12_64", EXPORT_NONE },
      { "/steam/ubuntu12_32", EXPORT_NONE },
    },
  },
  {
    .input = {
        "/steam/ubuntu12_32/gameoverlayrenderer.so",
        "/steam/ubuntu12_64/gameoverlayrenderer.so",
    },
    .touch = { "=", "=" },
    /* Order is preserved, for now (but this might not always be true) */
    .expected = { "=", "=" },
    .expected_exports = {
      { "=", EXPORT_NONE },
      { "=", EXPORT_NONE },
      { "/steam", EXPORT_NONE },
      { "/steam/ubuntu12_32", EXPORT_NONE },
      { "/steam/ubuntu12_64", EXPORT_NONE },
    },
  },
  {
    .input = { "/overlay/libs/${ORIGIN}/../lib/libpreloadO.so" },
    .touch = { "=" },
    .expected = { "=" },
    /* We don't know what ${ORIGIN} will expand to, so we have to cut off at
     * /overlay/libs */
    .expected_exports = {
      { "/overlay", EXPORT_NONE },
      { "/overlay/libs", EXPORT_VISIBLE },
    },
  },
  {
    .input = { "/future/libs-$FUTURE/libpreloadF.so" },
    .touch = { "/future/libs-post2038/.exists" },
    .expected = { "=" },
    /* We don't know what ${FUTURE} will expand to, so we have to cut off at
     * /future */
    .expected_exports = { { "/future", EXPORT_VISIBLE } },
  },
  {
    .input = { "/in-root-plat-${PLATFORM}-only-32-bit.so" },
    .touch_i386 = { "/in-root-plat-" MOCK_PLATFORM_32 "-only-32-bit.so" },
    .expected = {
      "i386:/in-root-plat-i686-only-32-bit.so:abi=" SRT_ABI_I386,
    },
  },
  {
    .input = { "/in-root-${FUTURE}.so" },
    .expected = { "=" },
  },
  {
    .input = { "./${RELATIVE}.so" },
    .expected = { "=" },
  },
  {
    .input = { "./relative.so" },
    .expected = { "=" },
  },
  {
    /* Our mock implementation of pv_runtime_has_library() behaves as though
     * libfakeroot is not in the runtime or graphics stack provider, only
     * the current namespace */
    .input = { "libfakeroot.so" },
    .expected = {
      "/path/to/@PRIMARY_LIB@/libfakeroot.so:abi=@PRIMARY_ABI@",
      "i386:/path/to/" MOCK_LIB_32 "/libfakeroot.so:abi=" SRT_ABI_I386,
    },
  },
  {
    /* Our mock implementation of pv_runtime_has_library() behaves as though
     * libpthread.so.0 *is* in the runtime, as we would expect */
    .input = { "libpthread.so.0" },
    .expected = { "=" },
  },
  {
    .input = { "/usr/local/lib/libgtk3-nocsd.so.0" },
    .touch = { "=" },
    .warning = "Disabling gtk3-nocsd LD_PRELOAD: it is known to cause crashes.",
  },
  {
    .input = { "" },
    .warning = "Ignoring invalid loadable module \"\"",
  },
};

static void
assert_exports_match_expectations (Fixture *f,
                                   const PreloadTest *tests,
                                   gsize n_tests)
{
  FlatpakExports *exports = f->context->exports;
  gsize i;
  gboolean expect_i386 = fixture_has_arch (f, SRT_ABI_I386);

  g_assert_nonnull (exports);

  for (i = 0; i < n_tests; i++)
    {
      const PreloadTest *test = &tests[i];
      gsize j;

      for (j = 0; j < G_N_ELEMENTS (test->expected_exports); j++)
        {
          const ExpectedPreloadExports *expected = &test->expected_exports[j];
          const char *path = expected->path;
          ExpectedPreloadExportsFlags flags = expected->flags;
          gboolean should_be_visible, is_visible;
          g_autoptr(GString) final_path = NULL;

          if (path == NULL)
            continue;

          final_path = fixture_substitute (f, path, test, j);
          is_visible = flatpak_exports_path_is_visible (exports, final_path->str);
          should_be_visible = ((flags & EXPORT_VISIBLE) != 0);

          if ((flags & EXPORT_IF_I386) && !expect_i386)
            should_be_visible = FALSE;

          g_test_message ("%s export status: expected %s, got %s%s",
                          final_path->str,
                          should_be_visible ? "visible" : "hidden",
                          is_visible ? "visible" : "hidden",
                          (is_visible == should_be_visible) ? "" : " (!)");

          if (is_visible != should_be_visible)
            {
              g_autofree gchar *message = NULL;

              message = g_strdup_printf ("%s should%s be exported, but is%s",
                                         final_path->str,
                                         should_be_visible ? "" : " not",
                                         is_visible ? "" : " not");

              if (flags & EXPORT_TODO)
                g_test_incomplete (message);
              else
                g_test_fail_printf ("%s", message);
            }
        }
    }
}

static void
collect_files_to_touch (GPtrArray *array,
                        Fixture *f,
                        const char * const *touch,
                        gsize n,
                        const PreloadTest *test)
{
  gsize j;

  for (j = 0; j < n; j++)
    {
      g_autoptr(GString) final_path = NULL;

      if (touch[j] == NULL)
        continue;

      final_path = fixture_substitute (f, touch[j], test, j);
      g_ptr_array_add (array,
                       g_string_free_and_steal (g_steal_pointer (&final_path)));
    }
}

static void
setup_ld_preload (Fixture *f,
                  gconstpointer context)
{
  g_autoptr(GPtrArray) touch = g_ptr_array_new_with_free_func (g_free);
  g_autoptr(GPtrArray) touch_i386 = g_ptr_array_new_with_free_func (g_free);
  gsize i;

  setup (f, context);

  for (i = 0; i < G_N_ELEMENTS (ld_preload_tests); i++)
    {
      const PreloadTest *test = &ld_preload_tests[i];

      collect_files_to_touch (touch, f,
                              test->touch, G_N_ELEMENTS (test->touch),
                              test);
      collect_files_to_touch (touch_i386, f,
                              test->touch_i386, G_N_ELEMENTS (test->touch_i386),
                              test);
    }

  fixture_populate_dir (f, f->mock_host->fd,
                        (const char * const *) touch->pdata, touch->len);

  if (fixture_has_arch (f, SRT_ABI_I386))
    {
      fixture_populate_dir (f, f->mock_host->fd,
                            (const char * const *) touch_i386->pdata,
                            touch_i386->len);
    }
}

static void
teardown (Fixture *f,
          gconstpointer context)
{
  g_autoptr(GError) local_error = NULL;

  g_clear_fd (&f->mock_runtime_fd, &local_error);
  g_assert_no_error (local_error);
  g_clear_fd (&f->var_fd, &local_error);
  g_assert_no_error (local_error);

  glnx_tmpdir_delete (&f->tmpdir, NULL, &local_error);
  g_assert_no_error (local_error);

  g_clear_object (&f->context);
  g_clear_object (&f->mock_host);
  g_clear_pointer (&f->home, g_free);
  g_clear_pointer (&f->mock_runtime, g_free);
  g_clear_pointer (&f->home, g_free);
  g_clear_pointer (&f->var, g_free);
  g_clear_pointer (&f->bwrap, flatpak_bwrap_free);
  g_clear_pointer (&f->primary_platform, g_free);
  g_clear_pointer (&f->primary_lib, g_free);

  tests_check_fd_leaks_leave (f->old_fds);
}

static void
dump_bwrap (FlatpakBwrap *bwrap)
{
  guint i;

  g_test_message ("FlatpakBwrap object:");

  for (i = 0; i < bwrap->argv->len; i++)
    {
      const char *arg = g_ptr_array_index (bwrap->argv, i);

      g_test_message ("\t%s", arg);
    }
}

/* For simplicity we look for argument sequences of length exactly 3:
 * everything we're interested in for this test-case meets that description */
static void
assert_bwrap_contains (FlatpakBwrap *bwrap,
                       const char *one,
                       const char *two,
                       const char *three)
{
  guint i;

  g_assert_cmpuint (bwrap->argv->len, >=, 3);

  for (i = 0; i < bwrap->argv->len - 2; i++)
    {
      if (g_str_equal (g_ptr_array_index (bwrap->argv, i), one)
          && g_str_equal (g_ptr_array_index (bwrap->argv, i + 1), two)
          && g_str_equal (g_ptr_array_index (bwrap->argv, i + 2), three))
        return;
    }

  dump_bwrap (bwrap);
  g_error ("Expected to find: %s %s %s", one, two, three);
}

static void
assert_bwrap_does_not_contain (FlatpakBwrap *bwrap,
                               const char *path)
{
  guint i;

  for (i = 0; i < bwrap->argv->len; i++)
    {
      const char *arg = g_ptr_array_index (bwrap->argv, i);

      g_assert_cmpstr (arg, !=, NULL);
      g_assert_cmpstr (arg, !=, path);
    }
}

static void
dump_env_overlay (const SrtEnvOverlay *overlay)
{
  g_autoptr(GList) vars = _srt_env_overlay_get_vars (overlay);
  const GList *iter;

  g_test_message ("SrtEnvOverlay object:");

  for (iter = vars; iter != NULL; iter = iter->next)
    {
      const char *var = iter->data;
      const char *value = _srt_env_overlay_get (overlay, var);

      if (value == NULL)
        g_test_message ("\tunset %s", var);
      else
        g_test_message ("\texport %s=%s", var, value);
    }

  if (_srt_env_overlay_is_empty (overlay))
    g_test_message ("\tinherit everything");
  else
    g_test_message ("\tinherit everything else");
}

static void
test_bind_into_container (Fixture *f,
                          gconstpointer context)
{
  const Config *config = context;
  g_autoptr(GError) error = NULL;
  gboolean ok;

  fixture_create_runtime (f, config->runtime_flags);
  g_assert_nonnull (f->context->runtime);

  /* Successful cases */

  ok = pv_runtime_bind_into_container (f->context->runtime, f->bwrap,
                                       "/etc/machine-id", NULL, 0,
                                       "/etc/machine-id",
                                       PV_RUNTIME_EMULATION_ROOTS_BOTH,
                                       &error);
  g_assert_no_error (error);
  g_assert_true (ok);

  ok = pv_runtime_bind_into_container (f->context->runtime, f->bwrap,
                                       "/etc/arm-file", NULL, 0,
                                       "/etc/arm-file",
                                       PV_RUNTIME_EMULATION_ROOTS_REAL_ONLY,
                                       &error);
  g_assert_no_error (error);
  g_assert_true (ok);

  ok = pv_runtime_bind_into_container (f->context->runtime, f->bwrap,
                                       "/fex/etc/x86-file", NULL, 0,
                                       "/etc/x86-file",
                                       PV_RUNTIME_EMULATION_ROOTS_INTERPRETER_ONLY,
                                       &error);
  g_assert_no_error (error);
  g_assert_true (ok);

  /* Error cases */

  ok = pv_runtime_bind_into_container (f->context->runtime, f->bwrap,
                                       "/nope", NULL, 0,
                                       "/nope",
                                       PV_RUNTIME_EMULATION_ROOTS_REAL_ONLY,
                                       &error);
  g_assert_error (error, G_IO_ERROR, G_IO_ERROR_READ_ONLY);
  g_assert_false (ok);
  g_test_message ("Editing /nope not allowed, as expected: %s", error->message);
  g_clear_error (&error);

  ok = pv_runtime_bind_into_container (f->context->runtime, f->bwrap,
                                       "/usr/foo", NULL, 0,
                                       "/usr/foo",
                                       PV_RUNTIME_EMULATION_ROOTS_BOTH,
                                       &error);
  g_assert_error (error, G_IO_ERROR, G_IO_ERROR_READ_ONLY);
  g_assert_false (ok);
  g_test_message ("Editing /usr/foo not allowed, as expected: %s", error->message);
  g_clear_error (&error);

  /* Check that the right things happened */

  dump_bwrap (f->bwrap);
  assert_bwrap_does_not_contain (f->bwrap, "/nope");
  assert_bwrap_does_not_contain (f->bwrap, "/usr/foo");
  assert_bwrap_contains (f->bwrap,
                         "--ro-bind", "/etc/machine-id", "/etc/machine-id");
  assert_bwrap_contains (f->bwrap,
                         "--ro-bind", "/etc/arm-file", "/etc/arm-file");
  assert_bwrap_does_not_contain (f->bwrap,
                                 PV_RUNTIME_PATH_INTERPRETER_ROOT "/etc/arm-file");

  if (config->runtime_flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT)
    {
      assert_bwrap_contains (f->bwrap,
                             "--ro-bind", "/etc/machine-id",
                             PV_RUNTIME_PATH_INTERPRETER_ROOT "/etc/machine-id");
      assert_bwrap_contains (f->bwrap,
                             "--ro-bind", "/fex/etc/x86-file",
                             PV_RUNTIME_PATH_INTERPRETER_ROOT "/etc/x86-file");
      assert_bwrap_does_not_contain (f->bwrap, "/etc/x86-file");
    }
  else
    {
      assert_bwrap_contains (f->bwrap,
                             "--ro-bind", "/fex/etc/x86-file", "/etc/x86-file");
      assert_bwrap_does_not_contain (f->bwrap,
                                     PV_RUNTIME_PATH_INTERPRETER_ROOT "/etc/os-machine-id");
      assert_bwrap_does_not_contain (f->bwrap,
                                     PV_RUNTIME_PATH_INTERPRETER_ROOT "/etc/x86-file");
    }
}

static void
test_bind_merged_usr (Fixture *f,
                      gconstpointer context)
{
  static const char * const paths[] =
  {
    "bin>usr/bin",
    "home/",
    "lib>usr/lib",
    "lib32>usr/lib32",
    "lib64>usr/lib",
    "libexec>usr/libexec",
    "opt/",
    "sbin>usr/bin",
    "usr/",
  };
  g_autoptr(GError) local_error = NULL;
  gboolean ret;

  fixture_populate_dir (f, f->mock_host->fd, paths, G_N_ELEMENTS (paths));
  ret = pv_bwrap_bind_usr (f->bwrap, "/provider", f->mock_host->fd, "/run/gfx",
                           &local_error);
  g_assert_no_error (local_error);
  g_assert_true (ret);
  dump_bwrap (f->bwrap);

  assert_bwrap_contains (f->bwrap, "--symlink", "usr/bin", "/run/gfx/bin");
  assert_bwrap_contains (f->bwrap, "--symlink", "usr/lib", "/run/gfx/lib");
  assert_bwrap_contains (f->bwrap, "--symlink", "usr/lib", "/run/gfx/lib64");
  assert_bwrap_contains (f->bwrap, "--symlink", "usr/lib32", "/run/gfx/lib32");
  assert_bwrap_contains (f->bwrap, "--symlink", "usr/bin", "/run/gfx/sbin");
  assert_bwrap_contains (f->bwrap, "--ro-bind", "/provider/usr", "/run/gfx/usr");
  assert_bwrap_does_not_contain (f->bwrap, "home");
  assert_bwrap_does_not_contain (f->bwrap, "/home");
  assert_bwrap_does_not_contain (f->bwrap, "/usr/home");
  assert_bwrap_does_not_contain (f->bwrap, "libexec");
  assert_bwrap_does_not_contain (f->bwrap, "/libexec");
  assert_bwrap_does_not_contain (f->bwrap, "/usr/libexec");
  assert_bwrap_does_not_contain (f->bwrap, "opt");
  assert_bwrap_does_not_contain (f->bwrap, "/opt");
  assert_bwrap_does_not_contain (f->bwrap, "/usr/opt");
}

static void
test_bind_unmerged_usr (Fixture *f,
                        gconstpointer context)
{
  static const char * const paths[] =
  {
    "bin/",
    "home/",
    "lib/",
    "lib64/",
    "libexec/",
    "opt/",
    "sbin/",
    "usr/",
  };
  g_autoptr(GError) local_error = NULL;
  gboolean ret;

  fixture_populate_dir (f, f->mock_host->fd, paths, G_N_ELEMENTS (paths));
  ret = pv_bwrap_bind_usr (f->bwrap, "/provider", f->mock_host->fd, "/run/gfx",
                           &local_error);
  g_assert_no_error (local_error);
  g_assert_true (ret);
  dump_bwrap (f->bwrap);

  assert_bwrap_contains (f->bwrap, "--ro-bind", "/provider/bin", "/run/gfx/bin");
  assert_bwrap_contains (f->bwrap, "--ro-bind", "/provider/lib", "/run/gfx/lib");
  assert_bwrap_contains (f->bwrap, "--ro-bind", "/provider/lib64", "/run/gfx/lib64");
  assert_bwrap_contains (f->bwrap, "--ro-bind", "/provider/sbin", "/run/gfx/sbin");
  assert_bwrap_contains (f->bwrap, "--ro-bind", "/provider/usr", "/run/gfx/usr");
  assert_bwrap_does_not_contain (f->bwrap, "home");
  assert_bwrap_does_not_contain (f->bwrap, "/home");
  assert_bwrap_does_not_contain (f->bwrap, "/usr/home");
  assert_bwrap_does_not_contain (f->bwrap, "libexec");
  assert_bwrap_does_not_contain (f->bwrap, "/libexec");
  assert_bwrap_does_not_contain (f->bwrap, "/usr/libexec");
  assert_bwrap_does_not_contain (f->bwrap, "opt");
  assert_bwrap_does_not_contain (f->bwrap, "/opt");
  assert_bwrap_does_not_contain (f->bwrap, "/usr/opt");
}

static void
test_bind_usr (Fixture *f,
               gconstpointer context)
{
  static const char * const paths[] =
  {
    "bin/",
    "lib/",
    "lib64/",
    "libexec/",
    "local/",
    "share/",
  };
  g_autoptr(GError) local_error = NULL;
  gboolean ret;

  fixture_populate_dir (f, f->mock_host->fd, paths, G_N_ELEMENTS (paths));
  ret = pv_bwrap_bind_usr (f->bwrap, "/provider", f->mock_host->fd, "/run/gfx",
                           &local_error);
  g_assert_no_error (local_error);
  g_assert_true (ret);
  dump_bwrap (f->bwrap);

  assert_bwrap_contains (f->bwrap, "--ro-bind", "/provider", "/run/gfx/usr");
  assert_bwrap_contains (f->bwrap, "--symlink", "usr/bin", "/run/gfx/bin");
  assert_bwrap_contains (f->bwrap, "--symlink", "usr/lib", "/run/gfx/lib");
  assert_bwrap_contains (f->bwrap, "--symlink", "usr/lib64", "/run/gfx/lib64");
  assert_bwrap_does_not_contain (f->bwrap, "local");
  assert_bwrap_does_not_contain (f->bwrap, "/local");
  assert_bwrap_does_not_contain (f->bwrap, "/usr/local");
  assert_bwrap_does_not_contain (f->bwrap, "share");
  assert_bwrap_does_not_contain (f->bwrap, "/share");
  assert_bwrap_does_not_contain (f->bwrap, "/usr/share");
}

/*
 * Test that pv_export_root_dirs_like_filesystem_host() behaves the same
 * as Flatpak --filesystem=host.
 */
static void
test_export_root_dirs (Fixture *f,
                       gconstpointer context)
{
  static const char * const paths[] =
  {
    "boot/",
    "bin>usr/bin",
    "dev/pts/",
    "etc/hosts",
    "games/SteamLibrary/",
    "home/user/.steam",
    "lib>usr/lib",
    "lib32>usr/lib32",
    "lib64>usr/lib",
    "libexec>usr/libexec",
    "opt/extras/kde/",
    "proc/1/fd/",
    "root/",
    "run/dbus/",
    "run/gfx/",
    "run/host/",
    "run/media/",
    "run/pressure-vessel/",
    "run/systemd/",
    "tmp/",
    "sbin>usr/bin",
    "sys/",
    "usr/local/",
    "var/tmp/",
  };
  g_autoptr(GError) local_error = NULL;
  gboolean ret;

  fixture_create_exports (f);
  g_assert_nonnull (f->context->exports);
  fixture_populate_dir (f, f->mock_host->fd, paths, G_N_ELEMENTS (paths));
  ret = pv_export_root_dirs_like_filesystem_host (f->mock_host->fd,
                                                  f->context->exports,
                                                  FLATPAK_FILESYSTEM_MODE_READ_WRITE,
                                                  _srt_dirent_strcmp,
                                                  &local_error);
  g_assert_no_error (local_error);
  g_assert_true (ret);
  flatpak_exports_append_bwrap_args (f->context->exports, f->bwrap);

  dump_bwrap (f->bwrap);

  /* We don't export mutable OS state in this particular function,
   * for parity with Flatpak --filesystem=host (which does not imply
   * --filesystem=/tmp or --filesystem=/var) */
  assert_bwrap_does_not_contain (f->bwrap, "/etc");
  assert_bwrap_does_not_contain (f->bwrap, "/tmp");
  assert_bwrap_does_not_contain (f->bwrap, "/var");

  /* We do export miscellaneous top-level directories */
  assert_bwrap_contains (f->bwrap, "--bind", "/games", "/games");
  assert_bwrap_contains (f->bwrap, "--bind", "/home", "/home");
  assert_bwrap_contains (f->bwrap, "--bind", "/opt", "/opt");

  /* /run/media gets a special case here for parity with Flatpak's
   * --filesystem=host, even though it's not top-level */
  assert_bwrap_contains (f->bwrap, "--bind", "/run/media", "/run/media");

  /* We don't export /usr and friends in this particular function
   * (flatpak --filesystem=host would mount them in /run/host instead) */
  assert_bwrap_does_not_contain (f->bwrap, "/bin");
  assert_bwrap_does_not_contain (f->bwrap, "/lib");
  assert_bwrap_does_not_contain (f->bwrap, "/lib32");
  assert_bwrap_does_not_contain (f->bwrap, "/lib64");
  assert_bwrap_does_not_contain (f->bwrap, "/usr");
  assert_bwrap_does_not_contain (f->bwrap, "/sbin");

  /* We don't export these for various reasons */
  assert_bwrap_does_not_contain (f->bwrap, "/app");
  assert_bwrap_does_not_contain (f->bwrap, "/boot");
  assert_bwrap_does_not_contain (f->bwrap, "/dev");
  assert_bwrap_does_not_contain (f->bwrap, "/dev/pts");
  assert_bwrap_does_not_contain (f->bwrap, "/libexec");
  assert_bwrap_does_not_contain (f->bwrap, "/proc");
  assert_bwrap_does_not_contain (f->bwrap, "/root");
  assert_bwrap_does_not_contain (f->bwrap, "/run");
  assert_bwrap_does_not_contain (f->bwrap, "/run/dbus");
  assert_bwrap_does_not_contain (f->bwrap, "/run/gfx");
  assert_bwrap_does_not_contain (f->bwrap, "/run/host");
  assert_bwrap_does_not_contain (f->bwrap, "/run/pressure-vessel");
  assert_bwrap_does_not_contain (f->bwrap, "/run/systemd");
  assert_bwrap_does_not_contain (f->bwrap, "/sys");

  /* We would export these if they existed, but they don't */
  assert_bwrap_does_not_contain (f->bwrap, "/mnt");
  assert_bwrap_does_not_contain (f->bwrap, "/srv");
}

static void
test_path_visible_in_provider_namespace (Fixture *f,
                                         gconstpointer context)
{
  static const char * const yes[] =
    {
      "/usr/bin/env",
      "/usr/lib64/libc.so.6",
      "/usr/bin/env",
      "/lib32/libstdc++.so.5",
      "/bin/sh",
      "/sbin/ldconfig",
    };
  static const char * const no[] =
    {
      "/home/smcv",
      "/media/ssd",
      "/opt/mangohud/MangoHud.so",
    };

  for (size_t i = 0; i < G_N_ELEMENTS (yes); i++)
    {
      g_test_message ("%s is like /usr", yes[i]);
      g_assert_true (path_visible_in_provider_namespace (PV_RUNTIME_FLAGS_NONE, yes[i]));
      g_assert_true (path_visible_in_provider_namespace (PV_RUNTIME_FLAGS_MASK, yes[i]));
    }

  for (size_t i = 0; i < G_N_ELEMENTS (no); i++)
    {
      g_test_message ("%s is not like /usr", no[i]);
      g_assert_false (path_visible_in_provider_namespace (PV_RUNTIME_FLAGS_NONE, no[i]));
      g_assert_false (path_visible_in_provider_namespace (PV_RUNTIME_FLAGS_MASK, no[i]));
    }

  g_test_message ("/app/bin is only like /usr under Flatpak");
  g_assert_false (path_visible_in_provider_namespace (PV_RUNTIME_FLAGS_NONE, "/app/bin"));
  g_assert_true (path_visible_in_provider_namespace (PV_RUNTIME_FLAGS_FLATPAK_SUBSANDBOX,
                                                     "/app/bin"));
}

/*
 * Check that pv-wrap defaults are as expected
 */
static void
test_options_defaults (Fixture *f,
                       gconstpointer context)
{
  const PvWrapOptions *options = &f->context->options;
  size_t i;

  /*
   * First iteration: Check the defaults.
   * Second iteration: Check the defaults after parsing empty argv.
   */
  for (i = 0; i < 2; i++)
    {
      static const char * const original_argv[] =
      {
        "pressure-vessel-wrap-test",
        "--",
        "COMMAND",
        "ARGS",
        NULL
      };
      static const char * const expected_argv[] =
      {
        "pressure-vessel-wrap-test",
        "COMMAND",
        "ARGS",
        NULL
      };
      /* This slightly strange copying ensures that we can still free
       * strings that were removed from argv during parsing */
      g_auto(GStrv) argv_copy = _srt_strdupv (original_argv);
      g_autofree gchar **argv = g_memdup2 (argv_copy, sizeof (original_argv));
      g_autofree gchar *private_home = NULL;
      g_autoptr(GError) local_error = NULL;
      int argc = G_N_ELEMENTS (original_argv) - 1;
      PvHomeMode home_mode = PV_HOME_MODE_TRANSIENT;
      FlatpakFilesystemMode mode;
      gboolean ok;

      g_assert_null (options->filesystems);
      mode = (FlatpakFilesystemMode) 23;
      g_assert_false (pv_wrap_context_has_filesystem (f->context, "host", &mode));
      /* mode was not modified if false is returned */
      g_assert_cmpint (mode, ==, 23);
      g_assert_false (pv_wrap_context_has_filesystem (f->context, "host", NULL));

      g_assert_null (options->env_if_host);
      g_assert_cmpstr (options->freedesktop_app_id, ==, NULL);
      g_assert_cmpstr (options->graphics_provider, ==, NULL);
      g_assert_cmpstr (options->home, ==, NULL);
      g_assert_cmpuint (options->pass_fds->len, ==, 0);
      g_assert_cmpuint (options->preload_modules->len, ==, 0);
      g_assert_cmpstr (options->runtime, ==, NULL);
      g_assert_cmpstr (options->runtime_base, ==, NULL);
      g_assert_cmpstr (options->steam_app_id, ==, NULL);
      g_assert_cmpstr (options->variable_dir, ==, NULL);
      g_assert_cmpstr (options->write_final_argv, ==, NULL);
      g_assert_cmpfloat (options->terminate_idle_timeout, <=, 0);
      g_assert_cmpfloat (options->terminate_idle_timeout, >=, 0);
      g_assert_cmpfloat (options->terminate_timeout, <, 0);
      g_assert_cmpint (options->shell, ==, PV_SHELL_NONE);
      g_assert_cmpint (options->terminal, ==, PV_TERMINAL_AUTO);
      g_assert_cmpint (options->share_home, ==, TRISTATE_MAYBE);
      g_assert_cmpint (options->batch, ==, FALSE);
      g_assert_cmpint (options->copy_runtime, ==, FALSE);
      g_assert_cmpint (options->deterministic, ==, FALSE);
      g_assert_cmpint (options->devel, ==, FALSE);
      g_assert_cmpint (options->for_steam_client, ==, FALSE);
      g_assert_cmpint (options->gc_runtimes, ==, TRUE);
      g_assert_cmpint (options->generate_locales, ==, TRUE);
      g_assert_cmpint (options->import_openxr_1_runtimes, ==, FALSE);
      g_assert_cmpint (options->import_openxr_1_layers, ==, FALSE);
      g_assert_cmpint (options->import_vulkan_layers, ==, TRUE);
      g_assert_cmpint (options->launcher, ==, FALSE);
      g_assert_cmpint (options->only_prepare, ==, FALSE);
      g_assert_cmpint (options->remove_game_overlay, ==, FALSE);
      g_assert_cmpint (options->share_pid, ==, TRUE);
      g_assert_cmpint (options->single_thread, ==, FALSE);
      g_assert_cmpint (options->systemd_scope, ==, FALSE);
      g_assert_cmpint (options->test, ==, FALSE);
      g_assert_cmpint (options->verbose, ==, FALSE);
      g_assert_cmpint (options->version, ==, FALSE);
      g_assert_cmpint (options->version_only, ==, FALSE);

      ok = pv_wrap_context_parse_argv (f->context, &argc, &argv, &local_error);
      g_assert_no_error (local_error);
      g_assert_true (ok);

      g_assert_cmpint (f->context->original_argc,
                       ==, G_N_ELEMENTS (original_argv) - 1);
      g_assert_cmpstrv (f->context->original_argv, (gchar **) original_argv);
      g_assert_cmpstrv (argv, (gchar **) expected_argv);

      ok = pv_wrap_context_choose_home_mode (f->context,
                                             &home_mode,
                                             &private_home,
                                             NULL,
                                             &local_error);
      g_assert_no_error (local_error);
      g_assert_true (ok);
      g_assert_cmpint (home_mode, ==, PV_HOME_MODE_SHARED);
      g_assert_null (private_home);
    }
}

/*
 * Check the effect of explicitly setting various CLI options to false
 * or empty.
 */
static void
test_options_false (Fixture *f,
                    gconstpointer context)
{
  static const char * const original_argv[] =
  {
    "pressure-vessel-wrap-test",
    "--graphics-provider=",
    "--no-copy-runtime",
    "--no-gc-runtimes",
    "--no-generate-locales",
    "--no-import-openxr-1-runtimes",
    "--no-import-openxr-1-layers",
    "--no-import-vulkan-layers",
    "--no-systemd-scope",
    "--runtime=",
    "--steam-app-id=123",   /* necessary so we will accept --unshare-home */
    "--terminal=none",
    "--terminate-idle-timeout=0",
    "--terminate-timeout=0",
    "--unshare-home",
    "--unshare-pid",
    "--",
    "COMMAND",
    "ARGS",
    NULL
  };
  static const char * const expected_argv[] =
  {
    "pressure-vessel-wrap-test",
    "COMMAND",
    "ARGS",
    NULL
  };
  const PvWrapOptions *options = &f->context->options;
  /* This slightly strange copying ensures that we can still free
   * strings that were removed from argv during parsing */
  g_auto(GStrv) argv_copy = _srt_strdupv (original_argv);
  g_autofree gchar **argv = g_memdup2 (argv_copy, sizeof (original_argv));
  g_autofree gchar *private_home = NULL;
  g_autoptr(GError) local_error = NULL;
  int argc = G_N_ELEMENTS (original_argv) - 1;
  PvHomeMode home_mode = PV_HOME_MODE_SHARED;
  const char *steam_app_id = NULL;
  gboolean ok;

  ok = pv_wrap_context_parse_argv (f->context, &argc, &argv, &local_error);
  g_assert_no_error (local_error);
  g_assert_true (ok);

  ok = pv_wrap_context_choose_home_mode (f->context,
                                         &home_mode,
                                         &private_home,
                                         &steam_app_id,
                                         &local_error);
  g_assert_no_error (local_error);
  g_assert_true (ok);
  g_assert_cmpint (home_mode, ==, PV_HOME_MODE_PRIVATE);
  g_assert_cmpstr (steam_app_id, ==, "123");
  g_assert_cmpstr (private_home, ==, "/home/me/.var/app/com.steampowered.App123");

  g_assert_cmpint (f->context->original_argc,
                   ==, G_N_ELEMENTS (original_argv) - 1);
  g_assert_cmpstrv (f->context->original_argv, (gchar **) original_argv);
  g_assert_cmpstrv (argv, (gchar **) expected_argv);

  g_assert_false (pv_wrap_context_has_filesystem (f->context, "host", NULL));

  g_assert_null (options->env_if_host);
  g_assert_null (options->filesystems);
  g_assert_cmpstr (options->freedesktop_app_id, ==, "com.steampowered.App123");
  g_assert_cmpstr (options->graphics_provider, ==, "");
  g_assert_cmpstr (options->home, ==, NULL);
  g_assert_cmpuint (options->pass_fds->len, ==, 0);
  g_assert_cmpuint (options->preload_modules->len, ==, 0);
  g_assert_cmpstr (options->runtime, ==, "");
  g_assert_cmpstr (options->runtime_base, ==, NULL);
  g_assert_cmpstr (options->steam_app_id, ==, "123");
  g_assert_cmpstr (options->variable_dir, ==, NULL);
  g_assert_cmpstr (options->write_final_argv, ==, NULL);
  g_assert_cmpfloat (options->terminate_idle_timeout, <=, 0);
  g_assert_cmpfloat (options->terminate_idle_timeout, >=, 0);
  g_assert_cmpfloat (options->terminate_timeout, >=, 0);
  g_assert_cmpfloat (options->terminate_timeout, <=, 0);
  g_assert_cmpint (options->shell, ==, PV_SHELL_NONE);
  g_assert_cmpint (options->terminal, ==, PV_TERMINAL_NONE);
  g_assert_cmpint (options->share_home, ==, TRISTATE_NO);
  g_assert_cmpint (options->batch, ==, FALSE);
  g_assert_cmpint (options->copy_runtime, ==, FALSE);
  g_assert_cmpint (options->deterministic, ==, FALSE);
  g_assert_cmpint (options->devel, ==, FALSE);
  g_assert_cmpint (options->for_steam_client, ==, FALSE);
  g_assert_cmpint (options->gc_runtimes, ==, FALSE);
  g_assert_cmpint (options->generate_locales, ==, FALSE);
  g_assert_cmpint (options->import_openxr_1_runtimes, ==, FALSE);
  g_assert_cmpint (options->import_openxr_1_layers, ==, FALSE);
  g_assert_cmpint (options->import_vulkan_layers, ==, FALSE);
  g_assert_cmpint (options->launcher, ==, FALSE);
  g_assert_cmpint (options->only_prepare, ==, FALSE);
  g_assert_cmpint (options->remove_game_overlay, ==, FALSE);
  g_assert_cmpint (options->share_pid, ==, FALSE);
  g_assert_cmpint (options->single_thread, ==, FALSE);
  g_assert_cmpint (options->systemd_scope, ==, FALSE);
  g_assert_cmpint (options->test, ==, FALSE);
  g_assert_cmpint (options->verbose, ==, FALSE);
  g_assert_cmpint (options->version, ==, FALSE);
  g_assert_cmpint (options->version_only, ==, FALSE);
}

/*
 * Check various command-line options that are invalid or otherwise
 * not allowed.
 */
static void
test_options_invalid (Fixture *f,
                      gconstpointer context)
{
  /* We don't implement all of the special tokens from Flatpak yet.
   * We explicitly reject the ones we don't implement instead of ignoring,
   * so that their meaning will not change if we expand coverage.
   *
   * Similarly we don't accept HOME-relative paths starting with "~/".
   *
   * Similarly we don't accept Flatpak's :ro, :rw etc. suffixes,
   * backslash-escaped colons, or backslash-escaped backslashes. */
  static const char * const invalid_fs[] =
  {
    "home",
    "home:ro",
    "home:rw",
    "host-reset",
    "host:reset",
    "xdg-cache",
    "xdg-config",
    "xdg-data",
    "xdg-desktop",
    "xdg-documents",
    "xdg-download",
    "xdg-download/Games",
    "xdg-music",
    "xdg-pictures",
    "xdg-public-share",
    "xdg-run/pipewire",
    "xdg-templates",
    "xdg-videos",
    "~",
  };

  for (size_t i = 0; i < G_N_ELEMENTS (invalid_fs); i++)
    {
      g_autoptr(GPtrArray) argv = g_ptr_array_new_with_free_func (g_free);
      g_autofree gchar **modifiable_argv = NULL;
      g_autoptr(GError) local_error = NULL;
      const char *fs = invalid_fs[i];
      int argc;
      gboolean ok;

      g_ptr_array_add (argv, g_strdup ("pressure-vessel-wrap-test"));
      g_ptr_array_add (argv, g_strdup_printf ("--filesystem=%s", fs));
      g_ptr_array_add (argv, g_strdup ("--"));
      g_ptr_array_add (argv, g_strdup ("true"));
      g_assert_true (argv->len < (unsigned int) INT_MAX);
      argc = (int) argv->len;
      g_ptr_array_add (argv, NULL);

      modifiable_argv = g_memdup2 (argv->pdata, argv->len * sizeof (char *));

      fixture_recreate_context (f);
      ok = pv_wrap_context_parse_argv (f->context,
                                       &argc, &modifiable_argv,
                                       &local_error);

      if (local_error != NULL)
        g_test_message ("--filesystem=%s => error as expected: %s %d: %s",
                        fs, g_quark_to_string (local_error->domain),
                        local_error->code, local_error->message);
      else
        g_test_message ("--filesystem=%s => unexpectedly succeeded", fs);

      g_assert_nonnull (local_error);
      /* We accept any code: in practice it's G_OPTION_ERROR_FAILED,
       * but it's bad style to check for generic _FAILED error codes */
      g_assert_cmpstr (g_quark_to_string (local_error->domain),
                       ==, g_quark_to_string (G_OPTION_ERROR));
      g_assert_false (ok);
    }
}

/*
 * Check options that are implied by --for-steam-client.
 */
static void
test_options_steam_client (Fixture *f,
                           gconstpointer context)
{
  static const char * const original_argv[] =
  {
    "pressure-vessel-wrap-test",
    "--unshare-home",
    "--for-steam-client",
    NULL
  };
  static const char * const expected_argv[] =
  {
    "pressure-vessel-wrap-test",
    NULL
  };
  static const char * const expected_filesystems[] =
  {
    "host",
    "host-root",
    NULL
  };
  g_autoptr(GError) local_error = NULL;
  g_auto(GStrv) argv_copy = _srt_strdupv (original_argv);
  g_autofree void **filesystem_keys = NULL;
  g_autofree gchar **modifiable_argv = g_memdup2 (argv_copy, sizeof (original_argv));
  const PvWrapOptions *options = &f->context->options;
  PvHomeMode home_mode = PV_HOME_MODE_TRANSIENT;
  int argc = G_N_ELEMENTS (original_argv) - 1;
  gboolean ok;
  guint n;

  ok = pv_wrap_context_parse_argv (f->context, &argc, &modifiable_argv,
                                   &local_error);
  g_assert_no_error (local_error);
  g_assert_true (ok);

  ok = pv_wrap_context_choose_home_mode (f->context, &home_mode, NULL, NULL,
                                         &local_error);
  g_assert_no_error (local_error);
  g_assert_true (ok);
  g_assert_cmpint (home_mode, ==, PV_HOME_MODE_SHARED);

  ok = pv_wrap_context_after_parsing_arguments (f->context,
                                                PV_WRAP_TEST_FLAGS_MOCK_BWRAP,
                                                &local_error);
  g_assert_no_error (local_error);
  g_assert_true (ok);

  g_assert_cmpint (f->context->original_argc,
                   ==, G_N_ELEMENTS (original_argv) - 1);
  g_assert_cmpstrv (f->context->original_argv, (gchar **) original_argv);
  g_assert_cmpstrv (modifiable_argv, (gchar **) expected_argv);

  filesystem_keys = g_hash_table_get_keys_as_array (options->filesystems, &n);
  qsort (filesystem_keys, n, sizeof (char *), _srt_indirect_strcmp0);
  g_assert_cmpstrv ((char **) filesystem_keys, (char **) expected_filesystems);

  for (size_t i = 0; i < n; i++)
    {
      const char *fs = expected_filesystems[i];
      FlatpakFilesystemMode mode;

      mode = FLATPAK_FILESYSTEM_MODE_NONE;
      g_assert_true (pv_wrap_context_has_filesystem (f->context, fs, &mode));
      g_assert_cmpint (mode, ==, FLATPAK_FILESYSTEM_MODE_READ_WRITE);
      g_assert_true (pv_wrap_context_has_filesystem (f->context, fs, NULL));
    }
}

/*
 * Check the effect of explicitly setting various CLI options to true
 * or non-empty.
 */
static void
test_options_true (Fixture *f,
                   gconstpointer context)
{
  static const char * const original_argv[] =
  {
    "pressure-vessel-wrap-test",
    "--batch",
    "--copy-runtime",
    "--deterministic",
    "--devel",
    "--env-if-host=ONE=1",
    "--env-if-host=TWO=two",
    "--filesystem=host:ro",
    "--filesystem=host-etc:rw",         /* accepted but ignored */
    "--filesystem=host-os:ro",          /* accepted but ignored */
    "--filesystem=~/create:create",
    "--filesystem=/media/escaped\\:colon",
    "--filesystem=/media/escaped\\\\backslash",
    "--filesystem=/media/silly\\name",
    "--filesystem=/ro:ro",
    "--filesystem=/rw:rw",
    "--filesystem=/without/mode",
    "--filesystem=host-root:ro",
    "--for-steam-client",
    "--freedesktop-app-id=com.example.Foo",
    "--gc-runtimes",
    "--generate-locales",
    "--graphics-provider=/gfx",
    "--home=/home/steam",
    "--import-openxr-1-runtimes",
    "--import-openxr-1-layers",
    "--import-vulkan-layers",
    "--launcher",
    "--ld-audit=libaudit.so",
    "--ld-audits=libaudit1.so:libaudit2.so",
    "--ld-preload=libpreload.so",
    "--ld-preloads=libpreload1.so libpreload2.so:libpreload3.so",
    "--only-prepare",
    "--pass-fd=2",
    "--remove-game-overlay",
    "--runtime=sniper",
    "--runtime-base=/runtimes",
    "--share-home",
    "--share-pid",
    "--shell=instead",
    "--single-thread",
    "--steam-app-id=12345",
    "--systemd-scope",
    "--terminal=xterm",
    "--terminate-idle-timeout=10",
    "--terminate-timeout=5",
    "--test",
    "--variable-dir=/runtimes/var",
    "--verbose",
    "--version",
    "--version-only",
    "--write-final-argv=/dev/null",
    NULL
  };
  static const char * const expected_argv[] =
  {
    "pressure-vessel-wrap-test",
    NULL
  };
  static const char * const expected_env_if_host[] =
  {
    "ONE=1",
    "TWO=two",
    NULL
  };
  static const char * const expected_filesystems[] =
  {
    "/media/escaped:colon",
    "/media/escaped\\backslash",
    "/media/sillyname",
    "/ro",
    "/rw",
    "/without/mode",
    "host",
    "host-etc",
    "host-os",
    "host-root",
    "~/create",
    NULL
  };
  const PvWrapOptions *options = &f->context->options;
  /* This slightly strange copying ensures that we can still free
   * strings that were removed from argv during parsing */
  g_auto(GStrv) argv_copy = _srt_strdupv (original_argv);
  g_autofree gchar **argv = g_memdup2 (argv_copy, sizeof (original_argv));
  g_autofree gchar *private_home = NULL;
  g_autofree void **filesystem_keys = NULL;
  g_autoptr(GError) local_error = NULL;
  int argc = G_N_ELEMENTS (original_argv) - 1;
  PvHomeMode home_mode = PV_HOME_MODE_TRANSIENT;
  const char *steam_app_id = NULL;
  const WrapPreloadModule *module;
  gsize i = 0;
  gboolean ok;
  guint n;

  ok = pv_wrap_context_parse_argv (f->context, &argc, &argv, &local_error);
  g_assert_no_error (local_error);
  g_assert_true (ok);

  ok = pv_wrap_context_choose_home_mode (f->context,
                                         &home_mode,
                                         &private_home,
                                         &steam_app_id,
                                         &local_error);
  g_assert_no_error (local_error);
  g_assert_true (ok);
  /* --share-home takes precedence over --home */
  g_assert_cmpint (home_mode, ==, PV_HOME_MODE_SHARED);
  g_assert_cmpstr (steam_app_id, ==, "12345");
  /* --share-home takes precedence over --home */
  g_assert_cmpstr (private_home, ==, NULL);

  g_assert_cmpint (f->context->original_argc,
                   ==, G_N_ELEMENTS (original_argv) - 1);
  g_assert_cmpstrv (f->context->original_argv, (gchar **) original_argv);
  g_assert_cmpstrv (argv, (gchar **) expected_argv);

  filesystem_keys = g_hash_table_get_keys_as_array (options->filesystems, &n);
  qsort (filesystem_keys, n, sizeof (char *), _srt_indirect_strcmp0);
  g_assert_cmpstrv ((char **) filesystem_keys, (char **) expected_filesystems);

  for (i = 0; i < n; i++)
    {
      const char *fs = expected_filesystems[i];
      FlatpakFilesystemMode mode;

      mode = FLATPAK_FILESYSTEM_MODE_NONE;
      g_assert_true (pv_wrap_context_has_filesystem (f->context, fs, &mode));

      if (g_str_equal (fs, "~/create"))
        g_assert_cmpint (mode, ==, FLATPAK_FILESYSTEM_MODE_CREATE);
      else if (g_str_equal (fs, "/ro")
               || g_str_equal (fs, "host")
               || g_str_equal (fs, "host-os")
               || g_str_equal (fs, "host-root"))
        g_assert_cmpint (mode, ==, FLATPAK_FILESYSTEM_MODE_READ_ONLY);
      else
        g_assert_cmpint (mode, ==, FLATPAK_FILESYSTEM_MODE_READ_WRITE);

      g_assert_true (pv_wrap_context_has_filesystem (f->context, fs, NULL));
    }

  g_assert_cmpstrv (options->env_if_host, (gchar **) expected_env_if_host);
  g_assert_cmpstr (options->freedesktop_app_id, ==, "com.example.Foo");
  g_assert_cmpstr (options->graphics_provider, ==, "/gfx");
  g_assert_cmpstr (options->home, ==, "/home/steam");
  g_assert_cmpuint (options->pass_fds->len, ==, 1);
  g_assert_cmpint (g_array_index (options->pass_fds, int, 0), ==, 2);
  g_assert_cmpstr (options->runtime, ==, "sniper");
  g_assert_cmpstr (options->runtime_base, ==, "/runtimes");
  g_assert_cmpstr (options->steam_app_id, ==, "12345");
  g_assert_cmpstr (options->variable_dir, ==, "/runtimes/var");
  g_assert_cmpstr (options->write_final_argv, ==, "/dev/null");
  g_assert_cmpfloat (options->terminate_idle_timeout, <=, 10);
  g_assert_cmpfloat (options->terminate_idle_timeout, >=, 10);
  g_assert_cmpfloat (options->terminate_timeout, >=, 5);
  g_assert_cmpfloat (options->terminate_timeout, <=, 5);
  g_assert_cmpint (options->shell, ==, PV_SHELL_INSTEAD);
  g_assert_cmpint (options->terminal, ==, PV_TERMINAL_XTERM);
  g_assert_cmpint (options->share_home, ==, TRISTATE_YES);
  g_assert_cmpint (options->batch, ==, TRUE);
  g_assert_cmpint (options->copy_runtime, ==, TRUE);
  g_assert_cmpint (options->deterministic, ==, TRUE);
  g_assert_cmpint (options->devel, ==, TRUE);
  g_assert_cmpint (options->for_steam_client, ==, TRUE);
  g_assert_cmpint (options->gc_runtimes, ==, TRUE);
  g_assert_cmpint (options->generate_locales, ==, TRUE);
  g_assert_cmpint (options->import_openxr_1_runtimes, ==, TRUE);
  g_assert_cmpint (options->import_openxr_1_layers, ==, TRUE);
  g_assert_cmpint (options->import_vulkan_layers, ==, TRUE);
  g_assert_cmpint (options->launcher, ==, TRUE);
  g_assert_cmpint (options->only_prepare, ==, TRUE);
  g_assert_cmpint (options->remove_game_overlay, ==, TRUE);
  g_assert_cmpint (options->share_pid, ==, TRUE);
  g_assert_cmpint (options->single_thread, ==, TRUE);
  g_assert_cmpint (options->systemd_scope, ==, TRUE);
  g_assert_cmpint (options->test, ==, TRUE);
  g_assert_cmpint (options->verbose, ==, TRUE);
  g_assert_cmpint (options->version, ==, TRUE);
  g_assert_cmpint (options->version_only, ==, TRUE);

  i = 0;

  g_assert_cmpuint (options->preload_modules->len, >, i);
  module = &g_array_index (options->preload_modules, WrapPreloadModule, i++);
  g_assert_cmpint (module->which, ==, PV_PRELOAD_VARIABLE_INDEX_LD_AUDIT);
  g_assert_cmpstr (module->preload, ==, "libaudit.so");

  g_assert_cmpuint (options->preload_modules->len, >, i);
  module = &g_array_index (options->preload_modules, WrapPreloadModule, i++);
  g_assert_cmpint (module->which, ==, PV_PRELOAD_VARIABLE_INDEX_LD_AUDIT);
  g_assert_cmpstr (module->preload, ==, "libaudit1.so");

  g_assert_cmpuint (options->preload_modules->len, >, i);
  module = &g_array_index (options->preload_modules, WrapPreloadModule, i++);
  g_assert_cmpint (module->which, ==, PV_PRELOAD_VARIABLE_INDEX_LD_AUDIT);
  g_assert_cmpstr (module->preload, ==, "libaudit2.so");

  g_assert_cmpuint (options->preload_modules->len, >, i);
  module = &g_array_index (options->preload_modules, WrapPreloadModule, i++);
  g_assert_cmpint (module->which, ==, PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD);
  g_assert_cmpstr (module->preload, ==, "libpreload.so");

  g_assert_cmpuint (options->preload_modules->len, >, i);
  module = &g_array_index (options->preload_modules, WrapPreloadModule, i++);
  g_assert_cmpint (module->which, ==, PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD);
  g_assert_cmpstr (module->preload, ==, "libpreload1.so");

  g_assert_cmpuint (options->preload_modules->len, >, i);
  module = &g_array_index (options->preload_modules, WrapPreloadModule, i++);
  g_assert_cmpint (module->which, ==, PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD);
  g_assert_cmpstr (module->preload, ==, "libpreload2.so");

  g_assert_cmpuint (options->preload_modules->len, >, i);
  module = &g_array_index (options->preload_modules, WrapPreloadModule, i++);
  g_assert_cmpint (module->which, ==, PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD);
  g_assert_cmpstr (module->preload, ==, "libpreload3.so");

  g_assert_cmpuint (i, ==, options->preload_modules->len);
}

static void
test_make_symlink_in_container (Fixture *f,
                                gconstpointer context)
{
  const Config *config = context;
  g_autoptr(GError) error = NULL;
  gboolean ok;
  SrtSysroot *mutable_sysroot;

  fixture_create_runtime (f, config->runtime_flags);
  g_assert_nonnull (f->context->runtime);
  mutable_sysroot = pv_runtime_get_mutable_sysroot (f->context->runtime);

  if (config->runtime_flags & PV_RUNTIME_FLAGS_COPY_RUNTIME)
    g_assert_nonnull (mutable_sysroot);
  else
    g_assert_null (mutable_sysroot);

  /* Successful cases */

  ok = pv_runtime_make_symlink_in_container (f->context->runtime, f->bwrap,
                                             "../usr/lib/os-release",
                                             "/etc/os-release",
                                             PV_RUNTIME_EMULATION_ROOTS_BOTH,
                                             &error);
  g_assert_no_error (error);
  g_assert_true (ok);

  ok = pv_runtime_make_symlink_in_container (f->context->runtime, f->bwrap,
                                             "/run/host/foo",
                                             "/var/foo",
                                             PV_RUNTIME_EMULATION_ROOTS_REAL_ONLY,
                                             &error);
  g_assert_no_error (error);
  g_assert_true (ok);

  ok = pv_runtime_make_symlink_in_container (f->context->runtime, f->bwrap,
                                             "/run/x86/bar",
                                             "/var/bar",
                                             PV_RUNTIME_EMULATION_ROOTS_INTERPRETER_ONLY,
                                             &error);
  g_assert_no_error (error);
  g_assert_true (ok);

  /* Conditionally OK, if there is an on-disk directory we can edit */

  ok = pv_runtime_make_symlink_in_container (f->context->runtime, f->bwrap,
                                             "/run/host/foo",
                                             "/usr/foo",
                                             PV_RUNTIME_EMULATION_ROOTS_REAL_ONLY,
                                             &error);

  if (mutable_sysroot == NULL)
    {
      g_assert_error (error, G_IO_ERROR, G_IO_ERROR_READ_ONLY);
      g_assert_false (ok);
      g_test_message ("Editing /usr not allowed, as expected: %s",
                      error->message);
      g_clear_error (&error);
    }
  else if (config->runtime_flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT)
    {
      g_assert_error (error, G_IO_ERROR, G_IO_ERROR_READ_ONLY);
      g_assert_false (ok);
      g_test_message ("Editing real /usr not allowed, as expected: %s",
                      error->message);
      g_clear_error (&error);
    }
  else
    {
      g_assert_no_error (error);
      g_assert_true (ok);

    }

  ok = pv_runtime_make_symlink_in_container (f->context->runtime, f->bwrap,
                                             "/run/x86/bar",
                                             "/usr/bar",
                                             PV_RUNTIME_EMULATION_ROOTS_INTERPRETER_ONLY,
                                             &error);

  if (mutable_sysroot == NULL)
    {
      g_assert_error (error, G_IO_ERROR, G_IO_ERROR_READ_ONLY);
      g_assert_false (ok);
      g_test_message ("Editing /usr not allowed, as expected: %s",
                      error->message);
      g_clear_error (&error);
    }
  else
    {
      g_assert_no_error (error);
      g_assert_true (ok);
    }

  ok = pv_runtime_make_symlink_in_container (f->context->runtime, f->bwrap,
                                             "/run/baz",
                                             "/usr/baz",
                                             PV_RUNTIME_EMULATION_ROOTS_BOTH,
                                             &error);

  if (mutable_sysroot == NULL)
    {
      g_assert_error (error, G_IO_ERROR, G_IO_ERROR_READ_ONLY);
      g_assert_false (ok);
      g_test_message ("Editing /usr not allowed, as expected: %s",
                      error->message);
      g_clear_error (&error);
    }
  else if (config->runtime_flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT)
    {
      g_assert_error (error, G_IO_ERROR, G_IO_ERROR_READ_ONLY);
      g_assert_false (ok);
      g_test_message ("Editing real /usr not allowed, as expected: %s",
                      error->message);
      g_clear_error (&error);
    }
  else
    {
      g_assert_no_error (error);
      g_assert_true (ok);
    }

  /* Error cases */

  ok = pv_runtime_make_symlink_in_container (f->context->runtime, f->bwrap,
                                             "/nope",
                                             "/nope",
                                             PV_RUNTIME_EMULATION_ROOTS_REAL_ONLY,
                                             &error);
  g_assert_error (error, G_IO_ERROR, G_IO_ERROR_READ_ONLY);
  g_assert_false (ok);
  g_test_message ("Editing /nope not allowed, as expected: %s", error->message);
  g_clear_error (&error);

  /* Check that the right things happened */

  dump_bwrap (f->bwrap);
  assert_bwrap_does_not_contain (f->bwrap, "/nope");
  /* /etc/os-release is in the real root (and, if used, the interpreter
   * root, but that's checked later) */
  assert_bwrap_contains (f->bwrap,
                         "--symlink", "../usr/lib/os-release", "/etc/os-release");
  /* /var/foo is in the real root only */
  assert_bwrap_contains (f->bwrap,
                         "--symlink", "/run/host/foo", "/var/foo");
  assert_bwrap_does_not_contain (f->bwrap,
                                 PV_RUNTIME_PATH_INTERPRETER_ROOT "/var/foo");

  if (config->runtime_flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT)
    {
      /* /etc/os-release is in the interpreter root (and the real root) */
      assert_bwrap_contains (f->bwrap,
                             "--symlink", "../usr/lib/os-release",
                             PV_RUNTIME_PATH_INTERPRETER_ROOT "/etc/os-release");
      /* /var/bar is in the interpreter root only */
      assert_bwrap_contains (f->bwrap,
                             "--symlink", "/run/x86/bar",
                             PV_RUNTIME_PATH_INTERPRETER_ROOT "/var/bar");
    }
  else
    {
      /* We're not using an interpreter root */
      assert_bwrap_does_not_contain (f->bwrap,
                                     PV_RUNTIME_PATH_INTERPRETER_ROOT "/etc/os-release");
      assert_bwrap_does_not_contain (f->bwrap,
                                     PV_RUNTIME_PATH_INTERPRETER_ROOT "/var/bar");

      /* /var/bar would have been in the interpreter root only, but because
       * we don't have an interpreter root, it ends up in the real root */
      assert_bwrap_contains (f->bwrap, "--symlink", "/run/x86/bar", "/var/bar");
    }

  /* We must not try to edit /usr with --symlink: that can't work,
   * because /usr is read-only */
  assert_bwrap_does_not_contain (f->bwrap, "/usr/foo");
  assert_bwrap_does_not_contain (f->bwrap, "/usr/bar");
  assert_bwrap_does_not_contain (f->bwrap, "/usr/baz");
  assert_bwrap_does_not_contain (f->bwrap,
                                 PV_RUNTIME_PATH_INTERPRETER_ROOT "/usr/foo");
  assert_bwrap_does_not_contain (f->bwrap,
                                 PV_RUNTIME_PATH_INTERPRETER_ROOT "/usr/bar");
  assert_bwrap_does_not_contain (f->bwrap,
                                 PV_RUNTIME_PATH_INTERPRETER_ROOT "/usr/baz");

  if (mutable_sysroot != NULL)
    {
      g_autofree gchar *target = NULL;
      struct stat stat_buf;

      /* /usr/foo is only created if the mutable sysroot is the real root */
      target = glnx_readlinkat_malloc (mutable_sysroot->fd,
                                       "usr/foo", NULL, NULL);

      if (config->runtime_flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT)
        g_assert_cmpstr (target, ==, NULL);
      else
        g_assert_cmpstr (target, ==, "/run/host/foo");

      g_clear_pointer (&target, g_free);

      /* /usr/bar is created if the mutable sysroot is the interpreter root,
       * or if we are not using a separate interpreter root */
      target = glnx_readlinkat_malloc (mutable_sysroot->fd,
                                       "usr/bar", NULL, NULL);
      g_assert_cmpstr (target, ==, "/run/x86/bar");
      g_clear_pointer (&target, g_free);

      /* /usr/baz was only created if we are not using a separate
       * interpreter root, because if we were, we would have been unable
       * to create it in both roots */
      target = glnx_readlinkat_malloc (mutable_sysroot->fd,
                                       "usr/baz", NULL, NULL);

      if (config->runtime_flags & PV_RUNTIME_FLAGS_INTERPRETER_ROOT)
        g_assert_cmpstr (target, ==, NULL);
      else
        g_assert_cmpstr (target, ==, "/run/baz");

      g_clear_pointer (&target, g_free);

      /* We never create/edit the interpreter root as a subdir of the
       * mutable sysroot */
      g_assert_cmpint (fstatat (mutable_sysroot->fd,
                                "run/pressure-vessel/interpreter-root",
                                &stat_buf, 0) == 0 ? 0 : errno,
                       ==, ENOENT);
    }
}

static void
test_passwd (Fixture *f,
             gconstpointer context)
{
  /* A realistic passwd(5) entry for root */
#define MOCK_PASSWD_ROOT "root:x:0:0:System administrator:/root:/bin/sh\n"
  /* A realistic passwd(5) entry for our mock user */
#define MOCK_PASSWD_GFREEMAN "gfreeman:!:1998:1119:Dr Gordon Freeman,,,:/home/gfreeman:/bin/csh\n"
  /* This exercises handling of lines without the usual structure */
#define MOCK_PASSWD_COMMENT "#?\n"
  /* A realistic passwd(5) entry for 'nobody', intentionally with no
   * trailing newline */
#define MOCK_PASSWD_NOBODY_NOEOL "nobody:x:65534:65534:&:/nonexistent:/bin/false"
  static const char mock_passwd_text[] =
    MOCK_PASSWD_ROOT
    MOCK_PASSWD_GFREEMAN
    MOCK_PASSWD_COMMENT
    MOCK_PASSWD_NOBODY_NOEOL;
  static const char strange_passwd_text[] =
    MOCK_PASSWD_ROOT
    "\n"
    "\n"
    MOCK_PASSWD_NOBODY_NOEOL "\n";
  /* A realistic group(5) entry for 'nogroup' */
#define MOCK_GROUP_NOGROUP "nogroup:x:65534:\n"
  static const char mock_group_text[] =
    MOCK_GROUP_NOGROUP;
  static const char strange_group_text[] = "\n\n\n";
  /* A realistic mock user, which does not fully match the one we place
   * in /etc/passwd */
  static const struct passwd mock_user =
    {
      .pw_name = (char *) "gfreeman",
      .pw_passwd = (char *) "!",
      .pw_uid = 1998,
      .pw_gid = 1119,
      .pw_gecos = (char *) "Gordon Freeman",
      .pw_dir = (char *) "/blackmesa/gfreeman",
      .pw_shell = (char *) "/bin/zsh",
    };
  /* A realistic mock group (the Anomalous Materials Laboratory) */
  static const char * const members[] = { "evance", "gfreeman", "ikleiner", NULL };
  static const struct group mock_group =
    {
      .gr_name = (char *) "materials",
      .gr_passwd = (char *) "*",
      .gr_gid = 1119,
      .gr_mem = (char **) members,
    };
  /* A user with some non-representable fields */
  static const struct passwd strange_user =
    {
      .pw_name = (char *) "g:man",
      .pw_passwd = (char *) "!",
      .pw_uid = 2004,
      .pw_gid = 1116,
      .pw_gecos = (char *) "\n",
      .pw_dir = (char *) "/xen",
      .pw_shell = (char *) "/bin/zsh",
    };
  /* A group with some non-representable fields */
  static const struct group strange_group =
    {
      .gr_name = (char *) "not\nrepresentable",
      .gr_passwd = (char *) "*",
      .gr_gid = 1116,
      .gr_mem = NULL,
    };
  PvMockPasswdLookup mock_lookup_successfully =
    {
      .uid = getuid (),
      .gid = getgid (),
      .pwd = &mock_user,
      .grp = &mock_group,
      .lookup_errno = 0,
    };
  PvMockPasswdLookup mock_lookup_strange =
    {
      .uid = getuid (),
      .gid = getgid (),
      .pwd = &strange_user,
      .grp = &strange_group,
      .lookup_errno = 0,
    };
  g_auto(GLnxTmpDir) temp = { FALSE };
  g_autoptr(GError) local_error = NULL;
  g_autoptr(SrtSysroot) sysroot = NULL;
  g_autoptr(SrtSysroot) direct = NULL;
  const char *gecos;
  const char *home;
  const char *username;

  glnx_mkdtemp ("pv-test.XXXXXX", 0755, &temp, &local_error);
  g_assert_no_error (local_error);

  sysroot = _srt_sysroot_new (temp.path, &local_error);
  g_assert_no_error (local_error);

  direct = _srt_sysroot_new_direct (&local_error);
  g_assert_no_error (local_error);

  /* First test with an empty sysroot: we will be unable to open /etc/passwd
   * or /etc/group */
    {
      g_autofree gchar *pw = NULL;
      g_autofree gchar *gr = NULL;

      g_test_message ("Sub-test: lookup successful, files inaccessible");

      g_test_message ("/etc/passwd for container:\n%s\n.", pw);
      pw = pv_generate_etc_passwd (sysroot, &mock_lookup_successfully);
      /* Note that this ends with /bin/bash, not /bin/zsh: we override
       * the shell because non-bash shells will generally not exist in
       * the container. */
      g_assert_cmpstr (pw, ==,
                       "gfreeman:x:1998:1119:Gordon Freeman:/blackmesa/gfreeman:/bin/bash\n");
      gr = pv_generate_etc_group (sysroot, &mock_lookup_successfully);
      g_test_message ("/etc/group for container:\n%s\n.", gr);
      g_assert_cmpstr (gr, ==, "materials:x:1119:\n");
    }

  /* Mock up an /etc/passwd and /etc/group in the sysroot */
  glnx_ensure_dir (temp.fd, "etc", 0755, &local_error);
  g_assert_no_error (local_error);
  glnx_file_replace_contents_at (temp.fd, "etc/passwd",
                                 (const guint8 *) mock_passwd_text,
                                 strlen (mock_passwd_text),
                                 GLNX_FILE_REPLACE_NODATASYNC,
                                 NULL, &local_error);
  g_assert_no_error (local_error);
  glnx_file_replace_contents_at (temp.fd, "etc/group",
                                 (const guint8 *) mock_group_text,
                                 strlen (mock_group_text),
                                 GLNX_FILE_REPLACE_NODATASYNC,
                                 NULL, &local_error);
  g_assert_no_error (local_error);

  /* Test again now that we can open /etc/passwd and /etc/group */
    {
      g_autofree gchar *pw = NULL;
      g_autofree gchar *gr = NULL;

      g_test_message ("Sub-test: lookup successful, files merged");

      /* This exercises the case where the first line that we synthesize
       * matches a line taken from the file, which we exclude.
       * For the fields that are different (name, home, shell),
       * we use the ones from the mock getpwuid(), not the ones from the
       * mock /etc/passwd.
       *
       * This emulates a situation where a module like libnss_systemd
       * (or LDAP or something) can provide better information than
       * /etc/passwd.
       *
       * It also exercises the case where /etc/passwd (or /etc/group) does
       * not end with a newline: we normalize by adding one. */
      pw = pv_generate_etc_passwd (sysroot, &mock_lookup_successfully);
      g_test_message ("/etc/passwd for container:\n%s\n.", pw);
      g_assert_cmpstr (pw, ==,
                       "gfreeman:x:1998:1119:Gordon Freeman:/blackmesa/gfreeman:/bin/bash\n"
                       MOCK_PASSWD_ROOT
                       MOCK_PASSWD_COMMENT
                       MOCK_PASSWD_NOBODY_NOEOL "\n");

      /* This exercises the case where the first line that we synthesize
       * does not match any line from the file. */
      gr = pv_generate_etc_group (sysroot, &mock_lookup_successfully);
      g_test_message ("/etc/group for container:\n%s\n.", gr);
      g_assert_cmpstr (gr, ==,
                       "materials:x:1119:\n"
                       MOCK_GROUP_NOGROUP);
    }

  username = g_get_user_name ();

  if (username == NULL)
    username = "user";

  gecos = g_get_real_name ();

  if (gecos == NULL)
    gecos = username;

  home = g_get_home_dir ();

  /* Exercise the fallback that occurs if getpwuid(), getgrgid() fail */
    {
      g_autofree gchar *expected_pw = NULL;
      g_autofree gchar *pw = NULL;
      g_autofree gchar *gr = NULL;
      PvMockPasswdLookup mock_lookup_not_found =
        {
          .uid = getuid (),
          .gid = getgid (),
          .pwd = NULL,
          .grp = NULL,
          .lookup_errno = 0,
        };
      PvMockPasswdLookup mock_lookup_error =
        {
          .uid = getuid (),
          .gid = getgid (),
          .pwd = NULL,
          .grp = NULL,
          .lookup_errno = ENOSYS,
        };
      const char *maybe_root = MOCK_PASSWD_ROOT;
      const char *maybe_gfreeman = MOCK_PASSWD_GFREEMAN;
      const char *maybe_nobody = MOCK_PASSWD_NOBODY_NOEOL "\n";

      g_test_message ("Sub-test: lookup fails, we fall back");

      g_assert_nonnull (username);
      g_assert_nonnull (gecos);
      g_assert_nonnull (home);

      /* If we happen to be running as one of the users mentioned in the
       * mock /etc/passwd, then we'll drop the corresponding line from
       * the output. */
      if (g_str_equal (username, "root"))
        maybe_root = "";
      else if (g_str_equal (username, "gfreeman"))
        maybe_gfreeman = "";
      else if (g_str_equal (username, "nobody"))
        maybe_nobody = "";

      expected_pw = g_strdup_printf ("%s:x:%d:%d:%s:%s:/bin/bash\n%s%s%s%s",
                                     username, getuid (), getgid (), gecos, home,
                                     maybe_root,
                                     maybe_gfreeman,
                                     MOCK_PASSWD_COMMENT,
                                     maybe_nobody);
      pw = pv_generate_etc_passwd (sysroot, &mock_lookup_error);
      g_test_message ("/etc/passwd for container:\n%s\n.", pw);
      g_assert_cmpstr (pw, ==, expected_pw);

      /* If we can't look up our own group, we use /etc/group as-is. */
      gr = pv_generate_etc_group (sysroot, &mock_lookup_error);
      g_test_message ("/etc/group for container:\n%s\n.", gr);
      g_assert_cmpstr (gr, ==, MOCK_GROUP_NOGROUP);

      g_clear_pointer (&pw, g_free);
      g_clear_pointer (&gr, g_free);

      /* getpwuid(), getgrgid() can also return null without setting errno */
      pw = pv_generate_etc_passwd (sysroot, &mock_lookup_not_found);
      g_test_message ("/etc/passwd for container:\n%s\n.", pw);
      g_assert_cmpstr (pw, ==, expected_pw);

      gr = pv_generate_etc_group (sysroot, &mock_lookup_not_found);
      g_test_message ("/etc/group for container:\n%s\n.", gr);
      g_assert_cmpstr (gr, ==, MOCK_GROUP_NOGROUP);
    }

  /* Re-test with fields that cannot be represented losslessly, which
   * could theoretically be produced by nsswitch plugins */

  glnx_file_replace_contents_at (temp.fd, "etc/passwd",
                                 (const guint8 *) strange_passwd_text,
                                 strlen (strange_passwd_text),
                                 GLNX_FILE_REPLACE_NODATASYNC,
                                 NULL, &local_error);
  g_assert_no_error (local_error);
  glnx_file_replace_contents_at (temp.fd, "etc/group",
                                 (const guint8 *) strange_group_text,
                                 strlen (strange_group_text),
                                 GLNX_FILE_REPLACE_NODATASYNC,
                                 NULL, &local_error);
  g_assert_no_error (local_error);

    {
      g_autofree gchar *pw = NULL;
      g_autofree gchar *gr = NULL;

      g_test_message ("Sub-test: files merged, invalid fields exist");

      pw = pv_generate_etc_passwd (sysroot, &mock_lookup_strange);
      g_test_message ("/etc/passwd for container:\n%s\n.", pw);
      g_assert_cmpstr (pw, ==,
                       "g_man:x:2004:1116:_:/xen:/bin/bash\n"
                       MOCK_PASSWD_ROOT
                       /* We skip completely blank lines */
                       MOCK_PASSWD_NOBODY_NOEOL "\n");

      gr = pv_generate_etc_group (sysroot, &mock_lookup_strange);
      g_test_message ("/etc/group for container:\n%s\n.", gr);
      g_assert_cmpstr (gr, ==,
                       "not_representable:x:1116:\n");
    }

  /* A smoke-test of the real situation: we can't usefully make any
   * particular assertions about this, but we can at least confirm it
   * doesn't crash, and output the text of the files for manual checking */
    {
      g_autofree gchar *pw = NULL;
      g_autofree gchar *gr = NULL;

      g_test_message ("Sub-test: real data");

      pw = pv_generate_etc_passwd (direct, NULL);
      g_test_message ("/etc/passwd for container:\n%s\n.", pw);
      gr = pv_generate_etc_group (direct, NULL);
      g_test_message ("/etc/group for container:\n%s\n.", gr);
    }
}

struct PayloadCommandTest
{
  const char *name;
  /* Number of items is arbitrary, expand as required */
  const char * const argv[5];
  /* 0 means argv is NULL-terminated */
  size_t argc;
  PvShell shell;
  PvTerminal terminal;
  PvTerminal expect_terminal;
  enum
    {
      PAYLOAD_COMMAND_TEST_ERROR_NONE,
      PAYLOAD_COMMAND_TEST_ERROR_OPTIONS_AFTER_PARSING,
    } expect_error;
  bool emulated : 1;
  bool expect_exec_helper : 1;
  bool launcher_added : 1;
  bool launcher_instead : 1;
};

const PayloadCommandTest payload_command_tests[] =
{
    {
      .name = "basic",
      .argv = { "bash", "-i", "<don't append this argument>" },
      .argc = 2,
    },
    {
      .name = "emulated/basename",
      .argv = { "bash", "-i", NULL },
      .emulated = true,
      .expect_exec_helper = true,
    },
    {
      .name = "emulated/absolute",
      .argv = { "/bin/bash", NULL },
      .emulated = true,
    },
    {
      .name = "emulated/launcher/basename",
      .argv = { "bash", "-i", NULL },
      .emulated = true,
      /* Unlike emulated/basename, if we are adding s-r-launcher-service
       * to the command-line then there is no need to add the -exec helper
       * as well. */
      .expect_exec_helper = false,
      .launcher_added = true,
    },
    {
      .name = "emulated/launcher/absolute",
      .argv = { "/bin/bash", NULL },
      .emulated = true,
      .launcher_added = true,
    },
    {
      .name = "launcher-added",
      .argv = { "bash", "-i", NULL },
      .launcher_added = true,
    },
    {
      .name = "launcher-instead",
      .argv = { "--exec-fallback", "--inside-app", "--", "mygame",
                "<don't append this argument>" },
      .argc = 4,
      .launcher_instead = true,
    },
    {
      .name = "terminal/invalid-combination",
      .argv = { "/bin/bash", NULL },
      .shell = PV_SHELL_INSTEAD,
      .terminal = PV_TERMINAL_NONE,
      .expect_error = PAYLOAD_COMMAND_TEST_ERROR_OPTIONS_AFTER_PARSING,
    },
    {
      .name = "terminal/auto/no",
      .argv = { "/bin/bash", NULL },
      .shell = PV_SHELL_NONE,
      .terminal = PV_TERMINAL_AUTO,
      .expect_terminal = PV_TERMINAL_NONE,
    },
    {
      .name = "terminal/auto/yes",
      .argv = { "/bin/bash", NULL },
      .shell = PV_SHELL_INSTEAD,
      .terminal = PV_TERMINAL_AUTO,
      .expect_terminal = PV_TERMINAL_XTERM,
    },
    {
      .name = "terminal/no-shell",
      .argv = { "/bin/bash", NULL },
      .shell = PV_SHELL_NONE,
      .terminal = PV_TERMINAL_XTERM,
      .expect_terminal = PV_TERMINAL_XTERM,
    },
    {
      .name = "everything",
      .argv = { "bash", "-i", NULL },
      .emulated = true,
      .expect_exec_helper = false,
      .launcher_added = true,
      .shell = PV_SHELL_INSTEAD,
      .terminal = PV_TERMINAL_AUTO,
      .expect_terminal = PV_TERMINAL_XTERM,
    },
};

static void
test_payload_command (Fixture *f,
                      gconstpointer context)
{
  const Config *config = context;
  const PayloadCommandTest *test = config->payload_command_test;
  g_autoptr(GError) local_error = NULL;
  g_autoptr(FlatpakBwrap) argv_in_container = NULL;
  g_autoptr(SrtEnvOverlay) container_env = _srt_env_overlay_new ();
  g_autofree char *expected_emulator = NULL;
  size_t argc;
  size_t i;
  size_t offset = 0;
  gboolean ok;

  g_test_message ("Payload command test: %s", test->name);

  g_assert_null (f->context->options.emulator);
  g_assert_null (f->context->options.emulator_manifest);
  g_assert_false (f->context->options.launcher);

  f->context->options.shell = test->shell;
  f->context->options.terminal = test->terminal;

  if (test->launcher_instead)
    f->context->options.launcher = TRUE;

  /* If appropriate, pretend the user had set
   * STEAM_COMPAT_LAUNCHER_SERVICE=container-runtime */
  if (test->launcher_added)
    f->context->original_environ = g_environ_setenv (f->context->original_environ,
                                                     STEAM_COMPAT_LAUNCHER_SERVICE_ENVVAR,
                                                     STEAM_COMPAT_LAUNCHER_SERVICE_LAYER_CONTAINER_RUNTIME,
                                                     TRUE);

  if (test->emulated)
    {
      f->context->options.emulator_manifest =
        g_test_build_filename (G_TEST_DIST, "mock-emulators", "sh.json", NULL);
      expected_emulator =
        g_test_build_filename (G_TEST_DIST, "mock-emulators", "wrapper.sh", NULL);

      /* TODO: Ideally we'd call
       * pv_wrap_options_parse_environment_after_argv() instead of hard-coding
       * this here */
      f->context->options.emulator =
        _srt_emulator_new_from_manifest (f->context->options.emulator_manifest,
                                         &local_error);
      g_assert_no_error (local_error);
      g_assert_nonnull (f->context->options.emulator);
    }

  /* Pretend we had finished parsing arguments, because we need this
   * in order to have f->context->run_in_current_context */
  ok = pv_wrap_context_after_parsing_arguments (f->context,
                                                PV_WRAP_TEST_FLAGS_MOCK_BWRAP,
                                                &local_error);

  if (test->expect_error == PAYLOAD_COMMAND_TEST_ERROR_OPTIONS_AFTER_PARSING)
    {
      g_assert_nonnull (local_error);
      g_test_message ("Expected GOptionError after parsing, got: %s %d: %s",
                      g_quark_to_string (local_error->domain),
                      local_error->code,
                      local_error->message);
      g_assert_cmpstr (g_quark_to_string (local_error->domain),
                       ==, g_quark_to_string (G_OPTION_ERROR));
      g_assert_false (ok);
      return;
    }

  g_assert_no_error (local_error);
  g_assert_true (ok);

  g_assert_cmpint (f->context->options.shell, ==, test->shell);
  g_assert_cmpint (f->context->options.terminal, ==, test->expect_terminal);

  argv_in_container = flatpak_bwrap_new (flatpak_bwrap_empty_env);

  if (test->argc == 0)
    argc = _srt_strv_length (test->argv);
  else
    argc = test->argc;

  ok = pv_wrap_context_append_payload_command (f->context,
                                               test->argv,
                                               (int) argc,
                                               argv_in_container,
                                               container_env,
                                               &local_error);
  dump_bwrap (argv_in_container);
  g_assert_no_error (local_error);
  g_assert_true (ok);
  g_assert_false (pv_bwrap_was_finished (argv_in_container));

  if (test->launcher_added)
    {
      const char *var = STEAM_COMPAT_LAUNCHER_SERVICE_ENVVAR;
      const char *override = _srt_env_overlay_get (container_env, var);

      g_assert_true (_srt_env_overlay_contains (container_env, var));
      g_assert_null (override);
      /* Forget about it now that it's been accounted for */
      _srt_env_overlay_inherit (container_env, var);
    }

  /* Nothing is set or unset, except for what we already removed */
  g_assert_true (_srt_env_overlay_is_empty (container_env));

  if (test->launcher_instead)
    {
      const char *arg;

      /* Emulation and using s-r-launcher-service as the (only) payload command
       * are currently mutually exclusive */
      g_assert_false (test->emulated);

      g_assert_cmpuint (argv_in_container->argv->len, >=, 2);
      arg = g_ptr_array_index (argv_in_container->argv, 0);
#ifdef _SRT_MULTIARCH
      g_assert_true (g_str_has_suffix (arg, "/" _SRT_MULTIARCH "-srt-launcher-service"));
#else
      g_assert_true (g_str_has_suffix (arg, "/steam-runtime-launcher-service"));
#endif
      offset++;

      arg = g_ptr_array_index (argv_in_container->argv, 1);

      if (g_str_equal (arg, "--verbose"))
        offset++;
    }

  if (test->emulated)
    {
      const char *arg;

      g_assert_false (test->launcher_instead);

      g_assert_cmpuint (argv_in_container->argv->len, >=, 3);
      arg = g_ptr_array_index (argv_in_container->argv, 0);
      g_assert_cmpstr (arg, ==, expected_emulator);
      offset++;

      arg = g_ptr_array_index (argv_in_container->argv, offset);
      g_assert_cmpstr (arg, ==, "--main");
      offset++;

      arg = g_ptr_array_index (argv_in_container->argv, offset);
      g_assert_cmpstr (arg, ==, "--");
      offset++;
    }

  if (test->launcher_added)
    {
      static const char * const expected_options[] =
        {
          "--exec-fallback",
          "--hint",
          "--inside-app",
          "--no-stop-on-name-loss",
          "--replace",
          "--session",
          "--",
        };
      g_autofree char *expected_helper = NULL;
      const char *expected_launcher_tuple;
      const char *helpers_dir;
      const char *arg;

      g_assert_false (test->launcher_instead);
      g_assert_cmpuint (argv_in_container->argv->len,
                        >=,
                        offset + G_N_ELEMENTS (expected_options) + 1);

      if (test->emulated)
        /* The mock emulator in sh.json is hard-coded to pretend to be an
         * emulator for the x86_64 architecture (only) */
        expected_launcher_tuple = SRT_ABI_X86_64;
      else
        /* We use aarch64_config and therefore aarch64_archs for all of these tests,
         * so the runtime's primary architecture is assumed to be aarch64 */
        expected_launcher_tuple = SRT_ABI_AARCH64;

      helpers_dir =
        _srt_subprocess_runner_get_helpers_path (f->context->run_in_current_context);
      expected_helper = g_strdup_printf ("%s/%s-srt-launcher-service",
                                         helpers_dir, expected_launcher_tuple);
      arg = g_ptr_array_index (argv_in_container->argv, offset);
      g_assert_cmpstr (arg, ==, expected_helper);
      offset++;

      arg = g_ptr_array_index (argv_in_container->argv, offset);

      if (g_str_equal (arg, "--verbose"))
        offset++;

      for (size_t j = 0; j < G_N_ELEMENTS (expected_options); j++)
        {
          arg = g_ptr_array_index (argv_in_container->argv, offset);
          g_assert_cmpstr (arg, ==, expected_options[j]);
          offset++;
        }
    }

  switch (test->expect_terminal)
    {
      case PV_TERMINAL_NONE:
      case PV_TERMINAL_TTY:
        break;

      case PV_TERMINAL_XTERM:
        /* We implement --terminal=xterm as: /usr/bin/env xterm -e COMMAND */
          {
            const char *arg;

            arg = g_ptr_array_index (argv_in_container->argv, offset);
            g_assert_cmpstr (arg, ==, "/usr/bin/env");
            offset++;

            arg = g_ptr_array_index (argv_in_container->argv, offset);
            g_assert_cmpstr (arg, ==, "xterm");
            offset++;

            arg = g_ptr_array_index (argv_in_container->argv, offset);
            g_assert_cmpstr (arg, ==, "-e");
            offset++;
          }
        break;

      case PV_TERMINAL_AUTO:
      default:
        g_assert_not_reached ();
    }

  switch (test->shell)
    {
      case PV_SHELL_NONE:
        if (test->expect_terminal == PV_TERMINAL_NONE)
          break;
        /* else fall through */

      case PV_SHELL_AFTER:
      case PV_SHELL_FAIL:
      case PV_SHELL_INSTEAD:
        /* We implement all --shell as:
         * /bin/sh -euc [something] sh test-wrap-setup COMMAND
         * We don't make a particularly specific assertion about what the shell
         * one-liner is, because if we did, we'd just be reimplementing
         * wrap-interactive.c here. */
          {
            const char *arg;

            arg = g_ptr_array_index (argv_in_container->argv, offset);
            g_assert_cmpstr (arg, ==, "/bin/sh");
            offset++;

            arg = g_ptr_array_index (argv_in_container->argv, offset);
            g_assert_cmpstr (arg, ==, "-euc");
            offset++;

            arg = g_ptr_array_index (argv_in_container->argv, offset);
            g_assert_true (g_str_has_prefix (arg, "prgname=\"$1\"\nshift\n"));
            offset++;

            arg = g_ptr_array_index (argv_in_container->argv, offset);
            g_assert_cmpstr (arg, ==, "sh");
            offset++;

            arg = g_ptr_array_index (argv_in_container->argv, offset);
            g_assert_cmpstr (arg, !=, "");    /* it's the path to this test */
            offset++;
          }
        break;

      default:
        g_assert_not_reached ();
    }

  if (test->expect_exec_helper)
    {
      g_autofree char *expected_helper = NULL;
      const char *helpers_dir;
      const char *arg;

      /* The exec helper is never expected to be used with --launcher */
      g_assert_false (test->launcher_instead);

      g_assert_cmpuint (argv_in_container->argv->len, >=, offset + 2);

      helpers_dir =
        _srt_subprocess_runner_get_helpers_path (f->context->run_in_current_context);
      /* The mock emulator in sh.json is hard-coded to pretend to be an
       * emulator for the x86_64 architecture (only) */
      expected_helper = g_strdup_printf ("%s/%s-exec", helpers_dir, SRT_ABI_X86_64);
      arg = g_ptr_array_index (argv_in_container->argv, offset);
      g_assert_cmpstr (arg, ==, expected_helper);
      offset++;

      arg = g_ptr_array_index (argv_in_container->argv, offset);
      g_assert_cmpstr (arg, ==, "--");
      offset++;
    }

  for (i = 0; i < argc; i++)
    {
      const char *arg;

      g_assert_cmpuint (offset + i, <, argv_in_container->argv->len);
      arg = g_ptr_array_index (argv_in_container->argv, offset + i);
      g_assert_cmpstr (arg, ==, test->argv[i]);
    }

  g_assert_cmpuint (argv_in_container->argv->len, ==, offset + i);

  /* pv_wrap_context_append_payload_command() only appends arguments,
   * not environment variables or fds */
  g_assert_cmpstrv (argv_in_container->envp, (const char * const[]) { NULL });
  g_assert_cmpuint (argv_in_container->fds->len, ==, 0);
  g_assert_cmpuint (argv_in_container->noinherit_fds->len, ==, 0);
}

static void
populate_ld_preload (Fixture *f,
                     GPtrArray *argv,
                     PvAppendPreloadFlags flags)
{
  gsize i;

  if (flags & PV_APPEND_PRELOAD_FLAGS_FLATPAK_SUBSANDBOX)
    g_assert_null (f->context->exports);
  else
    g_assert_nonnull (f->context->exports);

  for (i = 0; i < G_N_ELEMENTS (ld_preload_tests); i++)
    {
      const PreloadTest *test = &ld_preload_tests[i];
      GLogLevelFlags old_fatal_mask = G_LOG_FATAL_MASK;
      gsize j;
      gsize n_modules = 0;
      WrapPreloadModule modules[G_N_ELEMENTS (test->input)] = {};

      for (j = 0; j < G_N_ELEMENTS (test->input); j++)
        {
          const char *input = test->input[j];
          g_autoptr(GString) final_path = NULL;

          if (input == NULL)
            break;

          modules[j].which = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD;

          if (g_str_has_prefix (input, "a:"))
            {
              modules[j].which = PV_PRELOAD_VARIABLE_INDEX_LD_AUDIT;
              input += 2;
            }
          else if (g_str_has_prefix (input, "p:"))
            {
              input += 2;
            }

          final_path = fixture_substitute (f, input, test, j);
          modules[j].preload = g_string_free_and_steal (g_steal_pointer (&final_path));
          n_modules++;
        }

      /* We expect a warning for libgtk3-nocsd.so.0, but the test framework
       * makes warnings and critical warnings fatal, in addition to the
       * usual fatal errors. Temporarily relax that to just critical
       * warnings and fatal errors. */
      if (test->warning != NULL)
        {
          old_fatal_mask = g_log_set_always_fatal (G_LOG_FATAL_MASK | G_LOG_LEVEL_CRITICAL);
          /* Note that this assumes pressure-vessel doesn't define
           * G_LOG_USE_STRUCTURED, because g_test_expect_message() only
           * works for the old unstructured logging API.
           * If we want to start using G_LOG_USE_STRUCTURED, then we'll
           * have to introduce some design-for-test to allow this warning
           * to be trapped. */
          g_test_expect_message ("pressure-vessel",
                                 G_LOG_LEVEL_WARNING,
                                 test->warning);
        }

      pv_wrap_append_preloads (f->context,
                               argv,
                               modules,
                               n_modules,
                               flags | PV_APPEND_PRELOAD_FLAGS_IN_UNIT_TESTS);

      /* If we modified the fatal mask, put back the old value. */
      if (test->warning != NULL)
        {
          g_test_assert_expected_messages ();
          g_log_set_always_fatal (old_fatal_mask);
        }

      for (j = 0; j < G_N_ELEMENTS (modules); j++)
        wrap_preload_module_clear (&modules[j]);
    }

  for (i = 0; i < argv->len; i++)
    g_test_message ("argv[%" G_GSIZE_FORMAT "]: %s",
                    i, (const char *) g_ptr_array_index (argv, i));

  g_test_message ("argv->len: %" G_GSIZE_FORMAT, i);
}

static GPtrArray *
filter_expected_paths (Fixture *f)
{
  g_autoptr(GPtrArray) filtered = g_ptr_array_new_with_free_func (NULL);
  gsize i, j;

  /* Some of the expected paths are only expected to appear on i386.
   * Filter the list accordingly. */
  for (i = 0; i < G_N_ELEMENTS (ld_preload_tests); i++)
    {
      const PreloadTest *test = &ld_preload_tests[i];

      for (j = 0; j < G_N_ELEMENTS (test->expected); j++)
        {
          const char *path = test->expected[j];

          if (path == NULL)
            continue;

          if (g_str_equal (path, "="))
            {
              g_assert (j < G_N_ELEMENTS (test->input));
              path = test->input[j];
              /* keep the a: or p: prefix if any */
            }

          if (g_str_has_prefix (path, "i386:"))
            {
              if (fixture_has_arch (f, SRT_ABI_I386))
                g_ptr_array_add (filtered, (char *) (path + strlen ("i386:")));
            }
          else
            {
              g_ptr_array_add (filtered, (char *) path);
            }
        }
    }

  for (i = 0; i < filtered->len; i++)
    g_test_message ("expected[%zu]: %s", i,
                    (const char *) g_ptr_array_index (filtered, i));

  return g_steal_pointer (&filtered);
}

static void
assert_and_skip_ld_preload_option (const char **expected,
                                   const char **argument)
{
  const char *expect_prefix = "--ld-preload=";

  if (g_str_has_prefix (*expected, "a:"))
    {
      expect_prefix = "--ld-audit=";
      *expected += 2;
    }
  else if (g_str_has_prefix (*expected, "p:"))
    {
      *expected += 2;
    }

  g_assert_true (g_str_has_prefix (*argument, expect_prefix));
  *argument += strlen (expect_prefix);
}

static void
test_remap_ld_preload (Fixture *f,
                       gconstpointer context)
{
  const Config *config = context;
  FlatpakExports *exports;
  g_autoptr(GPtrArray) argv = g_ptr_array_new_with_free_func (g_free);
  g_autoptr(GPtrArray) filtered = filter_expected_paths (f);
  gsize i;

  fixture_create_exports (f);
  exports = f->context->exports;
  g_assert_nonnull (exports);

  fixture_create_runtime (f, PV_RUNTIME_FLAGS_NONE);
  g_assert_nonnull (f->context->runtime);
  populate_ld_preload (f, argv, config->preload_flags);

  g_assert_cmpuint (argv->len, ==, filtered->len);

  for (i = 0; i < argv->len; i++)
    {
      const char *expected = g_ptr_array_index (filtered, i);
      const char *argument = g_ptr_array_index (argv, i);
      g_autoptr(GString) with_substs = NULL;

      assert_and_skip_ld_preload_option (&expected, &argument);
      with_substs = fixture_substitute (f, expected, NULL, 0);

      if (g_str_has_prefix (with_substs->str, "/lib/")
          || g_str_has_prefix (with_substs->str, "/usr/lib/"))
        {
          g_assert_true (g_str_has_prefix (argument, "/run/host/"));
          argument += strlen("/run/host");
        }

      g_assert_cmpstr (argument, ==, with_substs->str);
    }

  assert_exports_match_expectations (f, ld_preload_tests,
                                     G_N_ELEMENTS (ld_preload_tests));
}

static void
test_remap_ld_preload_flatpak (Fixture *f,
                               gconstpointer context)
{
  const Config *config = context;
  g_autoptr(GPtrArray) argv = g_ptr_array_new_with_free_func (g_free);
  g_autoptr(GPtrArray) filtered = filter_expected_paths (f);
  gsize i;

  fixture_create_runtime (f, PV_RUNTIME_FLAGS_FLATPAK_SUBSANDBOX);
  g_assert_nonnull (f->context->runtime);
  populate_ld_preload (f, argv,
                       (config->preload_flags
                        | PV_APPEND_PRELOAD_FLAGS_FLATPAK_SUBSANDBOX));

  g_assert_cmpuint (argv->len, ==, filtered->len);

  for (i = 0; i < argv->len; i++)
    {
      const char *expected = g_ptr_array_index (filtered, i);
      const char *argument = g_ptr_array_index (argv, i);
      g_autoptr(GString) with_substs = NULL;

      assert_and_skip_ld_preload_option (&expected, &argument);

      with_substs = fixture_substitute (f, expected, NULL, 0);

      if (g_str_has_prefix (with_substs->str, "/app/")
          || g_str_has_prefix (with_substs->str, "/lib/")
          || g_str_has_prefix (with_substs->str, "/usr/lib/"))
        {
          g_assert_true (g_str_has_prefix (argument, "/run/parent/"));
          argument += strlen("/run/parent");
        }

      g_assert_cmpstr (argument, ==, with_substs->str);
    }
}

/*
 * In addition to testing the rare case where there's no runtime,
 * this one also exercises --remove-game-overlay.
 */
static void
test_remap_ld_preload_no_runtime (Fixture *f,
                                  gconstpointer context)
{
  const Config *config = context;
  g_autoptr(GPtrArray) argv = g_ptr_array_new_with_free_func (g_free);
  g_autoptr(GPtrArray) filtered = filter_expected_paths (f);
  FlatpakExports *exports;
  gsize i, j;
  gsize n_gameoverlays = 0;

  f->context->options.remove_game_overlay = TRUE;

  fixture_create_exports (f);
  exports = f->context->exports;
  g_assert_nonnull (exports);

  g_assert_null (f->context->runtime);
  populate_ld_preload (f, argv, config->preload_flags);

  for (i = 0; i < filtered->len; i++)
    {
      const char *expected = g_ptr_array_index (filtered, i);

      /* /steam/lib/gameoverlayrenderer.so is missing because we used the
       * equivalent of --remove-game-overlay */
      if (g_str_has_suffix (expected, "/gameoverlayrenderer.so"))
        n_gameoverlays++;
    }

  g_assert_cmpuint (argv->len, ==, filtered->len - n_gameoverlays);

  for (i = 0, j = 0; i < argv->len; i++, j++)
    {
      const char *expected = g_ptr_array_index (filtered, j);
      const char *argument = g_ptr_array_index (argv, i);
      g_autoptr(GString) with_substs = NULL;

      while (g_str_has_suffix (expected, "/gameoverlayrenderer.so"))
        {
          j++;
          expected = g_ptr_array_index (filtered, j);
        }

      assert_and_skip_ld_preload_option (&expected, &argument);
      with_substs = fixture_substitute (f, expected, NULL, 0);
      g_assert_cmpstr (argument, ==, with_substs->str);
    }

  assert_exports_match_expectations (f, ld_preload_tests,
                                     G_N_ELEMENTS (ld_preload_tests));
}

static void
test_remap_ld_preload_flatpak_no_runtime (Fixture *f,
                                          gconstpointer context)
{
  const Config *config = context;
  g_autoptr(GPtrArray) argv = g_ptr_array_new_with_free_func (g_free);
  g_autoptr(GPtrArray) filtered = filter_expected_paths (f);
  gsize i;

  g_assert_null (f->context->runtime);
  populate_ld_preload (f, argv,
                       (config->preload_flags
                        | PV_APPEND_PRELOAD_FLAGS_FLATPAK_SUBSANDBOX));

  g_assert_cmpuint (argv->len, ==, filtered->len);

  for (i = 0; i < argv->len; i++)
    {
      const char *expected = g_ptr_array_index (filtered, i);
      const char *argument = g_ptr_array_index (argv, i);
      g_autoptr(GString) with_substs = NULL;

      assert_and_skip_ld_preload_option (&expected, &argument);
      with_substs = fixture_substitute (f, expected, NULL, 0);
      g_assert_cmpstr (argument, ==, with_substs->str);
    }
}

/*
 * Test that the default architectures are what we expect
 */
static void
test_supported_archs (Fixture *f,
                      gconstpointer context)
{
  g_autoptr(GArray) arr = _srt_architecture_array_new ();

  _srt_architecture_array_populate_with_defaults (arr);

#if defined(__i386__) || defined(__x86_64__)
  /* The primary architecture is x86_64, followed by i386
   * (implicitly secondary) */
  g_assert_cmpuint (arr->len, ==, 2);
  g_assert_cmpstr (g_quark_to_string (g_array_index (arr, GQuark, 0)), ==,
                   SRT_ABI_X86_64);
  g_assert_cmpstr (g_quark_to_string (g_array_index (arr, GQuark, 1)), ==,
                   SRT_ABI_I386);

#elif defined(_SRT_MULTIARCH) || defined(__aarch64__)

  /* The only supported architecture is the one we were compiled for */
  g_assert_cmpuint (arr->len, ==, 1);
#if defined(__aarch64__)
  g_assert_cmpstr (g_quark_to_string (g_array_index (arr, GQuark, 0)), ==,
                   SRT_ABI_AARCH64);
#else /* !aarch64 */
  g_assert_cmpstr (g_quark_to_string (g_array_index (arr, GQuark, 0)), ==,
                   _SRT_MULTIARCH);
#endif /* !aarch64 */

#endif /* defined(_SRT_MULTIARCH) || defined(__aarch64__) */
}

/*
 * Test that pv_wrap_use_home(PV_HOME_MODE_SHARED) makes nearly everything
 * available.
 */
static void
test_use_home_shared (Fixture *f,
                      gconstpointer context)
{
  static const char * const paths[] =
  {
    "app/",
    "bin>usr/bin",
    "config/",
    "dangling>nonexistent",
    "data/",
    "dev/pts/",
    "etc/hosts",
    "games/SteamLibrary/",
    "home/user/.config/",
    "home/user/.config/cef_user_data>../../config/cef_user_data",
    "home/user/.local/",
    "home/user/.local/share>../../../data",
    "home/user/.steam",
    "lib>usr/lib",
    "lib32>usr/lib32",
    "lib64>usr/lib",
    "libexec>usr/libexec",
    "media/",
    "mnt/",
    "offload/user/data/",
    "offload/user/state/",
    "offload/rw2/",
    "overrides/forbidden/",
    "proc/1/fd/",
    "ro/",
    "root/",
    "run/dbus/",
    "run/gfx/",
    "run/host/",
    "run/media/",
    "run/pressure-vessel/",
    "run/systemd/",
    "rw/",
    "rw2>offload/rw2",
    "sbin>usr/bin",
    "single:/dir:/and:/deprecated/",
    "srv/data/",
    "sys/",
    "tmp/",
    "usr/local/share/",
    "usr/share/",
    "var/tmp/",
  };
  static const char * const mock_environ[] =
  {
    "STEAM_COMPAT_TOOL_PATH=/single:/dir:/and:/deprecated",
    "STEAM_COMPAT_MOUNTS=/overrides/forbidden",
    "PRESSURE_VESSEL_FILESYSTEMS_RO=/ro",
    "PRESSURE_VESSEL_FILESYSTEMS_RW=:/rw:/rw2:/nonexistent:::::",
    "XDG_DATA_HOME=/offload/user/data",
    "XDG_STATE_HOME=/offload/user/state",
    NULL
  };
  g_autoptr(FlatpakBwrap) env_bwrap = NULL;
  FlatpakExports *exports;
  FlatpakExports *env_exports;
  g_autoptr(GError) local_error = NULL;
  g_autoptr(SrtEnvOverlay) container_env = _srt_env_overlay_new ();
  GLogLevelFlags was_fatal;
  gboolean ret;

  fixture_create_exports (f);
  exports = f->context->exports;
  g_assert_nonnull (exports);

  fixture_populate_dir (f, f->mock_host->fd, paths, G_N_ELEMENTS (paths));
  ret = pv_wrap_use_home (PV_HOME_MODE_SHARED, "/home/user", NULL, exports,
                          f->bwrap,
                          container_env,
                          f->config->workarounds,
                          &local_error);
  g_assert_no_error (local_error);
  g_assert_true (ret);
  flatpak_exports_append_bwrap_args (exports, f->bwrap);

  dump_bwrap (f->bwrap);
  dump_env_overlay (container_env);

  /* /usr and friends are out of scope here */
  assert_bwrap_does_not_contain (f->bwrap, "/bin");
  assert_bwrap_does_not_contain (f->bwrap, "/lib");
  assert_bwrap_does_not_contain (f->bwrap, "/lib32");
  assert_bwrap_does_not_contain (f->bwrap, "/lib64");
  assert_bwrap_does_not_contain (f->bwrap, "/usr");
  assert_bwrap_does_not_contain (f->bwrap, "/sbin");

  /* Various FHS and FHS-adjacent directories go along with the home
   * directory */
  if (f->config->workarounds & PV_WORKAROUND_FLAGS_LIMIT_SHARED_DIRS)
    {
      assert_bwrap_does_not_contain (f->bwrap, "/home");
      assert_bwrap_does_not_contain (f->bwrap, "/media");
      assert_bwrap_does_not_contain (f->bwrap, "/mnt");
      assert_bwrap_does_not_contain (f->bwrap, "/run/media");
      assert_bwrap_does_not_contain (f->bwrap, "/srv");
    }
  else
    {
      assert_bwrap_contains (f->bwrap, "--bind", "/home", "/home");
      assert_bwrap_contains (f->bwrap, "--bind", "/media", "/media");
      assert_bwrap_contains (f->bwrap, "--bind", "/mnt", "/mnt");
      assert_bwrap_contains (f->bwrap, "--bind", "/run/media", "/run/media");
      assert_bwrap_contains (f->bwrap, "--bind", "/srv", "/srv");
    }

  assert_bwrap_contains (f->bwrap, "--bind", "/var/tmp", "/var/tmp");

  /* Some directories that are commonly symlinks get handled, by
   * mounting the target of a symlink if any */
  assert_bwrap_contains (f->bwrap, "--bind", "/data", "/data");

  /* Mutable OS state is not tied to the home directory */
  assert_bwrap_does_not_contain (f->bwrap, "/etc");
  assert_bwrap_does_not_contain (f->bwrap, "/var");

  /* We do share /tmp, but this particular function is not responsible
   * for it */
  assert_bwrap_does_not_contain (f->bwrap, "/tmp");

  /* We don't currently export miscellaneous top-level directories */
  assert_bwrap_does_not_contain (f->bwrap, "/games");

  /* /run is out of scope */
  assert_bwrap_does_not_contain (f->bwrap, "/run/dbus");

  /* We don't export these here for various reasons */
  assert_bwrap_does_not_contain (f->bwrap, "/app");
  assert_bwrap_does_not_contain (f->bwrap, "/boot");
  assert_bwrap_does_not_contain (f->bwrap, "/dev");
  assert_bwrap_does_not_contain (f->bwrap, "/dev/pts");
  assert_bwrap_does_not_contain (f->bwrap, "/libexec");
  assert_bwrap_does_not_contain (f->bwrap, "/proc");
  assert_bwrap_does_not_contain (f->bwrap, "/root");
  assert_bwrap_does_not_contain (f->bwrap, "/run");
  assert_bwrap_does_not_contain (f->bwrap, "/run/gfx");
  assert_bwrap_does_not_contain (f->bwrap, "/run/host");
  assert_bwrap_does_not_contain (f->bwrap, "/run/pressure-vessel");
  assert_bwrap_does_not_contain (f->bwrap, "/sys");

  /* We would export this if it existed, but it doesn't */
  assert_bwrap_does_not_contain (f->bwrap, "/opt");

  env_bwrap = flatpak_bwrap_new (flatpak_bwrap_empty_env);

  g_clear_pointer (&f->context->original_environ, g_strfreev);
  f->context->original_environ = _srt_strdupv (mock_environ);

  g_clear_pointer (&f->context->exports, flatpak_exports_free);
  exports = NULL;

  fixture_create_exports (f);
  env_exports = f->context->exports;
  g_assert_nonnull (env_exports);

  /* Don't crash on warnings here */
  was_fatal = g_log_set_always_fatal (G_LOG_LEVEL_ERROR | G_LOG_LEVEL_CRITICAL);
  pv_bind_and_propagate_from_environ (f->context,
                                      PV_HOME_MODE_SHARED,
                                      container_env);
  g_log_set_always_fatal (was_fatal);

  flatpak_exports_append_bwrap_args (env_exports, env_bwrap);
  dump_bwrap (env_bwrap);
  dump_env_overlay (container_env);
  assert_bwrap_contains (env_bwrap, "--ro-bind", "/ro", "/ro");
  assert_bwrap_contains (env_bwrap, "--bind", "/rw", "/rw");
  assert_bwrap_contains (env_bwrap, "--symlink", "offload/rw2", "/rw2");
  assert_bwrap_contains (env_bwrap, "--bind", "/offload/rw2", "/offload/rw2");
  assert_bwrap_contains (env_bwrap, "--bind", "/offload/user/data",
                         "/offload/user/data");
  assert_bwrap_contains (env_bwrap, "--bind", "/offload/user/state",
                         "/offload/user/state");
  assert_bwrap_does_not_contain (env_bwrap, "/usr/local/share");
  assert_bwrap_does_not_contain (env_bwrap, "/usr/share");
  /* These are in PRESSURE_VESSEL_FILESYSTEMS_RW but don't actually exist. */
  assert_bwrap_does_not_contain (env_bwrap, "/nonexistent");
  assert_bwrap_does_not_contain (env_bwrap, "/dangling");
  /* STEAM_COMPAT_TOOL_PATH is deprecated (not explicitly tested, but
   * you'll see a warning in the test log), and because it doesn't have
   * the COLON_DELIMITED flag, it's parsed as a single oddly-named
   * directory. */
  assert_bwrap_contains (env_bwrap, "--bind",
                         "/single:/dir:/and:/deprecated",
                         "/single:/dir:/and:/deprecated");
  /* Paths below /overrides are not used, with a warning. */
  assert_bwrap_does_not_contain (env_bwrap, "/overrides/forbidden");
}

/*
 * Test that pv_wrap_use_host_os() makes nearly everything from the host OS
 * available. (This is what we do if run with no runtime, although
 * SteamLinuxRuntime_* never actually does this.)
 */
static void
test_use_host_os (Fixture *f,
                  gconstpointer context)
{
  static const char * const paths[] =
  {
    "boot/",
    "bin>usr/bin",
    "dev/pts/",
    "etc/hosts",
    "games/SteamLibrary/",
    "home/user/.steam",
    "lib>usr/lib",
    "lib32>usr/lib32",
    "lib64>usr/lib",
    "libexec>usr/libexec",
    "opt/extras/kde/",
    "overrides/",
    "proc/1/fd/",
    "root/",
    "run/dbus/",
    "run/gfx/",
    "run/host/",
    "run/media/",
    "run/pressure-vessel/",
    "run/systemd/",
    "tmp/",
    "sbin>usr/bin",
    "sys/",
    "usr/local/",
    "var/tmp/",
  };
  g_autoptr(GError) local_error = NULL;
  gboolean ret;

  fixture_create_exports (f);
  g_assert_nonnull (f->context->exports);
  fixture_populate_dir (f, f->mock_host->fd, paths, G_N_ELEMENTS (paths));
  ret = pv_wrap_use_host_os (f->mock_host->fd, f->context->exports, f->bwrap,
                             _srt_dirent_strcmp,
                             f->config->workarounds,
                             &local_error);
  g_assert_no_error (local_error);
  g_assert_true (ret);
  flatpak_exports_append_bwrap_args (f->context->exports, f->bwrap);

  dump_bwrap (f->bwrap);

  /* We do export /usr and friends */
  assert_bwrap_contains (f->bwrap, "--symlink", "usr/bin", "/bin");
  assert_bwrap_contains (f->bwrap, "--symlink", "usr/lib", "/lib");
  assert_bwrap_contains (f->bwrap, "--symlink", "usr/lib", "/lib64");
  assert_bwrap_contains (f->bwrap, "--symlink", "usr/lib32", "/lib32");
  assert_bwrap_contains (f->bwrap, "--ro-bind", "/usr", "/usr");
  assert_bwrap_contains (f->bwrap, "--symlink", "usr/bin", "/sbin");

  /* We do export mutable OS state */
  assert_bwrap_contains (f->bwrap, "--bind", "/etc", "/etc");
  assert_bwrap_contains (f->bwrap, "--bind", "/tmp", "/tmp");
  assert_bwrap_contains (f->bwrap, "--bind", "/var", "/var");

  /* We usually do export miscellaneous top-level directories */
  if (f->config->workarounds & PV_WORKAROUND_FLAGS_LIMIT_SHARED_DIRS)
    {
      assert_bwrap_does_not_contain (f->bwrap, "/games");
      assert_bwrap_does_not_contain (f->bwrap, "/home");
      assert_bwrap_does_not_contain (f->bwrap, "/opt");
    }
  else
    {
      assert_bwrap_contains (f->bwrap, "--bind", "/games", "/games");
      assert_bwrap_contains (f->bwrap, "--bind", "/home", "/home");
      assert_bwrap_contains (f->bwrap, "--bind", "/opt", "/opt");
    }

  /* We do export most of the contents of /run, but not /run itself */
  assert_bwrap_contains (f->bwrap, "--bind", "/run/dbus", "/run/dbus");
  assert_bwrap_contains (f->bwrap, "--bind", "/run/systemd", "/run/systemd");

  /* /run/media is special-cased as more like /media */
  if (f->config->workarounds & PV_WORKAROUND_FLAGS_LIMIT_SHARED_DIRS)
    assert_bwrap_does_not_contain (f->bwrap, "/run/media");
  else
    assert_bwrap_contains (f->bwrap, "--bind", "/run/media", "/run/media");

  /* We don't export these in pv_wrap_use_host_os() for various reasons */
  assert_bwrap_does_not_contain (f->bwrap, "/app");
  assert_bwrap_does_not_contain (f->bwrap, "/boot");
  assert_bwrap_does_not_contain (f->bwrap, "/dev");
  assert_bwrap_does_not_contain (f->bwrap, "/dev/pts");
  assert_bwrap_does_not_contain (f->bwrap, "/libexec");
  assert_bwrap_does_not_contain (f->bwrap, "/overrides");
  assert_bwrap_does_not_contain (f->bwrap, "/proc");
  assert_bwrap_does_not_contain (f->bwrap, "/root");
  assert_bwrap_does_not_contain (f->bwrap, "/run");
  assert_bwrap_does_not_contain (f->bwrap, "/run/gfx");
  assert_bwrap_does_not_contain (f->bwrap, "/run/host");
  assert_bwrap_does_not_contain (f->bwrap, "/run/pressure-vessel");
  assert_bwrap_does_not_contain (f->bwrap, "/sys");

  /* We would export these if they existed, but they don't */
  assert_bwrap_does_not_contain (f->bwrap, "/mnt");
  assert_bwrap_does_not_contain (f->bwrap, "/srv");
}

int
main (int argc,
      char **argv)
{
  Config payload_command_configs[G_N_ELEMENTS (payload_command_tests)];

  _srt_setenv_disable_gio_modules ();

  _srt_tests_init (&argc, &argv, NULL);

  g_test_add ("/bind-into-container/normal", Fixture,
              &default_config,
              setup, test_bind_into_container, teardown);
  g_test_add ("/bind-into-container/copy", Fixture,
              &copy_config,
              setup, test_bind_into_container, teardown);
  g_test_add ("/bind-into-container/interpreter-root", Fixture,
              &interpreter_root_config,
              setup, test_bind_into_container, teardown);
  g_test_add ("/bind-merged-usr", Fixture, NULL,
              setup, test_bind_merged_usr, teardown);
  g_test_add ("/bind-unmerged-usr", Fixture, NULL,
              setup, test_bind_unmerged_usr, teardown);
  g_test_add ("/bind-usr", Fixture, NULL,
              setup, test_bind_usr, teardown);
  g_test_add ("/export-root-dirs", Fixture, NULL,
              setup, test_export_root_dirs, teardown);
  g_test_add ("/make-symlink-in-container/normal", Fixture,
              &default_config,
              setup, test_make_symlink_in_container, teardown);
  g_test_add ("/make-symlink-in-container/copy", Fixture,
              &copy_config,
              setup, test_make_symlink_in_container, teardown);
  g_test_add ("/make-symlink-in-container/interpreter-root", Fixture,
              &interpreter_root_config,
              setup, test_make_symlink_in_container, teardown);
  g_test_add ("/options/defaults", Fixture, NULL,
              setup, test_options_defaults, teardown);
  g_test_add ("/options/false", Fixture, NULL,
              setup, test_options_false, teardown);
  g_test_add ("/options/invalid", Fixture, NULL,
              setup, test_options_invalid, teardown);
  g_test_add ("/options/steam-client", Fixture, NULL,
              setup, test_options_steam_client, teardown);
  g_test_add ("/options/true", Fixture, NULL,
              setup, test_options_true, teardown);
  g_test_add ("/passwd", Fixture, NULL, setup, test_passwd, teardown);
  g_test_add ("/path-visible-in-provider-namespace", Fixture, NULL,
              setup, test_path_visible_in_provider_namespace, teardown);

  for (size_t i = 0; i < G_N_ELEMENTS (payload_command_tests); i++)
    {
      Config *config = &payload_command_configs[i];
      const PayloadCommandTest *test = &payload_command_tests[i];
      g_autofree char *name = g_strdup_printf ("/payload-command/%s",
                                               test->name);

      *config = aarch64_config;
      config->payload_command_test = test;
      g_test_add (name, Fixture, config,
                  setup, test_payload_command, teardown);
    }

  g_test_add ("/remap-ld-preload", Fixture, &default_config,
              setup_ld_preload, test_remap_ld_preload, teardown);
  g_test_add ("/remap-ld-preload-flatpak", Fixture, &default_config,
              setup_ld_preload, test_remap_ld_preload_flatpak, teardown);
  g_test_add ("/remap-ld-preload-no-runtime", Fixture, &default_config,
              setup_ld_preload, test_remap_ld_preload_no_runtime, teardown);
  g_test_add ("/remap-ld-preload-flatpak-no-runtime", Fixture, &default_config,
              setup_ld_preload, test_remap_ld_preload_flatpak_no_runtime, teardown);
  g_test_add ("/supported-archs", Fixture, NULL,
              setup, test_supported_archs, teardown);
  g_test_add ("/use-home/shared/default", Fixture, &default_config,
              setup, test_use_home_shared, teardown);
  g_test_add ("/use-home/shared/limited", Fixture, &limit_shared_dirs_config,
              setup, test_use_home_shared, teardown);
  g_test_add ("/use-host-os/default", Fixture, &default_config,
              setup, test_use_host_os, teardown);
  g_test_add ("/use-host-os/limited", Fixture, &limit_shared_dirs_config,
              setup, test_use_host_os, teardown);

  g_test_add ("/aarch64/remap-ld-preload", Fixture, &aarch64_config,
              setup_ld_preload, test_remap_ld_preload, teardown);
  g_test_add ("/aarch64/remap-ld-preload-flatpak", Fixture, &aarch64_config,
              setup_ld_preload, test_remap_ld_preload_flatpak, teardown);
  g_test_add ("/aarch64/remap-ld-preload-no-runtime", Fixture, &aarch64_config,
              setup_ld_preload, test_remap_ld_preload_no_runtime, teardown);
  g_test_add ("/aarch64/remap-ld-preload-flatpak-no-runtime", Fixture, &aarch64_config,
              setup_ld_preload, test_remap_ld_preload_flatpak_no_runtime, teardown);

  g_test_add ("/x86/remap-ld-preload", Fixture, &x86_config,
              setup_ld_preload, test_remap_ld_preload, teardown);
  g_test_add ("/x86/remap-ld-preload-flatpak", Fixture, &x86_config,
              setup_ld_preload, test_remap_ld_preload_flatpak, teardown);
  g_test_add ("/x86/remap-ld-preload-no-runtime", Fixture, &x86_config,
              setup_ld_preload, test_remap_ld_preload_no_runtime, teardown);
  g_test_add ("/x86/remap-ld-preload-flatpak-no-runtime", Fixture, &x86_config,
              setup_ld_preload, test_remap_ld_preload_flatpak_no_runtime, teardown);

  return g_test_run ();
}
