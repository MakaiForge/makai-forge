/*
 * Copyright © 2023 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#include <glib.h>

#include "steam-runtime-tools/glib-backports-internal.h"
#include "steam-runtime-tools/utils-internal.h"
#include "libglnx.h"

#include "adverb-preload.h"
#include "flatpak-utils-base-private.h"
#include "supported-architectures.h"
#include "tests/test-utils.h"

typedef struct
{
  const char * const *architectures;
  gboolean can_discover_platform;
} Config;

typedef struct
{
  const Config *config;
  TestsOpenFdSet old_fds;
  FlatpakBwrap *bwrap;
  PvPerArchDirs *lib_temp_dirs;
  const gchar *primary_arch_path;   /* borrowed from lib_temp_dirs */
  GArray *archs;
  GQuark primary_arch;
} Fixture;

static const Config default_config = {
  .architectures = NULL,
  .can_discover_platform = TRUE,
};

static void
setup (Fixture *f,
       gconstpointer context)
{
  const Config *config = context;
  g_autoptr(GError) local_error = NULL;
  gsize i;

  if (config == NULL)
    config = &default_config;

  f->config = config;
  f->archs = _srt_architecture_array_new ();

  if (config->architectures != NULL)
    {
      for (i = 0; config->architectures[i] != NULL; i++)
        {
          GQuark arch_quark = g_quark_from_static_string (config->architectures[i]);

          g_array_append_val (f->archs, arch_quark);
        }
    }
  else
    {
      _srt_architecture_array_populate_with_defaults (f->archs);
    }

  g_return_if_fail (f->archs->len > 0);
  f->primary_arch = g_array_index (f->archs, GQuark, 0);

  f->old_fds = tests_check_fd_leaks_enter ();
  f->bwrap = flatpak_bwrap_new (flatpak_bwrap_empty_env);

  if (config->can_discover_platform)
    {
      g_autoptr(SrtSystemInfo) info = NULL;

      info = srt_system_info_new (NULL);
      f->lib_temp_dirs = pv_per_arch_dirs_new (info,
                                               (const GQuark *) f->archs->data,
                                               f->archs->len,
                                               &local_error);
#ifdef _SRT_TESTS_STRICT
      /* We allow this to fail because it might fail on particularly strange
       * OS configurations, but for platforms we actively support,
       * we expect it to work */
      g_assert_no_error (local_error);
      g_assert_nonnull (f->lib_temp_dirs);
#endif

      if (f->lib_temp_dirs == NULL)
        {
          g_test_skip (local_error->message);
          return;
        }

      g_test_message ("Cross-platform module prefix: %s",
                      f->lib_temp_dirs->libdl_token_path);

      for (i = 0; i < f->archs->len; i++)
        {
          GQuark arch_quark = g_array_index (f->archs, GQuark, i);
          const char *tuple = g_quark_to_string (arch_quark);
          const char *abi_path;

          abi_path = pv_per_arch_dirs_get_abi_path (f->lib_temp_dirs,
                                                    arch_quark);
          /* If pv_per_arch_dirs_new() succeeded, it populates abi_paths with
           * every architecture requested */
          g_assert_nonnull (abi_path);
          g_test_message ("Concrete path for %s architecture: %s",
                          tuple, abi_path);
        }

      f->primary_arch_path = pv_per_arch_dirs_get_abi_path (f->lib_temp_dirs,
                                                            f->primary_arch);
      g_assert_nonnull (f->primary_arch_path);
    }
  else
    {
      g_test_message ("Pretending we cannot use $LIB/$PLATFORM");
    }
}

static void
teardown (Fixture *f,
          gconstpointer context)
{
  G_GNUC_UNUSED const Config *config = context;

  g_clear_pointer (&f->lib_temp_dirs, pv_per_arch_dirs_free);
  g_clear_pointer (&f->bwrap, flatpak_bwrap_free);
  g_clear_pointer (&f->archs, g_array_unref);
  tests_check_fd_leaks_leave (f->old_fds);
}

static inline gboolean
fixture_has_arch (Fixture *f,
                  const char *tuple)
{
  return _srt_architecture_array_has (f->archs, g_quark_from_string (tuple));
}

typedef struct
{
  const char *name;
  gsize index_in_preload_variables;
  gsize abi_index;
} PreloadInput;

