/*
 * Copyright © 2019-2023 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#include <steam-runtime-tools/steam-runtime-tools.h>
#include "steam-runtime-tools/architecture-internal.h"
#include "steam-runtime-tools/elf-utils-internal.h"
#include "steam-runtime-tools/utils-internal.h"

#include <gelf.h>
#include <libelf.h>

#include <glib.h>

#include "test-utils.h"

typedef struct
{
  TestsOpenFdSet old_fds;
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

  f->old_fds = tests_check_fd_leaks_enter ();
}

static void
teardown (Fixture *f,
          gconstpointer context)
{
  G_GNUC_UNUSED const Config *config = context;

  tests_check_fd_leaks_leave (f->old_fds);
}

static void
dump_strv (const char *title,
           const char * const *items)
{
  size_t i;

  if (items == NULL)
    {
      g_test_message ("\t%s: (none)", title);
      return;
    }

  g_test_message ("\t%s: %zu item(s)", title, _srt_strv_length (items));

  for (i = 0; items[i] != NULL; i++)
    g_test_message ("\t\t\"%s\"", items[i]);

  g_test_message ("\t\t.");
}

static void
dump_architecture (const char *label,
                   const SrtKnownArchitecture *arch)
{
  const char *description;

  g_test_message ("%s: %s",
                  label ?: "Known architecture",
                  arch->multiarch_tuple);
  g_test_message ("\tld.so(8): %s",
                  arch->interoperable_runtime_linker ?: "(unknown)");
  g_test_message ("\tIn OpenXR vocabulary: %s",
                  arch->openxr_1_architecture ?: "(none)");

  switch (arch->machine_type)
    {
      case SRT_MACHINE_TYPE_386:
        description = "386";
        break;
      case SRT_MACHINE_TYPE_X86_64:
        description = "X86_64";
        break;
      case SRT_MACHINE_TYPE_AARCH64:
        description = "AARCH64";
        break;
      default:
        description = "(unknown)";
    }

  g_test_message ("\tELF machine type: 0x%x: %s",
                  arch->machine_type, description);

  switch (arch->elf_class)
    {
      case ELFCLASS64:
        description = "64-bit";
        break;
      case ELFCLASS32:
        description = "32-bit";
        break;
      default:
        description = "(unknown)";
    }

  g_test_message ("\tELF class: 0x%x: %s", arch->elf_class, description);

  switch (arch->elf_encoding)
    {
      case ELFDATA2LSB:
        description = "little-endian two's complement";
        break;
      case ELFDATA2MSB:
        description = "big-endian two's complement";
        break;
      default:
        description = "(unknown)";
    }

  g_test_message ("\tELF encoding: 0x%x: %s", arch->elf_encoding, description);

  g_test_message ("\tsizeof(void *): %u bytes", arch->sizeof_pointer);

  g_test_message ("\tSteam gameoverlayrenderer.so directory: %s",
                  arch->steam_gameoverlayrenderer_dir ?: "(unknown/none)");

  dump_strv ("Multilib suffixes", arch->multilib_suffixes);
  dump_strv ("Extra ld.so.cache filenames", arch->extra_ld_so_caches);
  dump_strv ("Extra ld.so.conf filenames", arch->extra_ld_so_confs);
  dump_strv ("libdl ${PLATFORM} can expand to",
             arch->libdl_platform_expansions);
}

static void
test_architecture_array (Fixture *f,
                         gconstpointer context)
{
  g_autoptr(GArray) arr = NULL;
  g_autoptr(GArray) none = NULL;
  GQuark inputs[3];
  const GQuark *contents;
  size_t n;

  inputs[0] = g_quark_from_static_string (SRT_ABI_X86_64);
  inputs[1] = g_quark_from_static_string (SRT_ABI_I386);
  inputs[2] = g_quark_from_static_string (SRT_ABI_AARCH64);

  none = _srt_architecture_array_new ();
  g_assert_false (_srt_architecture_array_has (none, inputs[0]));
  g_assert_false (_srt_architecture_array_has (none, inputs[1]));
  g_assert_false (_srt_architecture_array_has (none, inputs[2]));

  contents = _srt_architecture_array_peek_data (none, &n);
  g_assert_nonnull (contents);
  g_assert_cmpuint (n, ==, 0);
  g_assert_cmpuint (contents[0], ==, SRT_ARCHITECTURE_QUARK_NONE);

  arr = _srt_architecture_array_new_from_quarks (inputs, 2);
  g_assert_true (_srt_architecture_array_has (arr, inputs[0]));
  g_assert_true (_srt_architecture_array_has (arr, inputs[1]));
  /* It doesn't read beyond the given @n */
  g_assert_false (_srt_architecture_array_has (arr, inputs[2]));

  contents = _srt_architecture_array_peek_data (arr, &n);
  g_assert_nonnull (contents);
  g_assert_cmpuint (n, ==, 2);
  g_assert_cmpstr (g_quark_to_string (contents[0]), ==, SRT_ABI_X86_64);
  g_assert_cmpstr (g_quark_to_string (contents[1]), ==, SRT_ABI_I386);
  g_assert_cmpuint (contents[2], ==, SRT_ARCHITECTURE_QUARK_NONE);

  /* These are already present */
  g_assert_false (_srt_architecture_array_add (arr, inputs[0]));
  g_assert_false (_srt_architecture_array_add (arr, inputs[1]));
  /* This wasn't present before, but it is after this call */
  g_assert_true (_srt_architecture_array_add (arr, inputs[2]));

  contents = _srt_architecture_array_peek_data (arr, NULL);
  g_assert_nonnull (contents);
  g_assert_cmpstr (g_quark_to_string (contents[0]), ==, SRT_ABI_X86_64);
  g_assert_cmpstr (g_quark_to_string (contents[1]), ==, SRT_ABI_I386);
  g_assert_cmpstr (g_quark_to_string (contents[2]), ==, SRT_ABI_AARCH64);
  g_assert_cmpuint (contents[3], ==, SRT_ARCHITECTURE_QUARK_NONE);

    {
      g_autofree GQuark *copy = NULL;

      copy = _srt_architecture_array_copy_data (arr, &n);
      g_assert_cmpuint (n, ==, 3);
      g_assert_nonnull (copy);
      g_assert_cmpstr (g_quark_to_string (copy[0]), ==, SRT_ABI_X86_64);
      g_assert_cmpstr (g_quark_to_string (copy[1]), ==, SRT_ABI_I386);
      g_assert_cmpstr (g_quark_to_string (copy[2]), ==, SRT_ABI_AARCH64);
      g_assert_cmpuint (copy[3], ==, SRT_ARCHITECTURE_QUARK_NONE);
    }

    {
      g_autofree GQuark *copy = NULL;

      copy = _srt_architecture_array_copy_data (none, NULL);
      g_assert_nonnull (copy);
      g_assert_cmpuint (copy[0], ==, SRT_ARCHITECTURE_QUARK_NONE);
    }
}

