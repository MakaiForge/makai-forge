/*
 * Copyright © 2025 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#include "steam-runtime-tools/emulator-internal.h"

#include "steam-runtime-tools/glib-backports-internal.h"

#include "steam-runtime-tools/architecture-internal.h"
#include "steam-runtime-tools/emulator-server-internal.h"
#include "steam-runtime-tools/utils-internal.h"
#include "test-utils.h"

typedef struct
{
  GError *error;
  gchar *qemu_json;
  gchar *mock_json;
  gchar *nonexistent_programs_json;
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

  f->mock_json = g_test_build_filename (G_TEST_DIST, "emulator-mock.json", NULL);
  f->nonexistent_programs_json = g_test_build_filename (G_TEST_DIST, "emulator-nonexistent.json", NULL);
  f->qemu_json = g_test_build_filename (G_TEST_DIST, "emulator-qemu-arm.json", NULL);
}

static void
teardown (Fixture *f,
          gconstpointer context)
{
  G_GNUC_UNUSED const Config *config = context;

  g_clear_error (&f->error);
  g_free (f->mock_json);
  g_free (f->nonexistent_programs_json);
  g_free (f->qemu_json);
}

static void
dump_overlay (const char *label,
              const SrtEnvOverlay *overlay)
{
  g_autoptr(GList) vars = _srt_env_overlay_get_vars (overlay);
  const GList *iter;

  for (iter = vars; iter != NULL; iter = iter->next)
    {
      const char *var = iter->data;
      const char *val = _srt_env_overlay_get (overlay, var);

      if (val == NULL)
        g_test_message ("%s: unset %s", label, var);
      else
        g_test_message ("%s: set %s=%s", label, var, val);
    }
}

static void
dump_emulator (const char *label,
               SrtEmulator *emulator)
{
  g_autoptr(GString) str = g_string_new ("");
  const char * const *strv;
  const char *s;
  const GQuark *quarks;
  size_t n;
  const SrtEnvOverlay *overlay;

  strv = _srt_emulator_get_argv (emulator);

  for (size_t i = 0; strv != NULL && strv[i] != NULL; i++)
    {
      g_autofree gchar *quoted = g_shell_quote (strv[i]);

      g_string_append_printf (str, " %s", quoted);
    }

  g_test_message ("%s ->%s", label, str->str);
  g_string_truncate (str, 0);

  strv = _srt_emulator_get_container_argv (emulator);

  for (size_t i = 0; strv != NULL && strv[i] != NULL; i++)
    {
      g_autofree gchar *quoted = g_shell_quote (strv[i]);

      g_string_append_printf (str, " %s", quoted);
    }

  g_test_message ("\tWhen running in container: %s", str->str);
  g_string_truncate (str, 0);

  strv = _srt_emulator_get_main_argv (emulator);

  for (size_t i = 0; strv != NULL && strv[i] != NULL; i++)
    {
      g_autofree gchar *quoted = g_shell_quote (strv[i]);

      g_string_append_printf (str, " %s", quoted);
    }

  g_test_message ("\tWhen running main game: %s", str->str);
  g_string_truncate (str, 0);

  s = _srt_emulator_get_manifest (emulator);

  if (s != NULL)
    g_test_message ("\tFrom manifest: %s", s);

  quarks = _srt_emulator_get_emulated_architectures (emulator, &n);

  for (size_t i = 0; i < n; i++)
    g_test_message ("\tEmulates architecture: %s", g_quark_to_string (quarks[i]));

  quarks = _srt_emulator_get_required_architectures (emulator, &n);

  for (size_t i = 0; i < n; i++)
    g_test_message ("\tRequires architecture: %s", g_quark_to_string (quarks[i]));

  strv = _srt_emulator_get_required_libraries (emulator);

  for (size_t i = 0; strv != NULL && strv[i] != NULL; i++)
    g_test_message ("\tRequires library: %s", strv[i]);

  strv = _srt_emulator_get_server_argv (emulator);

  for (size_t i = 0; strv != NULL && strv[i] != NULL; i++)
    {
      g_autofree gchar *quoted = g_shell_quote (strv[i]);

      g_string_append_printf (str, " %s", quoted);
    }

  g_test_message ("\tServer run for the duration of the game: %s", str->str);
  g_string_truncate (str, 0);

  overlay = _srt_emulator_get_environment (emulator);
  dump_overlay ("\tEnvironment", overlay);

  overlay = _srt_emulator_get_container_environment (emulator);
  dump_overlay ("\tEnvironment inside container", overlay);
}

/*
 * Exercise a minimal emulator manifest with an absolute path
 */