static gsize
preload_inputs_to_modules (Fixture *f,
                           const PreloadInput *inputs,
                           gsize n_inputs,
                           PvAdverbPreloadModule *modules,
                           gsize n_modules)
{
  gsize i;
  gsize used = 0;

  g_return_val_if_fail (n_inputs == n_modules, 0);

  for (i = 0; i < n_inputs; i++)
    {
      if (inputs[i].abi_index != PV_UNSPECIFIED_ABI
          && inputs[i].abi_index >= f->archs->len)
        {
          g_test_message ("Input ABI index not applicable, ignoring %s",
                          inputs[i].name);
          continue;
        }

      modules[used].name = g_strdup (inputs[i].name);
      modules[used].index_in_preload_variables = inputs[i].index_in_preload_variables;

      if (inputs[i].abi_index == PV_UNSPECIFIED_ABI)
        {
          modules[used].architecture = 0;
        }
      else
        {
          g_return_val_if_fail (inputs[i].abi_index < f->archs->len, 0);
          modules[used].architecture = g_array_index (f->archs, GQuark, inputs[i].abi_index);
        }

      used++;
    }

  return used;
}

static void
test_basic (Fixture *f,
            gconstpointer context)
{
  static const PreloadInput inputs[] =
  {
    {
      .name = "",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_AUDIT,
      .abi_index = 0,
    },
    {
      .name = "/opt/libaudit.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_AUDIT,
      .abi_index = 0,
    },
    {
      .name = "",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_AUDIT,
      .abi_index = PV_UNSPECIFIED_ABI,
    },
    {
      .name = "/opt/libpreload.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = 0,
    },
    {
      .name = "/opt/unspecified.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = PV_UNSPECIFIED_ABI,
    },
    {
      .name = "/opt/libpreload2.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = 0,
    },
    {
      .name = "/opt/unspecified2.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = PV_UNSPECIFIED_ABI,
    },
  };
  PvAdverbPreloadModule modules[G_N_ELEMENTS (inputs)] = { { NULL } };
  g_autoptr(GError) local_error = NULL;
  g_autoptr(GString) expected = g_string_new ("");
  g_autoptr(GString) path = g_string_new ("");
  gsize n_modules;
  gboolean ret;
  gsize i;

  n_modules = preload_inputs_to_modules (f, inputs, G_N_ELEMENTS (inputs),
                                         modules, G_N_ELEMENTS (modules));
  g_assert_cmpuint (n_modules, <=, G_N_ELEMENTS (modules));
  ret = pv_adverb_set_up_preload_modules (f->bwrap,
                                          (const GQuark *) f->archs->data,
                                          f->archs->len,
                                          f->lib_temp_dirs,
                                          modules,
                                          n_modules,
                                          &local_error);
  g_assert_no_error (local_error);
  g_assert_true (ret);

  flatpak_bwrap_sort_envp (f->bwrap);
  g_assert_nonnull (f->bwrap->envp);
  i = 0;

  g_string_assign (expected, "LD_AUDIT=");

  if (f->lib_temp_dirs != NULL)
    g_string_append_printf (expected, "%s/libaudit.so",
                            f->lib_temp_dirs->libdl_token_path);
  else
    g_string_append (expected, "/opt/libaudit.so");

  g_assert_cmpstr (f->bwrap->envp[i], ==, expected->str);
  i++;

  /* Order is preserved, independent of whether an ABI is specified */
  g_string_assign (expected, "LD_PRELOAD=");

  if (f->lib_temp_dirs != NULL)
    g_string_append_printf (expected, "%s/libpreload.so",
                            f->lib_temp_dirs->libdl_token_path);
  else
    g_string_append (expected, "/opt/libpreload.so");

  g_string_append_c (expected, ':');
  g_string_append (expected, "/opt/unspecified.so");
  g_string_append_c (expected, ':');

  if (f->lib_temp_dirs != NULL)
    g_string_append_printf (expected, "%s/libpreload2.so",
                            f->lib_temp_dirs->libdl_token_path);
  else
    g_string_append (expected, "/opt/libpreload2.so");

  g_string_append_c (expected, ':');
  g_string_append (expected, "/opt/unspecified2.so");
  g_assert_cmpstr (f->bwrap->envp[i], ==, expected->str);
  i++;

  g_assert_cmpstr (f->bwrap->envp[i], ==, NULL);

  for (i = 0; i < n_modules; i++)
    {
      g_autofree gchar *target = NULL;

      if (f->lib_temp_dirs == NULL)
        continue;

      /* Empty module entries are ignored */
      if (modules[i].name[0] == '\0')
        continue;

      g_string_assign (path, f->primary_arch_path);
      g_string_append_c (path, G_DIR_SEPARATOR);
      g_string_append (path, glnx_basename (modules[i].name));
      target = flatpak_readlink (path->str, &local_error);

      /* Only the modules that have architecture-specific variations
       * (in practice those that originally had $LIB or $PLATFORM) need
       * symlinks created for them, because only those modules get their
       * LD_PRELOAD entries rewritten */
      if (modules[i].architecture != 0)
        {
          g_assert_no_error (local_error);
          g_test_message ("%s -> %s", path->str, target);
          g_assert_cmpstr (target, ==, modules[i].name);
        }
      else
        {
          g_assert_error (local_error, G_IO_ERROR, G_IO_ERROR_NOT_FOUND);
          g_clear_error (&local_error);
        }
    }

  for (i = 0; i < G_N_ELEMENTS (modules); i++)
    pv_adverb_preload_module_clear (&modules[i]);
}