static void
test_architecture_get_current (Fixture *f,
                               gconstpointer context)
{
  const SrtKnownArchitecture *arch = _srt_architecture_get_current ();

  dump_architecture ("Current architecture", arch);

#if defined(__x86_64__) && defined(__LP64__)
  g_assert_cmpstr (arch->multiarch_tuple, ==, SRT_ABI_X86_64);
  g_assert_cmpstr (arch->interoperable_runtime_linker,
                   ==, "/lib64/ld-linux-x86-64.so.2");
#elif defined(__i386__)
  g_assert_cmpstr (arch->multiarch_tuple, ==, SRT_ABI_I386);
  g_assert_cmpstr (arch->interoperable_runtime_linker,
                   ==, "/lib/ld-linux.so.2");
#elif defined(__aarch64__)
  g_assert_cmpstr (arch->multiarch_tuple, ==, SRT_ABI_AARCH64);
  g_assert_cmpstr (arch->interoperable_runtime_linker,
                   ==, "/lib/ld-linux-aarch64.so.1");
#endif

#if defined(_SRT_MULTIARCH)
  g_assert_cmpstr (arch->multiarch_tuple, ==, _SRT_MULTIARCH);
  g_assert_cmpuint (arch->sizeof_pointer, ==, sizeof (void *));
#endif
}