static void
test_basic (Fixture *f,
            gconstpointer context)
{
  g_autoptr(SrtEmulator) emulator = NULL;
  g_autoptr(SrtEmulator) reread = NULL;
  const char * const expected_argv[] =
    {
      "/usr/bin/qemu-arm",
      "-L",
      "/usr/lib/check that quoting is handled/%M",
      NULL
    };
  const char * const expected_archs[] =
    {
      "arm-linux-gnueabi",
      "arm-linux-gnueabihf",
      "arm-linux-gnu",
      NULL
    };
  const char * const * libraries;
  const GQuark *arch_quarks;
  const GQuark *arch_quarks_again;
  size_t n = (size_t) -1;
  const SrtEnvOverlay *overlay;
  g_autoptr(GArray) archs_copy = NULL;
  g_autoptr(GArray) required_archs_copy = NULL;
  g_autoptr(GPtrArray) arch_strings = NULL;
  g_autoptr(SrtEmulatorServer) server = NULL;
  g_autoptr(SrtEnvOverlay) env_copy = NULL;
  g_autoptr(SrtEnvOverlay) container_env_copy = NULL;
  g_auto(GStrv) argv_copy = NULL;
  g_auto(GStrv) libraries_copy = NULL;
  g_autofree char *manifest_realpath = NULL;
  g_autofree char *manifest_copy = NULL;
  g_auto(GLnxTmpDir) tmpdir = { .initialized = FALSE };
  g_autofree char *write_path = NULL;
  gboolean ok;

  manifest_realpath = realpath (f->qemu_json, NULL);
  emulator = _srt_emulator_new_from_manifest (f->qemu_json, &f->error);
  g_assert_no_error (f->error);
  g_assert_nonnull (emulator);
  dump_emulator (f->qemu_json, emulator);

  g_assert_cmpstrv (_srt_emulator_get_argv (emulator), expected_argv);
  g_assert_cmpstrv (_srt_emulator_get_container_argv (emulator), expected_argv);
  g_assert_cmpstrv (_srt_emulator_get_main_argv (emulator), expected_argv);
  g_assert_cmpstr (_srt_emulator_get_manifest (emulator), ==, manifest_realpath);
  libraries = _srt_emulator_get_required_libraries (emulator);
  g_assert_nonnull (libraries);
  g_assert_null (libraries[0]);
  g_assert_null (_srt_emulator_get_server_argv (emulator));

  arch_quarks = _srt_emulator_get_emulated_architectures (emulator, &n);

  for (size_t i = 0; i < n; i++)
    {
      g_assert_cmpuint (arch_quarks[i], !=, SRT_ARCHITECTURE_QUARK_NONE);
      g_assert_cmpstr (g_quark_to_string (arch_quarks[i]), ==, expected_archs[i]);
    }

  g_assert_cmpuint (arch_quarks[n], ==, SRT_ARCHITECTURE_QUARK_NONE);

  arch_quarks_again = _srt_emulator_get_emulated_architectures (emulator, NULL);

  for (size_t i = 0; i <= n; i++)
    g_assert_cmpuint (arch_quarks[i], ==, arch_quarks_again[i]);

  arch_quarks = _srt_emulator_get_required_architectures (emulator, &n);
  g_assert_cmpuint (n, ==, 0);
  g_assert_nonnull (arch_quarks);
  g_assert_cmpuint (arch_quarks[0], ==, SRT_ARCHITECTURE_QUARK_NONE);
  arch_quarks_again = _srt_emulator_get_required_architectures (emulator, NULL);
  g_assert_nonnull (arch_quarks_again);
  g_assert_cmpuint (arch_quarks_again[0], ==, SRT_ARCHITECTURE_QUARK_NONE);

  overlay = _srt_emulator_get_environment (emulator);
  g_assert_nonnull (overlay);
  g_assert_nonnull (overlay->values);
  g_assert_cmpuint (g_hash_table_size (overlay->values), ==, 0);

  overlay = _srt_emulator_get_container_environment (emulator);
  g_assert_nonnull (overlay);
  g_assert_nonnull (overlay->values);
  g_assert_cmpuint (g_hash_table_size (overlay->values), ==, 0);

  g_object_get (emulator,
                "argv", &argv_copy,
                "container-environment", &container_env_copy,
                "emulated-architectures", &archs_copy,
                "environment", &env_copy,
                "manifest", &manifest_copy,
                "required-architectures", &required_archs_copy,
                "required-libraries", &libraries_copy,
                NULL);
  g_assert_cmpstrv (_srt_const_strv (argv_copy), expected_argv);
  g_assert_cmpuint (archs_copy->len, ==, G_N_ELEMENTS (expected_archs) - 1);
  g_assert_cmpuint (required_archs_copy->len, ==, 0);
  g_assert_nonnull (libraries_copy);
  g_assert_null (libraries_copy[0]);
  g_assert_cmpstr (manifest_copy, ==, manifest_realpath);
  g_assert_nonnull (container_env_copy);
  g_assert_cmpuint (g_hash_table_size (container_env_copy->values), ==, 0);
  g_assert_nonnull (env_copy);
  g_assert_cmpuint (g_hash_table_size (env_copy->values), ==, 0);

  for (size_t i = 0; i < archs_copy->len; i++)
    {
      GQuark q = g_array_index (archs_copy, GQuark, i);

      g_assert_cmpuint (q, !=, SRT_ARCHITECTURE_QUARK_NONE);
      g_assert_cmpstr (g_quark_to_string (q), ==, expected_archs[i]);
    }

  g_clear_object (&emulator);
  emulator = _srt_emulator_new (expected_argv,
                                NULL,   /* container argv */
                                NULL,   /* container environment */
                                archs_copy,
                                NULL,   /* environment */
                                NULL,   /* main argv */
                                NULL,   /* manifest */
                                NULL,   /* required archs */
                                NULL,   /* required libraries */
                                NULL);  /* server argv */
  g_assert_cmpstrv (_srt_emulator_get_argv (emulator), expected_argv);
  g_assert_cmpstrv (_srt_emulator_get_container_argv (emulator), expected_argv);
  g_assert_cmpstrv (_srt_emulator_get_main_argv (emulator), expected_argv);
  g_assert_cmpstr (_srt_emulator_get_manifest (emulator), ==, NULL);
  arch_quarks = _srt_emulator_get_emulated_architectures (emulator, &n);
  g_assert_cmpuint (n, ==, archs_copy->len);
  arch_quarks = _srt_emulator_get_required_architectures (emulator, &n);
  g_assert_cmpuint (n, ==, 0);
  libraries = _srt_emulator_get_required_libraries (emulator);
  g_assert_nonnull (libraries);
  g_assert_null (libraries[0]);
  g_assert_null (_srt_emulator_get_server_argv (emulator));

    {
      g_autofree char *content = _srt_emulator_serialize_manifest (emulator);

      g_assert_nonnull (content);
      g_test_message ("serialized: %s", content);
    }

  glnx_mkdtemp ("test-XXXXXX", 0700, &tmpdir, &f->error);
  g_assert_no_error (f->error);
  write_path = g_build_filename (tmpdir.path, "emu.json", NULL);

  ok = _srt_emulator_write_manifest (emulator, write_path, &f->error);
  g_assert_no_error (f->error);
  g_assert_true (ok);

  reread = _srt_emulator_new_from_manifest (write_path, &f->error);
  g_assert_no_error (f->error);
  g_assert_nonnull (reread);
  dump_emulator ("read back from temp file", reread);
  g_assert_cmpstrv (_srt_emulator_get_argv (emulator),
                    _srt_emulator_get_argv (reread));
  g_assert_cmpstrv (_srt_emulator_get_container_argv (emulator),
                    _srt_emulator_get_container_argv (reread));
  g_assert_cmpstrv (_srt_emulator_get_main_argv (emulator),
                    _srt_emulator_get_main_argv (reread));
  g_assert_null (_srt_emulator_get_server_argv (reread));

  arch_quarks = _srt_emulator_get_emulated_architectures (reread, &n);
  g_assert_cmpuint (n, ==, 3);

  arch_quarks = _srt_emulator_get_required_architectures (reread, &n);
  g_assert_cmpuint (n, ==, 0);

  libraries = _srt_emulator_get_required_libraries (reread);
  g_assert_nonnull (libraries);
  g_assert_null (libraries[0]);

  overlay = _srt_emulator_get_environment (reread);
  g_assert_nonnull (overlay);
  g_assert_nonnull (overlay->values);
  g_assert_cmpuint (g_hash_table_size (overlay->values), ==, 0);

  overlay = _srt_emulator_get_container_environment (reread);
  g_assert_nonnull (overlay);
  g_assert_nonnull (overlay->values);
  g_assert_cmpuint (g_hash_table_size (overlay->values), ==, 0);

  /* An emulator with no server_argv doesn't start a server */
  ok = _srt_emulator_server_maybe_start (emulator,
                                         NULL,
                                         &server,
                                         &f->error);
  g_assert_no_error (f->error);
  g_assert_true (ok);
  g_assert_null (server);
}