static void
test_biarch (Fixture *f,
             gconstpointer context)
{
  static const PreloadInput inputs[] =
  {
    {
      .name = "/opt/libpreload.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = PV_UNSPECIFIED_ABI,
    },
    /* In practice usually x86_64-linux-gnu */
    {
      .name = "/opt/lib0/libpreload.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = 0,
    },
    /* In practice usually i386-linux-gnu */
    {
      .name = "/opt/lib1/libpreload.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = 1,
    },
  };
  PvAdverbPreloadModule modules[G_N_ELEMENTS (inputs)] = { { NULL } };
  g_autoptr(GError) local_error = NULL;
  g_autoptr(GString) expected = g_string_new ("");
  g_autoptr(GString) path = g_string_new ("");
  gsize n_modules;
  gboolean ret;
  gsize i;

  n_modules = preload_inputs_to_modules (f, inputs, G_N_ELEMENTS (inputs),
                                         modules, G_N_ELEMENTS (modules));
  g_assert_cmpuint (n_modules, <=, G_N_ELEMENTS (modules));
  ret = pv_adverb_set_up_preload_modules (f->bwrap,
                                          (const GQuark *) f->archs->data,
                                          f->archs->len,
                                          f->lib_temp_dirs,
                                          modules,
                                          n_modules,
                                          &local_error);
  g_assert_no_error (local_error);
  g_assert_true (ret);

  flatpak_bwrap_sort_envp (f->bwrap);
  g_assert_nonnull (f->bwrap->envp);
  i = 0;

  /* We don't have any LD_AUDIT modules in this example, so we don't set
   * those up at all, and therefore we expect f->bwrap->envp not to
   * contain LD_AUDIT. */

  g_string_assign (expected, "LD_PRELOAD=");
  g_string_append (expected, "/opt/libpreload.so");
  g_string_append_c (expected, ':');

  if (f->lib_temp_dirs != NULL)
    {
      g_string_append_printf (expected, "%s/libpreload.so",
                              f->lib_temp_dirs->libdl_token_path);
    }
  else
    {
      g_string_append (expected, "/opt/lib0/libpreload.so");

      if (f->archs->len > 1)
        {
          g_string_append_c (expected, ':');
          g_string_append (expected, "/opt/lib1/libpreload.so");
        }
    }

  g_assert_cmpstr (f->bwrap->envp[i], ==, expected->str);
  i++;

  g_assert_cmpstr (f->bwrap->envp[i], ==, NULL);

  for (i = 0; i < f->archs->len; i++)
    {
      GQuark arch_quark = g_array_index (f->archs, GQuark, i);
      g_autofree gchar *target = NULL;
      const char *abi_path;

      if (f->lib_temp_dirs == NULL)
        continue;

      abi_path = pv_per_arch_dirs_get_abi_path (f->lib_temp_dirs,
                                                arch_quark);
      g_assert_nonnull (abi_path);
      g_string_assign (path, abi_path);
      g_string_append_c (path, G_DIR_SEPARATOR);
      g_string_append (path, "libpreload.so");

      target = flatpak_readlink (path->str, &local_error);
      g_assert_no_error (local_error);
      g_test_message ("%s -> %s", path->str, target);

      g_string_assign (expected, "");
      g_string_append_printf (expected, "/opt/lib%zu/libpreload.so", i);
      g_assert_cmpstr (target, ==, expected->str);
    }

  for (i = 0; i < G_N_ELEMENTS (modules); i++)
    pv_adverb_preload_module_clear (&modules[i]);
}