static void
test_architecture_get_by_tuple (Fixture *f,
                                gconstpointer context)
{
  const SrtKnownArchitecture *x86_64_arch;
  const SrtKnownArchitecture *i386_arch;
  const SrtKnownArchitecture *aarch64_arch;
  const SrtKnownArchitecture *arch;
  size_t i;

  arch = x86_64_arch = _srt_architecture_get_by_tuple (SRT_ABI_X86_64);
  g_assert_nonnull (x86_64_arch);
  dump_architecture ("x86_64 architecture", arch);
  g_assert_cmpstr (x86_64_arch->multiarch_tuple, ==, SRT_ABI_X86_64);
  g_assert_cmpstr (x86_64_arch->interoperable_runtime_linker, ==,
                   "/lib64/ld-linux-x86-64.so.2");
  g_assert_cmpstr (x86_64_arch->openxr_1_architecture, ==, "x86_64");

  g_assert_nonnull (arch->multilib_suffixes);

  for (i = 0; arch->multilib_suffixes[i] != NULL; i++)
    g_assert_false (g_path_is_absolute (arch->multilib_suffixes[i]));

  g_assert_true (g_strv_contains (arch->multilib_suffixes, "lib64"));
  g_assert_true (g_strv_contains (arch->multilib_suffixes, "x86_64-pc-linux-gnu/lib"));
  g_assert_false (g_strv_contains (arch->multilib_suffixes, "lib/x86_64-linux-gnu"));
  g_assert_false (g_strv_contains (arch->multilib_suffixes, "lib"));

  g_assert_nonnull (arch->extra_ld_so_caches);

  for (i = 0; arch->extra_ld_so_caches[i] != NULL; i++)
    g_assert_false (g_path_is_absolute (arch->extra_ld_so_caches[i]));

  g_assert_true (g_strv_contains (arch->extra_ld_so_caches,
                                  "ld-x86_64-pc-linux-gnu.cache"));

  g_assert_nonnull (arch->extra_ld_so_confs);

  for (i = 0; arch->extra_ld_so_confs[i] != NULL; i++)
    g_assert_false (g_path_is_absolute (arch->extra_ld_so_confs[i]));

  g_assert_true (g_strv_contains (arch->extra_ld_so_confs,
                                  "ld-x86_64-pc-linux-gnu.path"));

  g_assert_nonnull (arch->libdl_platform_expansions);
  g_assert_true (g_strv_contains (arch->libdl_platform_expansions, "xeon_phi"));
  g_assert_true (g_strv_contains (arch->libdl_platform_expansions, "haswell"));
  g_assert_true (g_strv_contains (arch->libdl_platform_expansions, "x86_64"));

  g_assert_cmpstr (arch->steam_gameoverlayrenderer_dir, ==, "ubuntu12_64");
  g_assert_cmpint (x86_64_arch->machine_type, ==, SRT_MACHINE_TYPE_X86_64);
  g_assert_cmpint (x86_64_arch->elf_class, ==, ELFCLASS64);
  g_assert_cmpint (x86_64_arch->elf_encoding, ==, ELFDATA2LSB);
  g_assert_cmpint (x86_64_arch->sizeof_pointer, ==, 8);

  arch = i386_arch = _srt_architecture_get_by_tuple (SRT_ABI_I386);
  g_assert_nonnull (i386_arch);
  dump_architecture ("i386 architecture", arch);
  g_assert_cmpstr (i386_arch->multiarch_tuple, ==, SRT_ABI_I386);
  g_assert_cmpstr (i386_arch->interoperable_runtime_linker, ==,
                   "/lib/ld-linux.so.2");
  g_assert_cmpstr (i386_arch->openxr_1_architecture, ==, "i686");
  g_assert_nonnull (arch->multilib_suffixes);

  for (i = 0; arch->multilib_suffixes[i] != NULL; i++)
    g_assert_false (g_path_is_absolute (arch->multilib_suffixes[i]));

  g_assert_true (g_strv_contains (arch->multilib_suffixes, "lib32"));
  g_assert_true (g_strv_contains (arch->multilib_suffixes, "i686-pc-linux-gnu/lib"));
  g_assert_false (g_strv_contains (arch->multilib_suffixes, "lib/i386-linux-gnu"));
  g_assert_false (g_strv_contains (arch->multilib_suffixes, "lib"));

  g_assert_nonnull (arch->extra_ld_so_caches);

  for (i = 0; arch->extra_ld_so_caches[i] != NULL; i++)
    g_assert_false (g_path_is_absolute (arch->extra_ld_so_caches[i]));

  g_assert_true (g_strv_contains (arch->extra_ld_so_caches,
                                  "ld-i686-pc-linux-gnu.cache"));

  g_assert_nonnull (arch->extra_ld_so_confs);

  for (i = 0; arch->extra_ld_so_confs[i] != NULL; i++)
    g_assert_false (g_path_is_absolute (arch->extra_ld_so_confs[i]));

  g_assert_true (g_strv_contains (arch->extra_ld_so_confs,
                                  "ld-i686-pc-linux-gnu.path"));

  g_assert_nonnull (arch->libdl_platform_expansions);
  g_assert_true (g_strv_contains (arch->libdl_platform_expansions, "i686"));
  g_assert_true (g_strv_contains (arch->libdl_platform_expansions, "i586"));
  g_assert_true (g_strv_contains (arch->libdl_platform_expansions, "i486"));
  g_assert_true (g_strv_contains (arch->libdl_platform_expansions, "i386"));

  g_assert_cmpstr (arch->steam_gameoverlayrenderer_dir, ==, "ubuntu12_32");
  g_assert_cmpint (i386_arch->machine_type, ==, SRT_MACHINE_TYPE_386);
  g_assert_cmpint (i386_arch->elf_class, ==, ELFCLASS32);
  g_assert_cmpint (i386_arch->elf_encoding, ==, ELFDATA2LSB);
  g_assert_cmpint (i386_arch->sizeof_pointer, ==, 4);

  arch = aarch64_arch = _srt_architecture_get_by_tuple (SRT_ABI_AARCH64);
  g_assert_nonnull (arch);
  dump_architecture ("aarch64 architecture", arch);
  g_assert_cmpstr (arch->multiarch_tuple, ==, SRT_ABI_AARCH64);
  g_assert_cmpstr (arch->interoperable_runtime_linker, ==,
                   "/lib/ld-linux-aarch64.so.1");
  g_assert_cmpstr (arch->openxr_1_architecture, ==, "aarch64");
  g_assert_nonnull (arch->multilib_suffixes);

  for (i = 0; arch->multilib_suffixes[i] != NULL; i++)
    g_assert_false (g_path_is_absolute (arch->multilib_suffixes[i]));

  g_assert_true (g_strv_contains (arch->multilib_suffixes, "aarch64-unknown-linux-gnueabi/lib"));
  g_assert_false (g_strv_contains (arch->multilib_suffixes, "lib/aarch64-linux-gnu"));
  g_assert_false (g_strv_contains (arch->multilib_suffixes, "lib"));

  g_assert_nonnull (arch->extra_ld_so_caches);

  for (i = 0; arch->extra_ld_so_caches[i] != NULL; i++)
    g_assert_false (g_path_is_absolute (arch->extra_ld_so_caches[i]));

  g_assert_true (g_strv_contains (arch->extra_ld_so_caches,
                                  "ld-aarch64-unknown-linux-gnueabi.cache"));

  g_assert_nonnull (arch->extra_ld_so_confs);

  for (i = 0; arch->extra_ld_so_confs[i] != NULL; i++)
    g_assert_false (g_path_is_absolute (arch->extra_ld_so_confs[i]));

  g_assert_true (g_strv_contains (arch->extra_ld_so_confs,
                                  "ld-aarch64-unknown-linux-gnueabi.path"));

  g_assert_nonnull (arch->libdl_platform_expansions);
  g_assert_true (g_strv_contains (arch->libdl_platform_expansions, "aarch64"));

  g_assert_cmpstr (arch->steam_gameoverlayrenderer_dir, ==, NULL);
  g_assert_cmpint (arch->machine_type, ==, SRT_MACHINE_TYPE_AARCH64);
  g_assert_cmpint (arch->elf_class, ==, ELFCLASS64);
  g_assert_cmpint (arch->elf_encoding, ==, ELFDATA2LSB);
  g_assert_cmpint (arch->sizeof_pointer, ==, 8);

  /* Used in unit tests */
  arch = _srt_architecture_get_by_tuple ("x86_64-mock-abi");
  g_assert_nonnull (arch);
  dump_architecture ("Mock architecture for unit tests", arch);
  g_assert_cmpstr (arch->multiarch_tuple, ==, "x86_64-mock-abi");
  g_assert_cmpstr (arch->interoperable_runtime_linker, ==, NULL);
  g_assert_cmpstr (arch->openxr_1_architecture, ==, NULL);
  g_assert_null (arch->multilib_suffixes);
  g_assert_null (arch->extra_ld_so_caches);
  g_assert_null (arch->libdl_platform_expansions);
  g_assert_cmpstr (arch->steam_gameoverlayrenderer_dir, ==, NULL);
  g_assert_cmpint (arch->machine_type, ==, SRT_MACHINE_TYPE_UNKNOWN);
  g_assert_cmpint (arch->elf_class, ==, ELFCLASSNONE);
  g_assert_cmpint (arch->sizeof_pointer, ==, 8);

#ifdef _SRT_MULTIARCH
  arch = _srt_architecture_get_by_tuple (_SRT_MULTIARCH);
  g_assert_nonnull (arch);
#if defined(__x86_64__) && defined(__LP64__)
  g_assert_true (arch == x86_64_arch);
#elif defined(__i386__)
  g_assert_true (arch == i386_arch);
#elif defined(__aarch64__)
  g_assert_true (arch == aarch64_arch);
#endif
  g_assert_cmpstr (arch->multiarch_tuple, ==, _SRT_MULTIARCH);
  g_assert_cmpint (arch->sizeof_pointer, ==, sizeof (void *));
#endif

  /* An architecture we have no knowledge of isn't found */
  arch = _srt_architecture_get_by_tuple ("potato-glados-eabi");
  g_assert_null (arch);
}