static void
test_invalid (Fixture *f,
              gconstpointer context)
{
  static const struct
  {
    const char *label;
    const char *input;
  } tests[] =
  {
    { "not valid JSON",
      "[}\n" },
    { "not an object",
      "[]\n" },
    { "no emulator_v0 group",
      "{}\n" },
    { "no argv",
      ("{ \"emulator_v0\": {\n"
       "\"emulated_architectures\": [\"x86_64-linux-gnu\", \"i386-linux-gnu\"]"
       "}}\n") },
    { "argv neither value nor array",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": {},\n"
       "\"emulated_architectures\": [\"x86_64-linux-gnu\", \"i386-linux-gnu\"]"
       "}}\n") },
    { "argv value not a string",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": 2.0,\n"
       "\"emulated_architectures\": [\"x86_64-linux-gnu\", \"i386-linux-gnu\"]"
       "}}\n") },
    { "empty argv",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": \"\",\n"
       "\"emulated_architectures\": [\"x86_64-linux-gnu\", \"i386-linux-gnu\"]"
       "}}\n") },
    { "empty argv array",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": [],\n"
       "\"emulated_architectures\": [\"x86_64-linux-gnu\", \"i386-linux-gnu\"]"
       "}}\n") },
    { "empty server_argv array",
      ("{ \"emulator_v0\": {\n"
       "\"server_argv\": [],\n"
       "\"emulated_architectures\": [\"x86_64-linux-gnu\", \"i386-linux-gnu\"]"
       "}}\n") },
    { "non-string in argv",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": [\"/bin/true\", null],\n"
       "\"emulated_architectures\": [\"x86_64-linux-gnu\", \"i386-linux-gnu\"]"
       "}}\n") },
    { "no emulated archs",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": [\"/bin/true\"]"
       "}}\n") },
    { "empty emulated archs",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": \"/bin/true\",\n"
       "\"emulated_architectures\": []"
       "}}\n") },
    { "emulated archs not an array",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": \"/bin/true\",\n"
       "\"emulated_architectures\": true"
       "}}\n") },
    { "invalid emulated arch",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": \"/bin/true\",\n"
       "\"emulated_architectures\": [\"potato-bird\", \"glados\"]"
       "}}\n") },
    { "non-string emulated arch",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": \"/bin/true\",\n"
       "\"emulated_architectures\": [null]"
       "}}\n") },
    { "non-value emulated arch",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": \"/bin/true\",\n"
       "\"emulated_architectures\": [{}]"
       "}}\n") },
    { "required archs not an array",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": \"/bin/true\",\n"
       "\"emulated_architectures\": [\"x86_64-linux-gnu\", \"i386-linux-gnu\"],\n"
       "\"required_architectures\": true"
       "}}\n") },
    { "invalid required arch",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": \"/bin/true\",\n"
       "\"emulated_architectures\": [\"x86_64-linux-gnu\", \"i386-linux-gnu\"],\n"
       "\"required_architectures\": [\"glados\"]"
       "}}\n") },
    { "non-value required arch",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": \"/bin/true\",\n"
       "\"emulated_architectures\": [\"x86_64-linux-gnu\", \"i386-linux-gnu\"],\n"
       "\"required_architectures\": [{}]"
       "}}\n") },
    { "non-string required arch",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": \"/bin/true\",\n"
       "\"emulated_architectures\": [\"x86_64-linux-gnu\", \"i386-linux-gnu\"],\n"
       "\"required_architectures\": [null]"
       "}}\n") },
    { "non-array required libraries",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": \"/bin/true\",\n"
       "\"emulated_architectures\": [\"x86_64-linux-gnu\", \"i386-linux-gnu\"],\n"
       "\"required_libraries\": true"
       "}}\n") },
    { "non-value required library",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": \"/bin/true\",\n"
       "\"emulated_architectures\": [\"x86_64-linux-gnu\", \"i386-linux-gnu\"],\n"
       "\"required_libraries\": [[]]"
       "}}\n") },
    { "non-string required library",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": \"/bin/true\",\n"
       "\"emulated_architectures\": [\"x86_64-linux-gnu\", \"i386-linux-gnu\"],\n"
       "\"required_libraries\": [null]"
       "}}\n") },
    { "PATH search for argv not allowed at the moment",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": \"true\",\n"
       "\"emulated_architectures\": [\"x86_64-linux-gnu\", \"i386-linux-gnu\"]"
       "}}\n") },
    { "non-object environment",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": \"/bin/true\",\n"
       "\"emulated_architectures\": [\"x86_64-linux-gnu\", \"i386-linux-gnu\"],\n"
       "\"environment\": [\"DEBUG=1\"]\n"
       "}}\n") },
    { "non-value in environment",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": \"/bin/true\",\n"
       "\"emulated_architectures\": [\"x86_64-linux-gnu\", \"i386-linux-gnu\"],\n"
       "\"environment\": {\"DEBUG\": []}\n"
       "}}\n") },
    { "non-string value in environment",
      ("{ \"emulator_v0\": {\n"
       "\"argv\": \"/bin/true\",\n"
       "\"emulated_architectures\": [\"x86_64-linux-gnu\", \"i386-linux-gnu\"],\n"
       "\"environment\": {\"DEBUG\": true}\n"
       "}}\n") },
  };
  g_auto(GLnxTmpDir) tmpdir = { .initialized = FALSE };
  g_autoptr(SrtEmulator) emulator = NULL;
  g_autofree char *path = NULL;

  glnx_mkdtemp ("test-XXXXXX", 0700, &tmpdir, &f->error);
  g_assert_no_error (f->error);
  path = g_build_filename (tmpdir.path, "emu.json", NULL);

  g_test_message ("/nonexistent...");
  emulator = _srt_emulator_new_from_manifest ("/nonexistent", &f->error);
  g_assert_nonnull (f->error);
  g_test_message ("/nonexistent -> %s %d %s",
                  g_quark_to_string (f->error->domain),
                  f->error->code,
                  f->error->message);
  g_assert_null (emulator);
  g_clear_error (&f->error);

  for (size_t i = 0; i < G_N_ELEMENTS (tests); i++)
    {
      g_test_message ("%s...", tests[i].label);
      g_file_set_contents (path, tests[i].input, -1, &f->error);
      g_assert_no_error (f->error);
      emulator = _srt_emulator_new_from_manifest (path, &f->error);
      g_assert_nonnull (f->error);
      g_test_message ("%s -> %s %d %s",
                      tests[i].label,
                      g_quark_to_string (f->error->domain),
                      f->error->code,
                      f->error->message);
      g_assert_null (emulator);
      g_clear_error (&f->error);
    }
}