typedef struct
{
  const char *option;
  struct
    {
      const char *name;
      const char *architecture;
    } expected;
} CommandLineTest;

static void
test_cli (Fixture *f,
          gconstpointer context)
{
  static const CommandLineTest tests[] =
  {
    {
      .option = "",
      .expected = {
        .name = "",
        .architecture = NULL,
      },
    },
    {
      .option = "libpreload.so",
      .expected = {
        .name = "libpreload.so",
        .architecture = NULL,
      },
    },
    {
      .option = "/lib64/libpreload.so:abi=" SRT_ABI_X86_64,
      .expected = {
        .name = "/lib64/libpreload.so",
        .architecture = SRT_ABI_X86_64,
      },
    },
    {
      .option = "/lib32/libpreload.so:abi=" SRT_ABI_I386,
      .expected = {
        .name = "/lib32/libpreload.so",
        .architecture = SRT_ABI_I386,
      },
    },
    {
      .option = "/lib/libpreload.so:abi=arm-linux-gnueabihf",
      .expected = {
        .name = "/lib/libpreload.so",
        .architecture = "arm-linux-gnueabihf",
      },
    },
#if defined(_SRT_MULTIARCH)
    {
      .option = "/tmp/libabi.so:abi=" _SRT_MULTIARCH,
      .expected = {
        .name = "/tmp/libabi.so",
        .architecture = _SRT_MULTIARCH,
      },
    },
#endif
    {
      .option = "/tmp/libabi.so:nonsense",
      .expected = {
        .name = NULL,
      },
    },
    {
      .option = "/tmp/libabi.so:abi=glados",
      .expected = {
        .name = NULL,
      },
    },
  };
  gsize i;

  for (i = 0; i < G_N_ELEMENTS (tests); i++)
    {
      const CommandLineTest *test = &tests[i];
      /* There's no real difference between our handling of LD_AUDIT
       * and LD_PRELOAD, so we alternate between testing them both */
      const PvPreloadVariableIndex which = i % 2;
      const char *option = pv_preload_variables[which].adverb_option;
      g_autoptr(GError) local_error = NULL;
      g_auto(PvAdverbPreloadModule) actual = PV_ADVERB_PRELOAD_MODULE_INIT;
      gboolean ret;

      ret = pv_adverb_preload_module_parse_adverb_cli (&actual,
                                                       option,
                                                       which,
                                                       test->option,
                                                       &local_error);

      if (ret)
        {
          const char *abi = "(unspecified)";

          g_assert_no_error (local_error);

          if (actual.architecture != 0)
            abi = g_quark_to_string (actual.architecture);

          g_test_message ("\"%s\" -> \"%s\", abi=%s",
                          test->option, actual.name, abi);
        }
      else
        {
          g_test_message ("\"%s\" -> error \"%s\"",
                          test->option, local_error->message);
        }

      if (test->expected.name == NULL)
        {
          g_assert_false (ret);
          g_assert_null (actual.name);
          g_assert_nonnull (local_error);
        }
      else
        {
          g_autofree gchar *serialized = NULL;
          g_auto(PvAdverbPreloadModule) reparsed = PV_ADVERB_PRELOAD_MODULE_INIT;
          gchar *equals;

          g_assert_no_error (local_error);
          g_assert_true (ret);
          g_assert_cmpstr (actual.name, ==, test->expected.name);

          /* Note that g_quark_to_string (0) is NULL, so this works even if
           * test->expected.architecture is NULL */
          g_assert_cmpstr (g_quark_to_string (actual.architecture),
                           ==, test->expected.architecture);

          g_assert_cmpuint (actual.index_in_preload_variables, ==, which);

          /* Check that it round-trips */
          serialized = pv_adverb_preload_module_to_adverb_cli (&actual);
          g_assert_true (g_str_has_prefix (serialized, option));
          equals = serialized + strlen (option);
          g_assert_cmpint (*equals, ==, '=');
          *equals = '\0';

          ret = pv_adverb_preload_module_parse_adverb_cli (&reparsed,
                                                           option,
                                                           which,
                                                           equals + 1,
                                                           &local_error);
          g_assert_no_error (local_error);
          g_assert_true (ret);
          g_assert_cmpstr (reparsed.name, ==, test->expected.name);
          g_assert_cmpstr (g_quark_to_string (reparsed.architecture),
                           ==, test->expected.architecture);
          g_assert_cmpuint (reparsed.index_in_preload_variables, ==, which);
        }
    }
}