static void
dump_guessed_arch (const char *input,
                   const SrtKnownArchitecture *arch,
                   const GError *error)
{
  if (arch != NULL)
    g_test_message ("%s -> guessed %s", input, arch->multiarch_tuple);
  else
    g_test_message ("%s -> cannot guess: %s", input,
                    error != NULL ? error->message : "<no error>");
}

static void
test_architecture_guess_from_elf (Fixture *f,
                                  gconstpointer context)
{
  const SrtKnownArchitecture *arch;

    {
      g_autoptr(GError) local_error = NULL;

      arch = _srt_architecture_guess_from_elf (AT_FDCWD, "/nonexistent",
                                               &local_error);
      dump_guessed_arch ("/nonexistent", arch, local_error);
      g_assert_nonnull (local_error);
      g_assert_null (arch);
    }

  for (gsize use_fd = 0; use_fd < 2; use_fd++)
    {
      const SrtKnownArchitecture *native_architecture;
      g_autofree gchar *mock_true = NULL;
      g_autoptr(GError) local_error = NULL;
      glnx_autofd int already_open_fd = -1;

      mock_true = g_test_build_filename (G_TEST_BUILT, "mock-true", NULL);

      if (use_fd != 0)
        {
          gboolean ok;

          ok = glnx_openat_rdonly (AT_FDCWD, mock_true,
                                   TRUE, /* follow symlinks */
                                   &already_open_fd,
                                   &local_error);
          g_assert_no_error (local_error);
          g_assert_true (ok);

          arch = _srt_architecture_guess_from_elf (already_open_fd, NULL,
                                                   &local_error);
        }
      else
        {
          arch = _srt_architecture_guess_from_elf (AT_FDCWD, mock_true,
                                                   &local_error);
        }

      dump_guessed_arch ("mock-true ELF executable", arch, local_error);

      native_architecture = _srt_architecture_get_current ();
#if defined(_SRT_MULTIARCH) \
    || (defined(__x86_64__) && defined(__LP64__)) \
    || defined(__i386__) \
    || defined(__aarch64__)
      g_assert_nonnull (native_architecture);
#endif

      if (native_architecture != NULL)
        {
          if (native_architecture->elf_class != ELFCLASSNONE
              && native_architecture->elf_encoding != ELFDATANONE
              && native_architecture->machine_type != SRT_MACHINE_TYPE_UNKNOWN)
            {
              g_assert_nonnull (arch);
              g_assert_cmpstr (arch->multiarch_tuple,
                               ==, native_architecture->multiarch_tuple);
              g_assert_true (arch == native_architecture);
            }
          else
            {
#if (defined(__x86_64__) && defined(__LP64__)) \
    || defined(__i386__) \
    || defined(__aarch64__)
              g_error ("This architecture should be identifiable");
#endif
            }
        }
    }

    {
      g_autofree gchar *check_sh = NULL;
      g_autoptr(GError) local_error = NULL;

      /* A shell script's architecture can't be guessed */
      check_sh = g_test_build_filename (G_TEST_DIST, "check-sh.sh", NULL);
      arch = _srt_architecture_guess_from_elf (AT_FDCWD, check_sh,
                                               &local_error);
      dump_guessed_arch ("check-sh.sh shell script", arch, local_error);
      g_assert_nonnull (local_error);
      g_assert_null (arch);
    }
}