/*
 * Exercise the absence of an emulator
 */
static void
test_none (Fixture *f,
           gconstpointer context)
{
  g_autoptr(SrtEmulatorServer) server = NULL;
  gboolean ok;

  /* A NULL emulator certainly doesn't need a server */
  ok = _srt_emulator_server_maybe_start (NULL, NULL, &server, &f->error);
  g_assert_no_error (f->error);
  g_assert_true (ok);
  g_assert_null (server);
}

/*
 * Exercise an emulator manifest with emulator and server that don't exist
 */
static void
test_nonexistent (Fixture *f,
                  gconstpointer context)
{
  g_autoptr(SrtEmulator) emulator = NULL;
  g_autoptr(SrtEmulatorServer) server = NULL;
  gboolean ok;

  emulator = _srt_emulator_new_from_manifest (f->nonexistent_programs_json,
                                              &f->error);
  g_assert_no_error (f->error);
  g_assert_nonnull (emulator);
  dump_emulator (f->qemu_json, emulator);

  ok = _srt_emulator_server_maybe_start (emulator,
                                         NULL,
                                         &server,
                                         &f->error);
  g_assert_nonnull (f->error);
  g_test_message ("Starting nonexistent server -> %s #%d %s",
                  g_quark_to_string (f->error->domain),
                  f->error->code,
                  f->error->message);
  g_assert_false (ok);
}