/*
 * There is a special case for gameoverlayrenderer.so:
 * pv-adverb --ld-preload=/.../ubuntu12_32/gameoverlayrenderer.so is
 * treated as if it had been .../gameoverlayrenderer.so:abi=i386-linux-gnu,
 * and so on.
 */
static void
test_gameoverlayrenderer (Fixture *f,
                          gconstpointer context)
{
  static const PreloadInput inputs[] =
  {
    {
      .name = "/opt/steam/some-other-abi/gameoverlayrenderer.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = PV_UNSPECIFIED_ABI,
    },
    {
      .name = "/opt/steam/ubuntu12_32/gameoverlayrenderer.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = PV_UNSPECIFIED_ABI,
    },
    {
      .name = "/opt/steam/ubuntu12_64/gameoverlayrenderer.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = PV_UNSPECIFIED_ABI,
    },
    {
      .name = "/opt/steam/some-other-abi/gameoverlayrenderer.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = PV_UNSPECIFIED_ABI,
    },
  };
  PvAdverbPreloadModule modules[G_N_ELEMENTS (inputs)] = { { NULL } };
  g_autoptr(GError) local_error = NULL;
  g_autoptr(GString) expected = g_string_new ("");
  g_autoptr(GString) path = g_string_new ("");
  gsize n_modules;
  gboolean ret;
  gsize i;

  n_modules = preload_inputs_to_modules (f, inputs, G_N_ELEMENTS (inputs),
                                         modules, G_N_ELEMENTS (modules));
  g_assert_cmpuint (n_modules, ==, G_N_ELEMENTS (modules));
  ret = pv_adverb_set_up_preload_modules (f->bwrap,
                                          (const GQuark *) f->archs->data,
                                          f->archs->len,
                                          f->lib_temp_dirs,
                                          modules,
                                          n_modules,
                                          &local_error);
  g_assert_no_error (local_error);
  g_assert_true (ret);

  flatpak_bwrap_sort_envp (f->bwrap);
  g_assert_nonnull (f->bwrap->envp);
  i = 0;

  g_string_assign (expected, "LD_PRELOAD=");
  g_string_append (expected, "/opt/steam/some-other-abi/gameoverlayrenderer.so");
  g_string_append_c (expected, ':');

  if (f->lib_temp_dirs == NULL
      || !fixture_has_arch (f, SRT_ABI_I386))
    {
      g_string_append (expected, "/opt/steam/ubuntu12_32/gameoverlayrenderer.so");
      g_string_append_c (expected, ':');
    }

  if (f->lib_temp_dirs != NULL
      && fixture_has_arch (f, SRT_ABI_X86_64))
    g_string_append_printf (expected, "%s/gameoverlayrenderer.so",
                            f->lib_temp_dirs->libdl_token_path);
  else
    g_string_append (expected, "/opt/steam/ubuntu12_64/gameoverlayrenderer.so");

  g_string_append_c (expected, ':');
  g_string_append (expected, "/opt/steam/some-other-abi/gameoverlayrenderer.so");
  g_assert_cmpstr (f->bwrap->envp[i], ==, expected->str);
  i++;

  g_assert_cmpstr (f->bwrap->envp[i], ==, NULL);

  for (i = 0; i < f->archs->len; i++)
    {
      GQuark arch_quark = g_array_index (f->archs, GQuark, i);
      const char *tuple = g_quark_to_string (arch_quark);
      g_autofree gchar *target = NULL;
      const SrtKnownArchitecture *known;
      const char *abi_path;

      if (f->lib_temp_dirs == NULL
          || !(fixture_has_arch (f, SRT_ABI_X86_64)
               || fixture_has_arch (f, SRT_ABI_I386)))
        continue;

      abi_path = pv_per_arch_dirs_get_abi_path (f->lib_temp_dirs,
                                                arch_quark);
      g_assert_nonnull (abi_path);
      g_string_assign (path, abi_path);
      g_string_append_c (path, G_DIR_SEPARATOR);
      g_string_append (path, "gameoverlayrenderer.so");

      target = flatpak_readlink (path->str, &local_error);
      g_assert_no_error (local_error);
      g_test_message ("%s -> %s", path->str, target);

      g_string_assign (expected, "");
      known = _srt_architecture_get_by_tuple (tuple);
      g_assert_nonnull (known);
      g_string_append_printf (expected, "/opt/steam/%s/gameoverlayrenderer.so",
                              known->steam_gameoverlayrenderer_dir);
      g_assert_cmpstr (target, ==, expected->str);
    }

  for (i = 0; i < G_N_ELEMENTS (modules); i++)
    pv_adverb_preload_module_clear (&modules[i]);
}

