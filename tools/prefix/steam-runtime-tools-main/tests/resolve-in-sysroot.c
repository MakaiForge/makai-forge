/*
 * Copyright © 2019-2023 Collabora Ltd.
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
#include "steam-runtime-tools/resolve-in-sysroot-internal.h"
#include "steam-runtime-tools/utils-internal.h"
#include "libglnx.h"

#include "tests/test-utils.h"

typedef struct
{
  TestsOpenFdSet old_fds;
} Fixture;

typedef struct
{
  enum { MODE_DIRECT, MODE_FDIO } mode;
} Config;

static const Config direct_config = { MODE_DIRECT };
static const Config fdio_config = { MODE_FDIO };

static void
setup (Fixture *f,
       gconstpointer context)
{
  f->old_fds = tests_check_fd_leaks_enter ();
}

static void
teardown (Fixture *f,
          gconstpointer context)
{
  tests_check_fd_leaks_leave (f->old_fds);
}

static void
check_fd_same_as_rel_path_nofollow (int fd,
                                    int dfd,
                                    const gchar *path)
{
  GStatBuf fd_buffer, path_buffer;

  if (fstat (fd, &fd_buffer) < 0)
    g_error ("fstat: %s", g_strerror (errno));

  if (fstatat (dfd, path, &path_buffer, AT_SYMLINK_NOFOLLOW) < 0)
    g_error ("fstatat %s: %s", path, g_strerror (errno));

  if (fd_buffer.st_dev != path_buffer.st_dev)
    g_error ("on different devices");

  if (fd_buffer.st_ino != path_buffer.st_ino)
    g_error ("on different inodes");
}

typedef struct
{
  const char *name;
  const char *target;
} Symlink;

typedef enum
{
  RESOLVE_ERROR_DOMAIN_NONE,
  RESOLVE_ERROR_DOMAIN_GIO,
} ResolveErrorDomain;

typedef enum
{
  RESOLVE_CALL_FLAGS_IGNORE_PATH = (1 << 0),
  RESOLVE_CALL_FLAGS_SKIP_IF_DIRECT = (1 << 1),
  RESOLVE_CALL_FLAGS_CANNOT_CHASE = (1 << 2),
  RESOLVE_CALL_FLAGS_NONE = 0
} ResolveCallFlags;

typedef struct
{
  struct
  {
    const char *path;
    SrtResolveFlags flags;
    ResolveCallFlags test_flags;
  } call;
  struct
  {
    const char *path;
    int code;
  } expect;
} ResolveTest;

static void
test_resolve_in_sysroot (Fixture *f,
                         gconstpointer context)
{
  static const char * const prepare_dirs[] =
  {
    "a/b/c/d/e",
    "a/b2/c2/d2/e2",
  };
  static const char * const prepare_files[] =
  {
    "a/b/c/file",
    "a/b/c/exe",
  };
  static const Symlink prepare_symlinks[] =
  {
    { "a/b/symlink_to_c", "c" },
    { "a/b/symlink_to_b2", "../b2" },
    { "a/b/symlink_to_c2", "../../a/b2/c2" },
    { "a/b/symlink_to_itself", "." },
    { "a/b/abs_symlink_to_run", "/run" },
    { "a/b/long_symlink_to_dev", "../../../../../../../../../../../dev" },
    { "x", "create_me" },
  };
  static const ResolveTest tests[] =
  {
    { { "a/b/c/d" }, { "a/b/c/d" } },
    { { "a/b/c/d", SRT_RESOLVE_FLAGS_RETURN_ABSOLUTE }, { "/a/b/c/d" } },
    { { "/" }, { "." } },
    { { "/", SRT_RESOLVE_FLAGS_RETURN_ABSOLUTE }, { "/" } },
    { { "a/b/c/d/" }, { "a/b/c/d" } },
    {
      { "a/b/c/d", SRT_RESOLVE_FLAGS_NONE, RESOLVE_CALL_FLAGS_IGNORE_PATH },
      { "a/b/c/d" },
    },
    { { "a/b/c/d/", SRT_RESOLVE_FLAGS_MKDIR_P }, { "a/b/c/d" } },
    {
      { "a/b/c/d", SRT_RESOLVE_FLAGS_MKDIR_P, RESOLVE_CALL_FLAGS_IGNORE_PATH },
      { "a/b/c/d" },
    },
    { { "create_me" }, { NULL, G_IO_ERROR_NOT_FOUND } },
    {
      { "create_me", SRT_RESOLVE_FLAGS_NONE, RESOLVE_CALL_FLAGS_IGNORE_PATH },
      { NULL, G_IO_ERROR_NOT_FOUND }
    },
    { { "a/b/c/d", SRT_RESOLVE_FLAGS_MKDIR_P }, { "a/b/c/d" } },
    { { "a/b/c/d", SRT_RESOLVE_FLAGS_READABLE }, { "a/b/c/d" } },
    { { "a/b/c/d", SRT_RESOLVE_FLAGS_MUST_BE_DIRECTORY }, { "a/b/c/d" } },
    { { "a/b/c/file", SRT_RESOLVE_FLAGS_MUST_BE_REGULAR }, { "a/b/c/file" } },
    {
      { "a/b/c/d", SRT_RESOLVE_FLAGS_READABLE|SRT_RESOLVE_FLAGS_MUST_BE_DIRECTORY },
      { "a/b/c/d" }
    },
    { { "a/b/c/file", SRT_RESOLVE_FLAGS_READABLE }, { "a/b/c/file" } },
    { { "a/b/c/file/" }, { NULL, G_IO_ERROR_NOT_DIRECTORY }},
    {
      { "a/b/c/file", SRT_RESOLVE_FLAGS_MUST_BE_EXECUTABLE },
      { NULL, G_IO_ERROR_FAILED }
    },
    {
      { "a/b/c/exe", SRT_RESOLVE_FLAGS_MUST_BE_EXECUTABLE },
      { "a/b/c/exe" }
    },
    {
      { "a/b/c/d", SRT_RESOLVE_FLAGS_MUST_BE_EXECUTABLE },
      { "a/b/c/d" }
    },
    {
      { "a/b/c/d", SRT_RESOLVE_FLAGS_MUST_BE_REGULAR },
      { NULL, G_IO_ERROR_NOT_REGULAR_FILE }
    },
    {
      { "a/b/c/file", SRT_RESOLVE_FLAGS_MUST_BE_DIRECTORY },
      { NULL, G_IO_ERROR_NOT_DIRECTORY }
    },
    {
      { "a/b/c/file", SRT_RESOLVE_FLAGS_MKDIR_P },
      { NULL, G_IO_ERROR_NOT_DIRECTORY }
    },
    {
      { "a/b/c/file/", SRT_RESOLVE_FLAGS_MUST_BE_DIRECTORY },
      { NULL, G_IO_ERROR_NOT_DIRECTORY }
    },
    {
      { "a/b/c/file/", SRT_RESOLVE_FLAGS_READABLE },
      { NULL, G_IO_ERROR_NOT_DIRECTORY }
    },
    {
      { "a/b/c/file", SRT_RESOLVE_FLAGS_READABLE|SRT_RESOLVE_FLAGS_MUST_BE_DIRECTORY },
      { NULL, G_IO_ERROR_NOT_DIRECTORY }
    },
    { { "a/b///////.////./././///././c/d" }, { "a/b/c/d" } },
    { { "/a/b///////.////././../b2////././c2/d2" }, { "a/b2/c2/d2" } },
    { { "a/b/c/d/e/f" }, { NULL, G_IO_ERROR_NOT_FOUND } },
    { { "a/b/c/d/e/f/", SRT_RESOLVE_FLAGS_MKDIR_P }, { "a/b/c/d/e/f" } },
    { { "a/b/c/d/e/f", SRT_RESOLVE_FLAGS_MKDIR_P }, { "a/b/c/d/e/f" } },
    {
      { "a/b/c/d/e/f/",
        SRT_RESOLVE_FLAGS_NONE,
        /* Assumes previous MKDIR_P test ran, which it won't when using
         * direct I/O */
        RESOLVE_CALL_FLAGS_SKIP_IF_DIRECT
      },
      { "a/b/c/d/e/f" }
    },
    { { "a/b/c/d/e/f", SRT_RESOLVE_FLAGS_MKDIR_P }, { "a/b/c/d/e/f" } },
    { { "a3/b3/c3" }, { NULL, G_IO_ERROR_NOT_FOUND } },
    { { "a3/b3/c3", SRT_RESOLVE_FLAGS_MKDIR_P }, { "a3/b3/c3" } },
    { { "a/b/symlink_to_c" }, { "a/b/c" } },
    { { "a/b/symlink_to_c/d" }, { "a/b/c/d" } },
    {
      { "a/b/symlink_to_c/d", SRT_RESOLVE_FLAGS_KEEP_FINAL_SYMLINK },
      { "a/b/c/d" }
    },
    {
      { "a/b/symlink_to_c/d", SRT_RESOLVE_FLAGS_REJECT_SYMLINKS },
      { NULL, G_IO_ERROR_TOO_MANY_LINKS }
    },
    { { "a/b/symlink_to_b2" }, { "a/b2" } },
    { { "a/b/symlink_to_c2" }, { "a/b2/c2" } },
    { { "a/b/abs_symlink_to_run" }, { NULL, G_IO_ERROR_NOT_FOUND } },
    {
      { "a/b/symlink_to_itself", SRT_RESOLVE_FLAGS_KEEP_FINAL_SYMLINK },
      { "a/b/symlink_to_itself" },
    },
    {
      {
        "a/b/symlink_to_itself",
        SRT_RESOLVE_FLAGS_KEEP_FINAL_SYMLINK|SRT_RESOLVE_FLAGS_READABLE,
      },
      { NULL, G_IO_ERROR_TOO_MANY_LINKS },
    },
    {
      { "a/b/abs_symlink_to_run", SRT_RESOLVE_FLAGS_KEEP_FINAL_SYMLINK },
      { "a/b/abs_symlink_to_run" }
    },
    { { "run" }, { NULL, G_IO_ERROR_NOT_FOUND } },    /* Wasn't created yet */
    { { "a/b/abs_symlink_to_run", SRT_RESOLVE_FLAGS_MKDIR_P }, { "run" } },
    { { "a/b/abs_symlink_to_run/host" }, { NULL, G_IO_ERROR_NOT_FOUND } },
    {
      { "a/b/abs_symlink_to_run/host", SRT_RESOLVE_FLAGS_MKDIR_P },
      { "run/host" }
    },
    {
      /* This is specifically about path resolution in a sysroot, and is
       * not really applicable when using the real root, where this will
       * end up pointing to the real /dev (assuming it exists). */
      {
        "a/b/long_symlink_to_dev",
        SRT_RESOLVE_FLAGS_NONE,
        RESOLVE_CALL_FLAGS_SKIP_IF_DIRECT
      },
      { NULL, G_IO_ERROR_NOT_FOUND }
    },
    {
      /* As above */
      {
        "a/b/long_symlink_to_dev/shm",
        SRT_RESOLVE_FLAGS_NONE,
        RESOLVE_CALL_FLAGS_SKIP_IF_DIRECT
      },
      { NULL, G_IO_ERROR_NOT_FOUND }
    },
    {
      /* As above */
      {
        "a/b/long_symlink_to_dev/shm",
        SRT_RESOLVE_FLAGS_MKDIR_P,
        RESOLVE_CALL_FLAGS_SKIP_IF_DIRECT
      },
      { "dev/shm" }
    },
    { { "a/b/../b2/c2/../c3", SRT_RESOLVE_FLAGS_MKDIR_P }, { "a/b2/c3" } },
    { { "x" }, { NULL, G_IO_ERROR_NOT_FOUND } },
    { { "x", SRT_RESOLVE_FLAGS_KEEP_FINAL_SYMLINK }, { "x" } },
    /* This is a bit odd: unlike mkdir -p, we create targets for dangling
     * symlinks. It's easier to do this than not, and for pressure-vessel's
     * use-case it probably even makes more sense than not.
     *
     * However, when using direct I/O we don't currently have this
     * behaviour. */
    { { "x/y" }, { NULL, G_IO_ERROR_NOT_FOUND } },
    { { "x/y", SRT_RESOLVE_FLAGS_MKDIR_P }, { "create_me/y" } },
  };
  const Config *config = context;
  g_autoptr(GError) error = NULL;
  g_auto(GLnxTmpDir) tmpdir = { FALSE };
  g_auto(GLnxTmpDir) tmpdir_for_chase = { FALSE };
  GLnxTmpDir *tmpdirs[] = { &tmpdir, &tmpdir_for_chase };
  gsize i;

  /* Make the two temporary directories identical, so that we can test
   * SRT_RESOLVE_FLAGS_MKDIR_P in one and glnx_chase_and_mkdirat()
   * in the other */
  for (gsize j = 0; j < G_N_ELEMENTS (tmpdirs); j++)
    {
      GLnxTmpDir *this_tmpdir = tmpdirs[j];
      glnx_mkdtemp ("test-XXXXXX", 0700, this_tmpdir, &error);
      g_assert_no_error (error);

      for (i = 0; i < G_N_ELEMENTS (prepare_dirs); i++)
        {
          const char *it = prepare_dirs[i];

          glnx_shutil_mkdir_p_at (this_tmpdir->fd, it, 0700, NULL, &error);
          g_assert_no_error (error);
        }

      for (i = 0; i < G_N_ELEMENTS (prepare_files); i++)
        {
          const char *it = prepare_files[i];

          glnx_file_replace_contents_at (this_tmpdir->fd, it,
                                         (guint8 *) "hello", 5,
                                         0, NULL, &error);
          g_assert_no_error (error);

          if (g_str_has_suffix (it, "/exe"))
            g_assert_no_errno (fchmodat (this_tmpdir->fd, it, 0755, 0));
          else
            g_assert_no_errno (fchmodat (this_tmpdir->fd, it, 0644, 0));
        }

      for (i = 0; i < G_N_ELEMENTS (prepare_symlinks); i++)
        {
          const Symlink *it = &prepare_symlinks[i];
          g_autofree gchar *target = NULL;

          if (it->target[0] == '/' && config->mode == MODE_DIRECT)
            target = g_build_filename (this_tmpdir->path, it->target, NULL);
          else
            target = g_strdup (it->target);

          if (symlinkat (target, this_tmpdir->fd, it->name) != 0)
            g_error ("symlinkat %s: %s", it->name, g_strerror (errno));
        }
    }

  for (i = 0; i < G_N_ELEMENTS (tests); i++)
    {
      const ResolveTest *it = &tests[i];
      glnx_autofd int fd = -1;
      glnx_autofd int chased_fd = -1;
      g_autofree gchar *path = NULL;
      g_autofree gchar *path_prefix = NULL;
      g_autofree gchar *path_prefix_for_chase = NULL;
      g_autofree gchar *in_path = NULL;
      g_autofree gchar *in_path_for_chase = NULL;
      gchar **out_path;
      g_autoptr(GError) chase_error = NULL;
      g_autoptr(GString) description = g_string_new ("");
      g_autoptr(SrtSysroot) sysroot = NULL;
      g_autoptr(SrtSysroot) sysroot_for_chase = NULL;
      TestsOpenFdSet old_fds;

      path_prefix = realpath (tmpdir.path, NULL);
      path_prefix_for_chase = realpath (tmpdir_for_chase.path, NULL);

      switch (config->mode)
        {
          case MODE_FDIO:
            sysroot = _srt_sysroot_new (path_prefix, &error);
            g_assert_no_error (error);
            sysroot_for_chase = _srt_sysroot_new (path_prefix_for_chase, &error);
            g_assert_no_error (error);
            in_path = g_strdup (it->call.path);
            in_path_for_chase = g_strdup (it->call.path);
            g_string_append (description, " (fd I/O)");
            break;

          case MODE_DIRECT:
            sysroot = _srt_sysroot_new_direct (&error);
            g_assert_no_error (error);
            sysroot_for_chase = g_object_ref (sysroot);
            in_path = g_build_filename (tmpdir.path, it->call.path, NULL);
            in_path_for_chase = g_build_filename (tmpdir_for_chase.path, it->call.path, NULL);
            g_string_append (description, " (direct I/O)");

            if ((it->call.test_flags & RESOLVE_CALL_FLAGS_SKIP_IF_DIRECT)
                || (it->call.flags & (SRT_RESOLVE_FLAGS_MKDIR_P
                                      | SRT_RESOLVE_FLAGS_REJECT_SYMLINKS)))
              continue;

            break;

          default:
            g_assert_not_reached ();
        }

      old_fds = tests_check_fd_leaks_enter ();

      if (it->call.flags & SRT_RESOLVE_FLAGS_MKDIR_P)
        g_string_append (description, " (creating directories)");

      if (it->call.flags & SRT_RESOLVE_FLAGS_KEEP_FINAL_SYMLINK)
        g_string_append (description, " (not following final symlink)");

      if (it->call.flags & SRT_RESOLVE_FLAGS_REJECT_SYMLINKS)
        g_string_append (description, " (not following any symlink)");

      if (it->call.flags & SRT_RESOLVE_FLAGS_MUST_BE_DIRECTORY)
        g_string_append (description, " (must be a directory)");

      if (it->call.flags & SRT_RESOLVE_FLAGS_MUST_BE_REGULAR)
        g_string_append (description, " (must be a regular file)");

      if (it->call.flags & SRT_RESOLVE_FLAGS_READABLE)
        g_string_append (description, " (open for reading)");

      if (it->call.flags & SRT_RESOLVE_FLAGS_RETURN_ABSOLUTE)
        g_string_append (description, " (return absolute path)");

      g_test_message ("%" G_GSIZE_FORMAT ": Resolving %s%s",
                      i, in_path, description->str);

      if (it->call.test_flags & RESOLVE_CALL_FLAGS_IGNORE_PATH)
        out_path = NULL;
      else
        out_path = &path;

      if (it->call.flags & (SRT_RESOLVE_FLAGS_MKDIR_P
                            | SRT_RESOLVE_FLAGS_REJECT_SYMLINKS))
        {
          /* Not supported in the higher-level interface */
          g_assert (config->mode == MODE_FDIO);
          fd = _srt_resolve_in_sysroot (sysroot->fd, in_path, it->call.flags,
                                        out_path, &error);
        }
      else
        {
          fd = _srt_sysroot_open (sysroot, in_path, it->call.flags,
                                  out_path, &error);
        }

      if (fd >= 0)
        g_test_message ("-> resolved successfully");
      else
        g_test_message ("-> could not resolve: %s #%d: %s",
                        g_quark_to_string (error->domain), error->code, error->message);

      if (it->call.test_flags & RESOLVE_CALL_FLAGS_CANNOT_CHASE)
        {
          g_test_message ("Skip glnx_chaseat(): unimplementable");
        }
      else
        {
          GlnxChaseFlags chase_flags = GLNX_CHASE_RESOLVE_IN_ROOT;

          if (it->call.flags & SRT_RESOLVE_FLAGS_KEEP_FINAL_SYMLINK)
            chase_flags |= GLNX_CHASE_NOFOLLOW;

          if (it->call.flags & SRT_RESOLVE_FLAGS_REJECT_SYMLINKS)
            chase_flags |= GLNX_CHASE_RESOLVE_NO_SYMLINKS;

          /* Ignore SRT_RESOLVE_FLAGS_READABLE: there is no direct equivalent,
           * but we'll use glnx_fd_reopen() later */

          /* SRT_RESOLVE_FLAGS_MKDIR_P automatically implies
           * MUST_BE_DIRECTORY, but glnx_chase_and_mkdirat() doesn't
           * accept that flag and always behaves as though it was present */
          if ((it->call.flags & SRT_RESOLVE_FLAGS_MUST_BE_DIRECTORY)
              && !(it->call.flags & SRT_RESOLVE_FLAGS_MKDIR_P))
            chase_flags |= GLNX_CHASE_MUST_BE_DIRECTORY;

          if (it->call.flags & SRT_RESOLVE_FLAGS_MUST_BE_REGULAR)
            chase_flags |= GLNX_CHASE_MUST_BE_REGULAR;

          /* Ignore SRT_RESOLVE_FLAGS_RETURN_ABSOLUTE: no direct equivalent,
           * glnx_chaseat() doesn't output the resolved path at all */

          /* Ignore SRT_RESOLVE_FLAGS_MUST_BE_EXECUTABLE: no direct equivalent,
           * but we'll use fstat() later */

          if (it->call.flags & SRT_RESOLVE_FLAGS_MKDIR_P)
            chased_fd = glnx_chase_and_mkdirat (sysroot_for_chase->fd,
                                                in_path_for_chase,
                                                chase_flags,
                                                0755,
                                                &chase_error);
          else
            chased_fd = glnx_chaseat (sysroot_for_chase->fd,
                                      in_path_for_chase,
                                      chase_flags,
                                      &chase_error);

          if (chased_fd >= 0)
            g_test_message ("-> resolved successfully via glnx_chaseat()");
          else
            g_test_message ("-> could not resolve: %s #%d: %s (via glnx_chaseat())",
                            g_quark_to_string (chase_error->domain),
                            chase_error->code,
                            chase_error->message);

          if (chased_fd >= 0
              && (it->call.flags & SRT_RESOLVE_FLAGS_MUST_BE_EXECUTABLE))
            {
              /* glnx_chaseat() doesn't implement MUST_BE_EXECUTABLE,
               * so emulate it here for now.
               * faccessat() only supports AT_EMPTY_PATH since Linux 5.8,
               * and we still support older kernels, so we have to use
               * this instead. */
              g_autofree gchar *proc_fd_name = g_strdup_printf ("/proc/self/fd/%d",
                                                                chased_fd);

              if (access (proc_fd_name, X_OK) != 0)
                {
                  glnx_throw_errno_prefix (&chase_error, "access");
                  g_clear_fd (&chased_fd, NULL);
                }
            }

          if (chased_fd >= 0
              && (it->call.flags & SRT_RESOLVE_FLAGS_READABLE))
            {
              /* When using glnx_chaseat(), there's no direct equivalent
               * of the READABLE flag: it's a separate operation. */
              g_autoptr(GError) local_error = NULL;
              glnx_autofd int reopened_fd = -1;

              reopened_fd = glnx_fd_reopen (chased_fd, O_RDONLY, &chase_error);

              g_clear_fd (&chased_fd, &local_error);
              g_assert_no_error (local_error);
              chased_fd = g_steal_fd (&reopened_fd);
            }
        }

      if (it->expect.path != NULL)
        {
          const char *rel_path;

          g_assert_no_error (error);
          g_assert_cmpint (fd, >=, 0);

          if (out_path != NULL)
            {
              g_autofree gchar *full_path = NULL;
              const char *expected_path;

              switch (config->mode)
                {
                  case MODE_FDIO:
                    expected_path = it->expect.path;
                    break;

                  case MODE_DIRECT:
                    if (g_str_equal (it->expect.path, ".")
                        || g_str_equal (it->expect.path, "/"))
                      full_path = g_strdup (path_prefix);
                    else
                      full_path = g_build_filename (path_prefix,
                                                    it->expect.path,
                                                    NULL);

                    if (it->call.flags & SRT_RESOLVE_FLAGS_RETURN_ABSOLUTE)
                      expected_path = full_path;
                    else
                      expected_path = full_path + 1;

                    break;

                  default:
                    g_assert_not_reached ();
                }

              g_assert_cmpstr (*out_path, ==, expected_path);
            }

          if (it->call.flags & SRT_RESOLVE_FLAGS_RETURN_ABSOLUTE)
            {
              g_assert (it->expect.path[0] == '/');

              if (it->expect.path[1] == '\0')
                rel_path = ".";
              else
                rel_path = it->expect.path + 1;
            }
          else
            {
              g_assert (it->expect.path[0] != '/');
              rel_path = it->expect.path;
            }

          check_fd_same_as_rel_path_nofollow (fd, tmpdir.fd, rel_path);

          if (!(it->call.test_flags & RESOLVE_CALL_FLAGS_CANNOT_CHASE))
            {
              g_assert_no_error (chase_error);
              g_assert_cmpint (chased_fd, >=, 0);
              check_fd_same_as_rel_path_nofollow (chased_fd, tmpdir_for_chase.fd, rel_path);
            }
        }
      else
        {
          if (it->expect.code == G_IO_ERROR_FAILED)
            {
              /* Any error from the GIOErrorEnum domain is OK */
              g_assert_nonnull (error);
              g_assert_cmpstr (g_quark_to_string (error->domain), ==,
                               g_quark_to_string (G_IO_ERROR));
            }
          else
            {
              g_assert_error (error, G_IO_ERROR, it->expect.code);
            }

          g_test_message ("Got error as expected");
          g_assert_cmpint (fd, ==, -1);

          if (out_path != NULL)
            g_assert_cmpstr (*out_path, ==, NULL);

          g_clear_error (&error);

          if (!(it->call.test_flags & RESOLVE_CALL_FLAGS_CANNOT_CHASE))
            {
              g_assert_nonnull (chase_error);
              g_assert_cmpstr (g_quark_to_string (chase_error->domain), ==,
                               g_quark_to_string (G_IO_ERROR));
              g_assert_cmpint (chased_fd, ==, -1);
              g_test_message ("Also got error from chase as expected");
            }
        }

      g_clear_fd (&fd, &error);
      g_assert_no_error (error);
      g_clear_fd (&chased_fd, &error);
      g_assert_no_error (error);
      g_clear_object (&sysroot);
      g_clear_object (&sysroot_for_chase);
      tests_check_fd_leaks_leave (old_fds);
    }
}

int
main (int argc,
      char **argv)
{
  _srt_setenv_disable_gio_modules ();

  _srt_tests_init (&argc, &argv, NULL);
  g_test_add ("/resolve-in-sysroot/fdio", Fixture, &fdio_config,
              setup, test_resolve_in_sysroot, teardown);
  g_test_add ("/resolve-in-sysroot/direct", Fixture, &direct_config,
              setup, test_resolve_in_sysroot, teardown);

  return g_test_run ();
}