/*
 * Exercise a maximal emulator manifest with a relative path
 */
static void
test_relative (Fixture *f,
               gconstpointer context)
{
  g_autoptr(SrtEmulator) emulator = NULL;
  g_autoptr(SrtEmulator) modified = NULL;
  g_autoptr(SrtEmulator) reread = NULL;
  const GQuark *arch_quarks;
  size_t n;
  const char * const expected_args[] = { "--", NULL };
  const char * const expected_libraries[] =
    {
      "libc.so.6",
      "libstdc++.so.6",
      "libm.so.6",
      "libgcc_s.so.1",
      NULL
    };
  const char * const * argv;
  const SrtEnvOverlay *overlay;
  g_autofree char *manifest_realpath = NULL;
  g_auto(GLnxTmpDir) tmpdir = { .initialized = FALSE };
  g_autofree char *write_path = NULL;
  gboolean ok;

  manifest_realpath = realpath (f->mock_json, NULL);
  emulator = _srt_emulator_new_from_manifest (f->mock_json, &f->error);
  g_assert_no_error (f->error);
  g_assert_nonnull (emulator);
  dump_emulator (f->qemu_json, emulator);

    {
      g_autofree char *expected_path = NULL;
      g_autofree char *expected_realpath = NULL;
      g_autofree char *actual_realpath = NULL;

      argv = _srt_emulator_get_argv (emulator);
      g_assert_nonnull (argv);
      g_assert_nonnull (argv[0]);
      g_assert_cmpstrv (&argv[1], expected_args);
      actual_realpath = realpath (argv[0], NULL);
      expected_path = g_test_build_filename (G_TEST_DIST, "mock-emulator.sh", NULL);
      expected_realpath = realpath (expected_path, NULL);
      g_assert_cmpstr (expected_realpath, ==, actual_realpath);
      g_clear_pointer (&actual_realpath, g_free);

      argv = _srt_emulator_get_container_argv (emulator);
      g_assert_nonnull (argv);
      g_assert_nonnull (argv[0]);
      actual_realpath = realpath (argv[0], NULL);
      g_assert_cmpstr (expected_realpath, ==, actual_realpath);
      g_assert_cmpstr (argv[1], ==, "--in-container");
      g_assert_cmpstrv (&argv[2], expected_args);
      g_clear_pointer (&actual_realpath, g_free);

      argv = _srt_emulator_get_main_argv (emulator);
      g_assert_nonnull (argv);
      g_assert_nonnull (argv[0]);
      actual_realpath = realpath (argv[0], NULL);
      g_assert_cmpstr (expected_realpath, ==, actual_realpath);
      g_assert_cmpstr (argv[1], ==, "--main-game");
      g_assert_cmpstrv (&argv[2], expected_args);
    }

    {
      g_autofree char *expected_path = NULL;
      g_autofree char *expected_realpath = NULL;
      g_autofree char *actual_realpath = NULL;

      argv = _srt_emulator_get_server_argv (emulator);
      g_assert_nonnull (argv);
      g_assert_nonnull (argv[0]);
      actual_realpath = realpath (argv[0], NULL);
      expected_path = g_test_build_filename (G_TEST_DIST,
                                             "mock-emulator-server.sh",
                                             NULL);
      expected_realpath = realpath (expected_path, NULL);
      g_assert_cmpstr (expected_realpath, ==, actual_realpath);
      g_assert_cmpstr (argv[1], ==, "--argument");
      g_assert_cmpstr (argv[2], ==, NULL);
    }

  arch_quarks = _srt_emulator_get_emulated_architectures (emulator, &n);
  g_assert_cmpuint (n, ==, 1);
  g_assert_cmpstr (g_quark_to_string (arch_quarks[0]), ==, "mock-emulated");
  g_assert_cmpuint (arch_quarks[1], ==, SRT_ARCHITECTURE_QUARK_NONE);

  g_assert_cmpstrv (_srt_emulator_get_required_libraries (emulator),
                    expected_libraries);
  g_assert_cmpstr (_srt_emulator_get_manifest (emulator), ==, manifest_realpath);

  arch_quarks = _srt_emulator_get_required_architectures (emulator, &n);
  g_assert_cmpuint (n, ==, 2);
  g_assert_cmpstr (g_quark_to_string (arch_quarks[0]), ==, SRT_ABI_X86_64);
  g_assert_cmpstr (g_quark_to_string (arch_quarks[1]), ==, SRT_ABI_I386);
  g_assert_cmpuint (arch_quarks[2], ==, SRT_ARCHITECTURE_QUARK_NONE);

  overlay = _srt_emulator_get_environment (emulator);
  g_assert_nonnull (overlay);
  g_assert_nonnull (overlay->values);
  g_assert_cmpstr (_srt_env_overlay_get (overlay, "SET"), ==, "set");
  g_assert_cmpstr (_srt_env_overlay_get (overlay, "UNSET"), ==, NULL);
  g_assert_true (_srt_env_overlay_contains (overlay, "UNSET"));
  g_assert_cmpstr (_srt_env_overlay_get (overlay, "PRECEDENCE"), ==, "environment");
  g_assert_false (_srt_env_overlay_contains (overlay, "set_inside_slr"));
  g_assert_false (_srt_env_overlay_contains (overlay, "unset_inside_slr"));

  overlay = _srt_emulator_get_container_environment (emulator);
  g_assert_nonnull (overlay);
  g_assert_nonnull (overlay->values);
  g_assert_cmpstr (_srt_env_overlay_get (overlay, "set_inside_slr"), ==, "hello");
  g_assert_cmpstr (_srt_env_overlay_get (overlay, "unset_inside_slr"), ==, NULL);
  g_assert_true (_srt_env_overlay_contains (overlay, "unset_inside_slr"));
  g_assert_cmpstr (_srt_env_overlay_get (overlay, "PRECEDENCE"), ==,
                   "container_environment");
  g_assert_false (_srt_env_overlay_contains (overlay, "SET"));
  g_assert_false (_srt_env_overlay_contains (overlay, "UNSET"));

  modified = _srt_emulator_new_for_container (emulator,
                                              "/run/host/bin/false",
                                              "/run/host/bin/game");
  dump_emulator ("modified", modified);

  argv = _srt_emulator_get_argv (modified);
  g_assert_nonnull (argv);
  g_assert_nonnull (argv[0]);
  g_assert_cmpstr (argv[0], ==, "/run/host/bin/false");
  /* The modified emulator is for use inside the container, so we copied
   * the original container_argv to the new argv. */
  g_assert_cmpstr (argv[1], ==, "--in-container");
  g_assert_cmpstrv (&argv[2], expected_args);

  argv = _srt_emulator_get_container_argv (modified);
  g_assert_nonnull (argv);
  g_assert_nonnull (argv[0]);
  g_assert_cmpstr (argv[0], ==, "/run/host/bin/false");
  g_assert_cmpstr (argv[1], ==, "--in-container");
  g_assert_cmpstrv (&argv[2], expected_args);

  argv = _srt_emulator_get_main_argv (modified);
  g_assert_nonnull (argv);
  g_assert_nonnull (argv[0]);
  g_assert_cmpstr (argv[0], ==, "/run/host/bin/game");
  g_assert_cmpstr (argv[1], ==, "--main-game");
  g_assert_cmpstrv (&argv[2], expected_args);

  argv = _srt_emulator_get_server_argv (modified);
  g_assert_nonnull (argv);
  g_assert_cmpstrv (argv, _srt_emulator_get_server_argv (emulator));

  arch_quarks = _srt_emulator_get_emulated_architectures (modified, &n);
  g_assert_cmpuint (n, ==, 1);
  g_assert_cmpstr (g_quark_to_string (arch_quarks[0]), ==, "mock-emulated");
  g_assert_cmpuint (arch_quarks[1], ==, SRT_ARCHITECTURE_QUARK_NONE);

  arch_quarks = _srt_emulator_get_required_architectures (modified, &n);
  g_assert_cmpuint (n, ==, 2);
  g_assert_cmpstr (g_quark_to_string (arch_quarks[0]), ==, SRT_ABI_X86_64);
  g_assert_cmpstr (g_quark_to_string (arch_quarks[1]), ==, SRT_ABI_I386);
  g_assert_cmpuint (arch_quarks[2], ==, SRT_ARCHITECTURE_QUARK_NONE);

  g_assert_cmpstrv (_srt_emulator_get_required_libraries (modified),
                    expected_libraries);
  g_assert_cmpstr (_srt_emulator_get_manifest (modified), ==, NULL);

  /* The modified emulator is for use inside the container, so we copied
   * the original container_environment to the new environment. */
  overlay = _srt_emulator_get_environment (modified);
  g_assert_nonnull (overlay);
  g_assert_nonnull (overlay->values);
  g_assert_cmpstr (_srt_env_overlay_get (overlay, "SET"), ==, "set");
  g_assert_cmpstr (_srt_env_overlay_get (overlay, "UNSET"), ==, NULL);
  g_assert_cmpstr (_srt_env_overlay_get (overlay, "set_inside_slr"), ==, "hello");
  g_assert_cmpstr (_srt_env_overlay_get (overlay, "unset_inside_slr"), ==, NULL);
  g_assert_true (_srt_env_overlay_contains (overlay, "unset_inside_slr"));
  g_assert_cmpstr (_srt_env_overlay_get (overlay, "PRECEDENCE"), ==,
                   "container_environment");

  /* Because the environment variables that were originally for the container
   * were copied to the basic set, there's no need for the additional
   * variables for inside the container to indicate any difference. */
  overlay = _srt_emulator_get_container_environment (modified);
  g_assert_nonnull (overlay);
  g_assert_nonnull (overlay->values);
  g_assert_cmpuint (g_hash_table_size (overlay->values), ==, 0);

    {
      g_autofree char *content = _srt_emulator_serialize_manifest (modified);

      g_assert_nonnull (content);
      g_test_message ("serialized: %s", content);
    }

  glnx_mkdtemp ("test-XXXXXX", 0700, &tmpdir, &f->error);
  g_assert_no_error (f->error);
  write_path = g_build_filename (tmpdir.path, "emu.json", NULL);

  ok = _srt_emulator_write_manifest (modified, write_path, &f->error);
  g_assert_no_error (f->error);
  g_assert_true (ok);

  reread = _srt_emulator_new_from_manifest (write_path, &f->error);
  g_assert_no_error (f->error);
  g_assert_nonnull (reread);
  dump_emulator ("read back from temp file", reread);
  g_assert_cmpstrv (_srt_emulator_get_argv (modified),
                    _srt_emulator_get_argv (reread));
  g_assert_cmpstrv (_srt_emulator_get_container_argv (modified),
                    _srt_emulator_get_container_argv (reread));
  g_assert_cmpstrv (_srt_emulator_get_main_argv (modified),
                    _srt_emulator_get_main_argv (reread));
  g_assert_cmpstrv (_srt_emulator_get_server_argv (modified),
                    _srt_emulator_get_server_argv (reread));

  arch_quarks = _srt_emulator_get_emulated_architectures (reread, &n);
  g_assert_cmpuint (n, ==, 1);
  g_assert_cmpstr (g_quark_to_string (arch_quarks[0]), ==, "mock-emulated");
  g_assert_cmpuint (arch_quarks[1], ==, SRT_ARCHITECTURE_QUARK_NONE);

  arch_quarks = _srt_emulator_get_required_architectures (reread, &n);
  g_assert_cmpuint (n, ==, 2);
  g_assert_cmpstr (g_quark_to_string (arch_quarks[0]), ==, SRT_ABI_X86_64);
  g_assert_cmpstr (g_quark_to_string (arch_quarks[1]), ==, SRT_ABI_I386);
  g_assert_cmpuint (arch_quarks[2], ==, SRT_ARCHITECTURE_QUARK_NONE);

  g_assert_cmpstrv (_srt_emulator_get_required_libraries (reread),
                    expected_libraries);
  g_assert_cmpstr (_srt_emulator_get_manifest (modified), ==, NULL);

    {
      g_autoptr(GTimer) timer = NULL;
      g_auto(GStrv) envp = NULL;
      g_autoptr(SrtEmulatorServer) server = NULL;
      glnx_autofd int exit_fd = -1;
      g_autofree char *flag = NULL;

      flag = g_build_filename (tmpdir.path, "server-flag", NULL);

      g_assert_false (g_file_test (flag, G_FILE_TEST_EXISTS));

      envp = g_get_environ ();
      envp = g_environ_setenv (envp, "MOCK_EMULATOR_SERVER_STATE",
                               tmpdir.path, TRUE);

      ok = _srt_emulator_server_maybe_start (emulator,
                                             _srt_const_strv (envp),
                                             &server,
                                             &f->error);
      g_assert_no_error (f->error);
      g_assert_true (ok);
      g_assert_true (SRT_IS_EMULATOR_SERVER (server));

      ok = _srt_emulator_server_wait_for_ready (server, &f->error);
      g_assert_no_error (f->error);
      g_assert_true (ok);
      /* After the server is ready, it creates this directory. */
      g_assert_true (g_file_test (flag, G_FILE_TEST_IS_DIR));

      exit_fd = _srt_emulator_server_steal_exit_fd (server);
      g_assert_cmpint (exit_fd, >=, 0);

      g_assert_true (g_file_test (flag, G_FILE_TEST_IS_DIR));
      g_clear_fd (&exit_fd, &f->error);
      g_assert_no_error (f->error);

      /* Poll for up to 10 seconds until the server cleans up its
       * flag directory and exits */
      timer = g_timer_new ();

      while (g_timer_elapsed (timer, NULL) < 10.0)
        {
          if (!g_file_test (flag, G_FILE_TEST_EXISTS))
            break;

          /* Sleep 10ms to avoid busy-looping */
          g_usleep (10 * 1000);
        }

      g_assert_false (g_file_test (flag, G_FILE_TEST_EXISTS));

      exit_fd = _srt_emulator_server_steal_exit_fd (server);
      g_assert_cmpint (exit_fd, <, 0);
    }
}