static void
test_architecture_guess_from_user_input (Fixture *f,
                                         gconstpointer context)
{
  const struct
  {
    const char *input;
    /* As a shorthand, "=" means the expected result equals the input */
    const char *expected;
  }
  tests[] =
  {
    { SRT_ABI_I386, "=" },
    { SRT_ABI_X86_64, "=" },
    { SRT_ABI_AARCH64, "=" },
    { "arm-linux-gnueabihf", "=" },
    { "mips-netbsd", "=" },
    { "x86_64", SRT_ABI_X86_64 },
    { "x86-64", SRT_ABI_X86_64 },
    { "X64", SRT_ABI_X86_64 },
    { "ubuntu12_64", SRT_ABI_X86_64 },
    { "i686", SRT_ABI_I386 },
    { "ubuntu12_32", SRT_ABI_I386 },
    { "i486-linux-gnu", SRT_ABI_I386 },
    { "aarch64", SRT_ABI_AARCH64 },
    { "arm64", SRT_ABI_AARCH64 },
    { "x32", "x86_64-linux-gnux32" },
    { "", NULL },
    { "lib64", NULL },
    { "linux", NULL },
    { "-fomit-instructions", NULL },
    { "$(rm -fr /)", NULL },
  };
  size_t i;

  for (i = 0; i < G_N_ELEMENTS (tests); i++)
    {
      g_autoptr(GError) local_error = NULL;
      const char *input = tests[i].input;
      const char *expected = tests[i].expected;
      GQuark output;
      const SrtKnownArchitecture *known = NULL;

      if (g_strcmp0 (expected, "=") == 0)
        expected = input;

      g_test_message ("user input: %s", input);
      output = _srt_architecture_guess_from_user_input (input, &known, &local_error);

      if (output == 0)
        g_test_message ("-> error %s", local_error->message);
      else
        g_test_message ("-> normalized to %s", g_quark_to_string (output));

      if (expected == NULL)
        {
          g_assert_nonnull (local_error);
          g_assert_cmpuint (output, ==, 0);
          g_assert_null (known);
        }
      else
        {
          g_assert_no_error (local_error);
          g_assert_cmpstr (g_quark_to_string (output), ==, expected);
          /* possibly null */
          g_assert_true (known == _srt_architecture_get_by_tuple (expected));
        }
    }
}