/*
 * steamrt/tasks#302: pv-adverb would fail if /usr/$LIB/libMangoHud.so
 * was (uselessly) added to the LD_PRELOAD path more than once.
 * This test exercises the same thing for gameoverlayrenderer.so, too.
 */
static void
test_repetition (Fixture *f,
                 gconstpointer context)
{
  static const PreloadInput inputs[] =
  {
    {
      .name = "/opt/lib0/libfirst.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = 0,
    },
    {
      .name = "/opt/lib0/one/same-basename.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = 0,
    },
    {
      .name = "/opt/lib0/two/same-basename.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = 0,
    },
    {
      .name = "/opt/lib0/libpreload.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = 0,
    },
    {
      .name = "/opt/lib1/libpreload.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = 1,
    },
    {
      .name = "/opt/steam/ubuntu12_32/gameoverlayrenderer.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = PV_UNSPECIFIED_ABI,
    },
    {
      .name = "/opt/steam/ubuntu12_64/gameoverlayrenderer.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = PV_UNSPECIFIED_ABI,
    },
    {
      .name = "/opt/lib0/libmiddle.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = 0,
    },
    {
      .name = "/opt/lib0/libpreload.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = 0,
    },
    {
      .name = "/opt/lib1/libpreload.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = 1,
    },
    {
      .name = "/opt/steam/ubuntu12_32/gameoverlayrenderer.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = PV_UNSPECIFIED_ABI,
    },
    {
      .name = "/opt/steam/ubuntu12_64/gameoverlayrenderer.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = PV_UNSPECIFIED_ABI,
    },
    {
      .name = "/opt/lib0/liblast.so",
      .index_in_preload_variables = PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
      .abi_index = 0,
    },
  };
  PvAdverbPreloadModule modules[G_N_ELEMENTS (inputs)] = { { NULL } };
  g_autoptr(GError) local_error = NULL;
  g_autoptr(GString) expected = g_string_new ("");
  g_autoptr(GString) path = g_string_new ("");
  gsize n_modules;
  gboolean ret;
  gsize i;

  n_modules = preload_inputs_to_modules (f, inputs, G_N_ELEMENTS (inputs),
                                         modules, G_N_ELEMENTS (modules));
  g_assert_cmpuint (n_modules, <=, G_N_ELEMENTS (modules));
  ret = pv_adverb_set_up_preload_modules (f->bwrap,
                                          (const GQuark *) f->archs->data,
                                          f->archs->len,
                                          f->lib_temp_dirs,
                                          modules,
                                          n_modules,
                                          &local_error);
  g_assert_no_error (local_error);
  g_assert_true (ret);

  flatpak_bwrap_sort_envp (f->bwrap);
  g_assert_nonnull (f->bwrap->envp);
  i = 0;

  g_string_assign (expected, "LD_PRELOAD=");

  if (f->lib_temp_dirs != NULL)
    g_string_append_printf (expected, "%s/libfirst.so",
                            f->lib_temp_dirs->libdl_token_path);
  else
    g_string_append (expected, "/opt/lib0/libfirst.so");

  g_string_append_c (expected, ':');

  if (f->lib_temp_dirs != NULL)
    g_string_append_printf (expected, "%s/same-basename.so",
                            f->lib_temp_dirs->libdl_token_path);
  else
    g_string_append (expected, "/opt/lib0/one/same-basename.so");

  g_string_append_c (expected, ':');
  /* We don't do the per-architecture split if there's a basename
   * collision */
  g_string_append (expected, "/opt/lib0/two/same-basename.so");
  g_string_append_c (expected, ':');

  if (f->lib_temp_dirs != NULL)
    {
      g_string_append_printf (expected, "%s/libpreload.so",
                              f->lib_temp_dirs->libdl_token_path);
    }
  else
    {
      g_string_append (expected, "/opt/lib0/libpreload.so");

      if (f->archs->len > 1)
        {
          g_string_append_c (expected, ':');
          g_string_append (expected, "/opt/lib1/libpreload.so");
        }
    }

  if (f->lib_temp_dirs == NULL
      || !fixture_has_arch (f, SRT_ABI_I386))
    {
      g_string_append_c (expected, ':');
      g_string_append (expected, "/opt/steam/ubuntu12_32/gameoverlayrenderer.so");
    }

  g_string_append_c (expected, ':');

  if (f->lib_temp_dirs != NULL
      && fixture_has_arch (f, SRT_ABI_X86_64))
    g_string_append_printf (expected, "%s/gameoverlayrenderer.so",
                            f->lib_temp_dirs->libdl_token_path);
  else
    g_string_append (expected, "/opt/steam/ubuntu12_64/gameoverlayrenderer.so");

  g_string_append_c (expected, ':');

  if (f->lib_temp_dirs != NULL)
    g_string_append_printf (expected, "%s/libmiddle.so",
                            f->lib_temp_dirs->libdl_token_path);
  else
    g_string_append (expected, "/opt/lib0/libmiddle.so");

  g_string_append_c (expected, ':');

  if (f->lib_temp_dirs == NULL)
    {
      /* If we were unable to split up the modules by architecture,
       * we change as little as possible, so in this case we do not
       * deduplicate */
      g_string_append (expected, "/opt/lib0/libpreload.so");
      g_string_append_c (expected, ':');

      if (f->archs->len > 1)
        {
          g_string_append (expected, "/opt/lib1/libpreload.so");
          g_string_append_c (expected, ':');
        }
    }

  if (f->lib_temp_dirs == NULL
      || !fixture_has_arch (f, SRT_ABI_I386))
    {
      g_string_append (expected, "/opt/steam/ubuntu12_32/gameoverlayrenderer.so");
      g_string_append_c (expected, ':');
    }

  if (f->lib_temp_dirs == NULL
      || !fixture_has_arch (f, SRT_ABI_X86_64))
    {
      g_string_append (expected, "/opt/steam/ubuntu12_64/gameoverlayrenderer.so");
      g_string_append_c (expected, ':');
    }

  if (f->lib_temp_dirs != NULL)
    g_string_append_printf (expected, "%s/liblast.so",
                            f->lib_temp_dirs->libdl_token_path);
  else
    g_string_append (expected, "/opt/lib0/liblast.so");

  g_assert_cmpstr (f->bwrap->envp[i], ==, expected->str);
  i++;

  g_assert_cmpstr (f->bwrap->envp[i], ==, NULL);

  /* The symlinks get created (but only once) */

  for (i = 0; i < MIN (f->archs->len, 2); i++)
    {
      GQuark arch_quark = g_array_index (f->archs, GQuark, i);
      const char *tuple = g_quark_to_string (arch_quark);
      gsize j;
      const char *abi_path;

      if (f->lib_temp_dirs == NULL)
        continue;

      abi_path = pv_per_arch_dirs_get_abi_path (f->lib_temp_dirs,
                                                arch_quark);
      g_assert_nonnull (abi_path);

      for (j = 0; j < n_modules; j++)
        {
          g_autofree gchar *target = NULL;

          if (modules[j].architecture != arch_quark)
            {
              g_test_message ("Not expecting a %s symlink for %s",
                              tuple, modules[j].name);
              continue;
            }

          if (g_str_equal (modules[j].name, "/opt/lib0/two/same-basename.so"))
            {
              g_test_message ("Not expecting a symlink for %s because it "
                              "collides with a basename seen earlier",
                              modules[j].name);
              continue;
            }

          g_string_assign (path, abi_path);
          g_string_append_c (path, G_DIR_SEPARATOR);
          g_string_append (path, glnx_basename (modules[j].name));

          target = flatpak_readlink (path->str, &local_error);
          g_assert_no_error (local_error);
          g_test_message ("%s -> %s", path->str, target);

          g_assert_cmpstr (target, ==, modules[j].name);
        }
    }

  for (i = 0; i < f->archs->len; i++)
    {
      GQuark arch_quark = g_array_index (f->archs, GQuark, i);
      const char *tuple = g_quark_to_string (arch_quark);
      g_autofree gchar *target = NULL;
      const SrtKnownArchitecture *known;
      const char *abi_path;

      if (f->lib_temp_dirs == NULL
          || !fixture_has_arch (f, tuple)
          || !(g_str_equal (tuple, SRT_ABI_X86_64)
               || g_str_equal (tuple, SRT_ABI_I386)))
        continue;

      abi_path = pv_per_arch_dirs_get_abi_path (f->lib_temp_dirs,
                                                arch_quark);
      g_assert_nonnull (abi_path);
      g_string_assign (path, abi_path);

      g_string_append_c (path, G_DIR_SEPARATOR);
      g_string_append (path, "gameoverlayrenderer.so");

      target = flatpak_readlink (path->str, &local_error);
      g_assert_no_error (local_error);
      g_test_message ("%s -> %s", path->str, target);

      g_string_assign (expected, "");
      known = _srt_architecture_get_by_tuple (tuple);
      g_assert_nonnull (known);
      g_string_append_printf (expected, "/opt/steam/%s/gameoverlayrenderer.so",
                              known->steam_gameoverlayrenderer_dir);
      g_assert_cmpstr (target, ==, expected->str);
    }

  for (i = 0; i < G_N_ELEMENTS (modules); i++)
    pv_adverb_preload_module_clear (&modules[i]);
}