/*
 * Exercise a server starting but failing to become ready
 */
static void
test_server_not_ready (Fixture *f,
                       gconstpointer context)
{
  g_autoptr(SrtEmulator) emulator = NULL;
  g_autoptr(SrtEmulatorServer) server = NULL;
  g_auto(GStrv) envp = NULL;
  gboolean ok;

  emulator = _srt_emulator_new_from_manifest (f->mock_json, &f->error);
  g_assert_no_error (f->error);
  g_assert_nonnull (emulator);
  dump_emulator (f->qemu_json, emulator);

  envp = g_get_environ ();
  envp = g_environ_setenv (envp, "MOCK_EMULATOR_SERVER_STATE",
                           g_test_get_filename (G_TEST_DIST, "nonexistent", NULL),
                           TRUE);

  ok = _srt_emulator_server_maybe_start (emulator,
                                         _srt_const_strv (envp),
                                         &server,
                                         &f->error);
  g_assert_no_error (f->error);
  g_assert_true (ok);
  g_assert_true (SRT_IS_EMULATOR_SERVER (server));

  /* It can't create its flag file, so the output will not end with the
   * READY=1 message, and waiting for it to be ready will fail. */
  ok = _srt_emulator_server_wait_for_ready (server, &f->error);
  g_assert_nonnull (f->error);
  g_test_message ("Cannot become ready -> %s #%d %s",
                  g_quark_to_string (f->error->domain),
                  f->error->code,
                  f->error->message);
  g_assert_false (ok);
}

int
main (int argc,
      char **argv)
{
  _srt_setenv_disable_gio_modules ();
  _srt_tests_init (&argc, &argv, NULL);

  g_test_add ("/emulator/basic", Fixture, NULL,
              setup, test_basic, teardown);
  g_test_add ("/emulator/invalid", Fixture, NULL,
              setup, test_invalid, teardown);
  g_test_add ("/emulator/none", Fixture, NULL,
              setup, test_none, teardown);
  g_test_add ("/emulator/nonexistent", Fixture, NULL,
              setup, test_nonexistent, teardown);
  g_test_add ("/emulator/relative", Fixture, NULL,
              setup, test_relative, teardown);
  g_test_add ("/emulator/server-not-ready", Fixture, NULL,
              setup, test_server_not_ready, teardown);

  return g_test_run ();
}