static void
test_architecture_libdirs (Fixture *f,
                           gconstpointer context)
{
  static const struct
  {
    const char *tuple;
    /* Length is arbitrary, extend as needed */
    const char * const expected[10];
  } tests[] =
  {
    {
      SRT_ABI_I386,
      {
        "/lib/" SRT_ABI_I386,
        "/usr/lib/" SRT_ABI_I386,
        "NONSTANDARD:/usr/lib/" SRT_ABI_I386 "/mesa",
        "/i686-pc-linux-gnu/lib",
        "/usr/i686-pc-linux-gnu/lib",
        "/lib32",
        "/usr/lib32",
        "/lib",
        "/usr/lib",
        NULL
      },
    },
    {
      SRT_ABI_X86_64,
      {
        "/lib/" SRT_ABI_X86_64,
        "/usr/lib/" SRT_ABI_X86_64,
        "NONSTANDARD:/usr/lib/" SRT_ABI_X86_64 "/mesa",
        "/x86_64-pc-linux-gnu/lib",
        "/usr/x86_64-pc-linux-gnu/lib",
        "/lib64",
        "/usr/lib64",
        "/lib",
        "/usr/lib",
        NULL
      },
    },
    {
      SRT_ABI_AARCH64,
      {
        "/lib/" SRT_ABI_AARCH64,
        "/usr/lib/" SRT_ABI_AARCH64,
        "NONSTANDARD:/usr/lib/" SRT_ABI_AARCH64 "/mesa",
        "/aarch64-unknown-linux-gnueabi/lib",
        "/usr/aarch64-unknown-linux-gnueabi/lib",
        "/lib",
        "/usr/lib",
        NULL
      },
    },
    {
      /* An architecture for which we have no hard-coded knowledge */
      "potato-glados-eabi",
      {
        "/lib/potato-glados-eabi",
        "/usr/lib/potato-glados-eabi",
        "NONSTANDARD:/usr/lib/potato-glados-eabi/mesa",
        "/lib",
        "/usr/lib",
        NULL
      },
    },
    {
      NULL,
      {
        "/lib",
        "/usr/lib",
        NULL
      },
    },
  };
  gsize i;
  gsize with_nonstandard;

  for (with_nonstandard = 0; with_nonstandard < 2; with_nonstandard++)
    {
      SrtLibdirsFlags flags = SRT_LIBDIRS_FLAGS_NONE;

      if (with_nonstandard)
        flags |= SRT_LIBDIRS_FLAGS_INCLUDE_NON_STANDARD;

      for (i = 0; i < G_N_ELEMENTS (tests); i++)
        {
          g_autoptr(GPtrArray) expected = g_ptr_array_new ();
          g_autoptr(GPtrArray) actual = NULL;
          const SrtKnownArchitecture *known = NULL;
          const char *tuple = tests[i].tuple;
          gsize j;

          g_test_message ("test: %s, flags: 0x%x", tuple ?: "(null)", flags);

          for (j = 0; j < G_N_ELEMENTS (tests[i].expected); j++)
            {
              const char *item = tests[i].expected[j];

              if (item == NULL)
                break;

              if (g_str_has_prefix (item, "NONSTANDARD:"))
                {
                  if (flags & SRT_LIBDIRS_FLAGS_INCLUDE_NON_STANDARD)
                    item = item + strlen ("NONSTANDARD:");
                  else
                    continue;
                }

              g_ptr_array_add (expected, (gchar *) item);
            }

          if (tuple != NULL)
            known = _srt_architecture_get_by_tuple (tuple);

          actual = _srt_known_architecture_get_libdirs (tuple, known, flags);

          for (j = 0; j < expected->len; j++)
            g_test_message ("expected[%zu]: %s",
                            j, (const char *) g_ptr_array_index (expected, j));

          for (j = 0; j < actual->len; j++)
            g_test_message ("actual[%zu]: %s",
                            j, (const char *) g_ptr_array_index (actual, j));

          g_ptr_array_add (expected, NULL);
          g_ptr_array_add (actual, NULL);
          g_assert_cmpstrv ((GStrv) actual->pdata, (GStrv) expected->pdata);
        }
    }
}