static const char * const x86_archs[] =
{
  SRT_ABI_X86_64,
  SRT_ABI_I386,
  NULL
};

static const char * const x86_64_archs[] =
{
  SRT_ABI_X86_64,
  NULL
};

static const char * const aarch64_archs[] =
{
  SRT_ABI_AARCH64,
  NULL
};

static const Config aarch64_config = {
  .architectures = aarch64_archs,
  .can_discover_platform = TRUE,
};

static const Config x86_config = {
  .architectures = x86_archs,
  .can_discover_platform = TRUE,
};

static const Config x86_64_config = {
  .architectures = x86_64_archs,
  .can_discover_platform = TRUE,
};

static const Config cannot_discover_platform = {
  .can_discover_platform = FALSE,
};

static const Config aarch64_cannot_discover_platform = {
  .architectures = aarch64_archs,
  .can_discover_platform = FALSE,
};

static const Config x86_cannot_discover_platform = {
  .architectures = x86_archs,
  .can_discover_platform = FALSE,
};

static const Config x86_64_cannot_discover_platform = {
  .architectures = x86_64_archs,
  .can_discover_platform = FALSE,
};

int
main (int argc,
      char **argv)
{
  _srt_setenv_disable_gio_modules ();

  /* In unit tests it isn't always straightforward to find the real
   * ${PLATFORM}, so use a predictable mock implementation that always
   * uses SrtKnownArchitecture.libdl_platform_expansions[0] on x86
   * or "mock" elsewhere */
  g_setenv ("PRESSURE_VESSEL_TEST_STANDARDIZE_PLATFORM", "1", TRUE);

  _srt_tests_init (&argc, &argv, NULL);

#define add_test_many_archs(name, function) \
  do { \
    g_test_add (name, \
                Fixture, NULL, \
                setup, function, teardown); \
    g_test_add (name "/aarch64", \
                Fixture, &aarch64_config, \
                setup, function, teardown); \
    g_test_add (name "/x86", \
                Fixture, &x86_config, \
                setup, function, teardown); \
    g_test_add (name "/x86_64", \
                Fixture, &x86_64_config, \
                setup, function, teardown); \
    g_test_add (name "/cannot-discover-platform", \
                Fixture, &cannot_discover_platform, \
                setup, function, teardown); \
    g_test_add (name "/cannot-discover-platform/aarch64", \
                Fixture, &aarch64_cannot_discover_platform, \
                setup, function, teardown); \
    g_test_add (name "/cannot-discover-platform/x86", \
                Fixture, &x86_cannot_discover_platform, \
                setup, function, teardown); \
    g_test_add (name "/cannot-discover-platform/x86_64", \
                Fixture, &x86_64_cannot_discover_platform, \
                setup, function, teardown); \
  } while (0)

  add_test_many_archs ("/basic", test_basic);
  add_test_many_archs ("/biarch", test_biarch);
  add_test_many_archs ("/gameoverlayrenderer", test_gameoverlayrenderer);
  add_test_many_archs ("/repetition", test_repetition);

  /* This one isn't affected by whether we have the PvPerArchDirs or not */
  g_test_add ("/cli", Fixture, NULL,
              setup, test_cli, teardown);

  return g_test_run ();
}