static void
test_architecture_ldconfig_knows_arch (Fixture *f,
                                       gconstpointer context)
{
  const struct
  {
    const char *ldconfig;
    const char *libraries;
    gboolean expected;
  }
  tests[] =
  {
    { NULL, SRT_ABI_X86_64, FALSE },
    { SRT_ABI_X86_64, SRT_ABI_X86_64, TRUE },
    { SRT_ABI_I386, SRT_ABI_I386, TRUE },
    { SRT_ABI_X86_64, SRT_ABI_I386, TRUE },
    { SRT_ABI_I386, SRT_ABI_X86_64, TRUE },
    { SRT_ABI_AARCH64, SRT_ABI_X86_64, FALSE },
    { SRT_ABI_X86_64, SRT_ABI_AARCH64, FALSE },
  };

  for (size_t i = 0; i < G_N_ELEMENTS (tests); i++)
    {
      const SrtKnownArchitecture *known;
      gboolean res;

      if (tests[i].ldconfig != NULL)
        {
          known = _srt_architecture_get_by_tuple (tests[i].ldconfig);
          g_assert_nonnull (known);
          g_assert_cmpstr (known->multiarch_tuple, ==, tests[i].ldconfig);
        }
      else
        {
          known = NULL;
        }

      res = _srt_architecture_ldconfig_knows_architecture (known, tests[i].libraries);
      g_test_message ("%s ldconfig knows architecture %s -> %s",
                      tests[i].ldconfig ?: "unknown",
                      tests[i].libraries,
                      res ? "yes" : "no");
      g_assert_cmpint (res, ==, tests[i].expected);
    }
}

static void
test_architecture_plausible_tuple (Fixture *f,
                                   gconstpointer context)
{
  const char * const plausible[] =
  {
    SRT_ABI_I386,
    SRT_ABI_X86_64,
    SRT_ABI_AARCH64,
    "arm-linux-gnueabihf",
    "m68k-freebsd",
  };
  const char * const not[] =
  {
    "",
    "i686-linux-gnu",
    "i386-Linux-GNU",
    "arm64-linux",
    "amd64-linux",
    "x86_64",
    "lib64",
    "ubuntu12_32",
    "linux",
    "-fomit-instructions",
    "$(rm -fr /)",
  };
  size_t i;

  for (i = 0; i < G_N_ELEMENTS (plausible); i++)
    {
      g_autoptr(GError) local_error = NULL;
      gboolean ok;

      g_test_message ("architecture tuple: %s", plausible[i]);
      ok = _srt_architecture_check_plausible_tuple (plausible[i], &local_error);
      g_assert_no_error (local_error);
      g_assert_true (ok);
    }

  for (i = 0; i < G_N_ELEMENTS (not); i++)
    {
      g_autoptr(GError) local_error = NULL;

      g_test_message ("not architecture tuple: %s", not[i]);
      g_assert_false (_srt_architecture_check_plausible_tuple (not[i],
                                                               &local_error));
      g_assert_nonnull (local_error);
      g_test_message ("-> %s", local_error->message);
    }
}

static void
dump_elf_or_error (const char *input,
                   gboolean ok,
                   int fd,
                   Elf *elf,
                   GError *error)
{
  GElf_Ehdr eh;

  if (ok)
    g_test_message ("%s -> success, fd %d, Elf %s: %s",
                    input, fd,
                    elf != NULL ? "non-null" : "null",
                    error != NULL ? error->message : "<no error>");
  else
    g_test_message ("%s -> error, fd %d, Elf %s: %s",
                    input, fd,
                    elf != NULL ? "non-null" : "null",
                    error != NULL ? error->message : "<no error>");

  if (elf == NULL)
    return;

  if (gelf_getehdr (elf, &eh) != NULL)
    g_test_message ("ELF class 0x%x, data encoding 0x%x, machine type 0x%x",
                    eh.e_ident[EI_CLASS], eh.e_ident[EI_DATA], eh.e_machine);
  else
    g_test_message ("gelf_getehdr() -> %s", elf_errmsg (elf_errno ()));
}

static void
test_elf_utils_open (Fixture *f,
                     gconstpointer context)
{
    {
      g_autoptr(GError) local_error = NULL;
      g_autoptr(Elf) elf = NULL;
      glnx_autofd int fd = -1;
      gboolean ok;

      /* A file we can't open */
      ok = _srt_open_elf (AT_FDCWD, "/nonexistent", &fd, &elf, &local_error);
      dump_elf_or_error ("/nonexistent", ok, fd, elf, local_error);
      g_assert_nonnull (local_error);
      g_assert_false (ok);
      g_assert_cmpint (fd, <, 0);
      g_assert_null (elf);
    }

  for (gsize use_fd = 0; use_fd < 2; use_fd++)
    {
      const SrtKnownArchitecture *native_architecture;
      g_autofree gchar *mock_true = NULL;
      g_autoptr(GError) local_error = NULL;
      g_autoptr(Elf) elf = NULL;
      GElf_Ehdr eh;
      glnx_autofd int already_open_fd = -1;
      glnx_autofd int fd = -1;
      gboolean ok;

      mock_true = g_test_build_filename (G_TEST_BUILT, "mock-true", NULL);

      if (use_fd != 0)
        {
          ok = glnx_openat_rdonly (AT_FDCWD, mock_true,
                                   TRUE, /* follow symlinks */
                                   &already_open_fd,
                                   &local_error);
          g_assert_no_error (local_error);
          g_assert_true (ok);

          ok = _srt_open_elf (already_open_fd, NULL, &fd, &elf, &local_error);
        }
      else
        {
          ok = _srt_open_elf (AT_FDCWD, mock_true, &fd, &elf, &local_error);
        }

      dump_elf_or_error ("mock-true executable", ok, fd, elf, local_error);
      g_assert_no_error (local_error);
      g_assert_true (ok);

      if (use_fd)
        g_assert_cmpint (fd, ==, -1);
      else
        g_assert_cmpint (fd, >=, 0);

      g_assert_nonnull (elf);
      g_assert_nonnull (gelf_getehdr (elf, &eh));

      native_architecture = _srt_architecture_get_current ();
#if defined(_SRT_MULTIARCH)
      g_assert_nonnull (native_architecture);
#endif

      if (native_architecture != NULL)
        {
          if (native_architecture->elf_class != ELFCLASSNONE)
            g_assert_cmpuint (native_architecture->elf_class,
                              ==, eh.e_ident[EI_CLASS]);

          if (native_architecture->elf_encoding != ELFDATANONE)
            g_assert_cmpuint (native_architecture->elf_encoding,
                              ==, eh.e_ident[EI_DATA]);

          if (native_architecture->machine_type != SRT_MACHINE_TYPE_UNKNOWN)
            g_assert_cmpuint (native_architecture->machine_type,
                              ==, eh.e_machine);
        }
    }

    {
      g_autofree gchar *check_sh = NULL;
      g_autoptr(GError) local_error = NULL;
      g_autoptr(Elf) elf = NULL;
      glnx_autofd int fd = -1;
      gboolean ok;

      check_sh = g_test_build_filename (G_TEST_DIST, "check-sh.sh", NULL);
      ok = _srt_open_elf (AT_FDCWD, check_sh, &fd, &elf, &local_error);
      dump_elf_or_error ("check-sh.sh script", ok, fd, elf, local_error);

      /* libelf currently reports success for a non-ELF executable
       * (shell script) for some reason (?) but even if it does,
       * it shouldn't be able to parse the ELF header */
      if (ok)
        {
          GElf_Ehdr eh;

          g_assert_nonnull (elf);
          g_assert_null (gelf_getehdr (elf, &eh));
        }
      else
        {
          g_assert_nonnull (local_error);
          g_assert_null (elf);
        }
    }
}

int
main (int argc,
      char **argv)
{
  _srt_tests_init (&argc, &argv, NULL);
  g_test_add ("/architecture/array", Fixture, NULL,
              setup, test_architecture_array, teardown);
  g_test_add ("/architecture/get_by_tuple", Fixture, NULL,
              setup, test_architecture_get_by_tuple, teardown);
  g_test_add ("/architecture/get_current", Fixture, NULL,
              setup, test_architecture_get_current, teardown);
  g_test_add ("/architecture/guess_from_elf", Fixture, NULL,
              setup, test_architecture_guess_from_elf, teardown);
  g_test_add ("/architecture/guess_from_user_input", Fixture, NULL,
              setup, test_architecture_guess_from_user_input, teardown);
  g_test_add ("/architecture/ldconfig_knows_arch", Fixture, NULL,
              setup, test_architecture_ldconfig_knows_arch, teardown);
  g_test_add ("/architecture/libdirs", Fixture, NULL,
              setup, test_architecture_libdirs, teardown);
  g_test_add ("/architecture/plausible_tuple", Fixture, NULL,
              setup, test_architecture_plausible_tuple, teardown);
  g_test_add ("/elf-utils/open", Fixture, NULL,
              setup, test_elf_utils_open, teardown);

  return g_test_run ();
}
