/*
 * Copyright © 2014-2019 Red Hat, Inc
 * Copyright © 2017-2024 Collabora Ltd.
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

#include "pressure-vessel/wrap-context.h"

#include "steam-runtime-tools/architecture-internal.h"
#include "steam-runtime-tools/glib-backports-internal.h"
#include "steam-runtime-tools/launcher-interface-internal.h"
#include "steam-runtime-tools/log-internal.h"
#include "steam-runtime-tools/utils-internal.h"

#include "pressure-vessel/bwrap.h"
#include "pressure-vessel/exports.h"
#include "pressure-vessel/flatpak-context-private.h"
#include "pressure-vessel/supported-architectures.h"
#include "pressure-vessel/utils.h"
#include "pressure-vessel/wrap-flatpak.h"
#include "pressure-vessel/wrap-setup.h"

static Tristate
tristate_environment (const gchar *name)
{
  const gchar *value = g_getenv (name);

  if (g_strcmp0 (value, "1") == 0)
    return TRISTATE_YES;

  if (g_strcmp0 (value, "0") == 0)
    return TRISTATE_NO;

  if (value != NULL && value[0] != '\0')
    g_warning ("Unrecognised value \"%s\" for $%s", value, name);

  return TRISTATE_MAYBE;
}

void
wrap_preload_module_clear (gpointer p)
{
  WrapPreloadModule *self = p;

  g_clear_pointer (&self->preload, g_free);
}

static void
pv_wrap_options_init (PvWrapOptions *self)
{
  self->pass_fds = g_array_new (FALSE, FALSE, sizeof (int));
  self->architectures = _srt_architecture_array_new ();
  self->preload_modules = g_array_new (FALSE, FALSE,
                                       sizeof (WrapPreloadModule));
  g_array_set_clear_func (self->preload_modules, wrap_preload_module_clear);

  /* Set defaults */
  self->arch_graphics_providers = NULL;
  self->batch = FALSE;
  self->copy_runtime = FALSE;
  self->deterministic = FALSE;
  self->devel = FALSE;
  self->env_if_host = NULL;
  self->filesystems = NULL;
  self->gc_runtimes = TRUE;
  self->generate_locales = TRUE;
  self->graphics_provider = NULL;
  self->import_ca_certs = FALSE;
  self->import_openxr_1_runtimes = FALSE;
  self->import_openxr_1_layers = FALSE;
  self->import_vulkan_layers = TRUE;
  self->launcher = FALSE;
  self->only_prepare = FALSE;
  self->remove_game_overlay = FALSE;
  self->runtime = NULL;
  self->runtime_base = NULL;
  self->share_home = TRISTATE_MAYBE;
  self->share_pid = TRUE;
  self->shell = PV_SHELL_NONE;
  self->single_thread = FALSE;
  self->systemd_scope = FALSE;
  self->terminal = PV_TERMINAL_AUTO;
  self->terminate_idle_timeout = 0.0;
  self->terminate_timeout = -1.0;
  self->test = FALSE;
  self->variable_dir = NULL;
  self->verbose = FALSE;
  self->version = FALSE;
  self->version_only = FALSE;
  self->write_final_argv = NULL;
}

static void
pv_wrap_options_clear (PvWrapOptions *self)
{
  g_clear_pointer (&self->architectures, g_array_unref);
  g_clear_pointer (&self->arch_graphics_providers, g_hash_table_unref);
  g_clear_object (&self->emulator);
  g_clear_pointer (&self->emulator_manifest, g_free);
  g_clear_pointer (&self->env_if_host, g_strfreev);
  g_clear_pointer (&self->filesystems, g_hash_table_unref);
  g_clear_pointer (&self->freedesktop_app_id, g_free);
  g_clear_pointer (&self->graphics_provider, g_free);
  g_clear_pointer (&self->home, g_free);
  g_clear_pointer (&self->pass_fds, g_array_unref);
  g_clear_pointer (&self->preload_modules, g_array_unref);
  g_clear_pointer (&self->runtime, g_free);
  g_clear_pointer (&self->runtime_base, g_free);
  g_clear_pointer (&self->steam_app_id, g_free);
  g_clear_pointer (&self->variable_dir, g_free);
  g_clear_pointer (&self->write_final_argv, g_free);
}

enum {
  PROP_0,
  PROP_CURRENT_HOME,
  PROP_CURRENT_ROOT,
  N_PROPERTIES
};

static GParamSpec *properties[N_PROPERTIES] = { NULL };

struct _PvWrapContextClass
{
  GObjectClass parent_class;
};

G_DEFINE_TYPE (PvWrapContext, pv_wrap_context, G_TYPE_OBJECT)

static void
pv_wrap_context_init (PvWrapContext *self)
{
  self->arbitrary_dirent_order = NULL;
  self->arbitrary_str_order = NULL;
  self->is_flatpak_env = g_file_test ("/.flatpak-info", G_FILE_TEST_IS_REGULAR);
  self->original_environ = g_get_environ ();
  self->current_home_fd = -1;
  self->bwrap_flags = SRT_BWRAP_FLAGS_NONE;
  self->workarounds = PV_WORKAROUND_FLAGS_NONE;

  pv_wrap_options_init (&self->options);

  /* Some defaults are conditional */
  self->options.copy_runtime = self->is_flatpak_env;
}

static void
pv_wrap_context_get_property (GObject *object,
                              guint prop_id,
                              GValue *value,
                              GParamSpec *pspec)
{
  PvWrapContext *self = PV_WRAP_CONTEXT (object);

  switch (prop_id)
    {
      case PROP_CURRENT_HOME:
        g_value_set_string (value, g_quark_to_string (self->current_home));
        break;

      case PROP_CURRENT_ROOT:
        g_value_set_object (value, self->current_root);
        break;

      default:
        G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
    }
}

static void
pv_wrap_context_set_property (GObject *object,
                              guint prop_id,
                              const GValue *value,
                              GParamSpec *pspec)
{
  PvWrapContext *self = PV_WRAP_CONTEXT (object);

  switch (prop_id)
    {
      case PROP_CURRENT_HOME:
        /* Construct-only */
        g_return_if_fail (self->current_home == 0);
        self->current_home = g_quark_from_string (g_value_get_string (value));
        break;

      case PROP_CURRENT_ROOT:
        /* Construct-only */
        g_return_if_fail (self->current_root == NULL);
        self->current_root = g_value_dup_object (value);
        break;

      default:
        G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
    }
}

static void
pv_wrap_context_constructed (GObject *object)
{
  PvWrapContext *self = PV_WRAP_CONTEXT (object);
  g_autoptr(GError) local_error = NULL;

  G_OBJECT_CLASS (pv_wrap_context_parent_class)->constructed (object);

  if (self->current_home == 0)
    self->current_home = g_quark_from_string (g_get_home_dir ());

  self->current_home_fd = _srt_sysroot_open (self->current_root,
                                             g_quark_to_string (self->current_home),
                                             (SRT_RESOLVE_FLAGS_READABLE
                                              | SRT_RESOLVE_FLAGS_MUST_BE_DIRECTORY),
                                             NULL,
                                             &local_error);


  if (self->current_home_fd < 0)
    {
      g_warning ("Cannot open current home directory \"%s\": %s",
                 g_quark_to_string (self->current_home),
                 local_error->message);
      g_clear_error (&local_error);
    }
}

static void
pv_wrap_context_dispose (GObject *object)
{
  PvWrapContext *self = PV_WRAP_CONTEXT (object);

  /* We need to clear this early, because it now contains objects and
   * therefore could participate in a reference cycle */
  pv_wrap_options_clear (&self->options);

  g_clear_object (&self->current_root);
  g_clear_pointer (&self->flatpak_subsandbox, flatpak_bwrap_free);
  g_clear_object (&self->run_in_current_context);
  g_clear_object (&self->runtime);

  G_OBJECT_CLASS (pv_wrap_context_parent_class)->dispose (object);
}

static void
pv_wrap_context_finalize (GObject *object)
{
  PvWrapContext *self = PV_WRAP_CONTEXT (object);

  pv_wrap_options_clear (&self->options);

  g_clear_pointer (&self->exports, flatpak_exports_free);
  g_clear_pointer (&self->paths_not_exported, g_hash_table_unref);
  g_strfreev (self->original_argv);
  g_strfreev (self->original_environ);
  g_free (self->bwrap_executable);
  g_clear_fd (&self->current_home_fd, NULL);

  G_OBJECT_CLASS (pv_wrap_context_parent_class)->finalize (object);
}

static void
pv_wrap_context_class_init (PvWrapContextClass *cls)
{
  GObjectClass *object_class = G_OBJECT_CLASS (cls);

  /* Pre-cache known architecture strings as quarks, early in process
   * startup, to avoid having to duplicate and "leak" them */
  _srt_architecture_init_known ();

  object_class->get_property = pv_wrap_context_get_property;
  object_class->set_property = pv_wrap_context_set_property;
  object_class->constructed = pv_wrap_context_constructed;
  object_class->dispose = pv_wrap_context_dispose;
  object_class->finalize = pv_wrap_context_finalize;

  properties[PROP_CURRENT_HOME] =
    g_param_spec_string ("current-home", "Current $HOME",
                         ("Path to real or mock home directory "
                          "within current-root"),
                         NULL,
                         (G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                          G_PARAM_STATIC_STRINGS));

  properties[PROP_CURRENT_ROOT] =
    g_param_spec_object ("current-root", "Current root",
                         ("Real or mock root directory for the current "
                          "filesystem namespace"),
                         SRT_TYPE_SYSROOT,
                         (G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY |
                          G_PARAM_STATIC_STRINGS));

  g_object_class_install_properties (object_class, N_PROPERTIES, properties);
}

PvWrapContext *
pv_wrap_context_new (SrtSysroot *current_root,
                     const char *current_home,
                     GError **error)
{
  /* Can't actually fail right now */
  return g_object_new (PV_TYPE_WRAP_CONTEXT,
                       "current-home", current_home,
                       "current-root", current_root,
                       NULL);
}

/*
 * Returns: (transfer none): The emulator in use, if any,
 *  at the path that will be seen inside the resulting container.
 */
static SrtEmulator *
pv_wrap_context_get_emulator_in_container (PvWrapContext *self)
{
  if (self->runtime != NULL)
    return pv_runtime_get_emulator_in_container (self->runtime);
  else
    return _srt_subprocess_runner_get_emulator (self->run_in_current_context);
}

/*
 * Returns: (transfer none): The `libexec/steam-runtime-tools-0` directory
 *  from the relocatable pressure-vessel build in use, at the path that will
 *  be seen inside the resulting container.
 */
static const char *
pv_wrap_context_get_helpers_dir_in_container (PvWrapContext *self)
{
  if (self->runtime != NULL)
    return pv_runtime_get_helpers_dir_in_container (self->runtime);
  else
    return _srt_subprocess_runner_get_helpers_path (self->run_in_current_context);
}

/*
 * @fs: (type filename) (transfer full):
 */
void
pv_wrap_options_take_filesystem (PvWrapOptions *self,
                                 char *fs,
                                 FlatpakFilesystemMode mode)
{
  if (self->filesystems == NULL)
    self->filesystems = g_hash_table_new_full (g_str_hash, g_str_equal,
                                               g_free, NULL);

  g_hash_table_replace (self->filesystems,
                        g_steal_pointer (&fs),
                        GINT_TO_POINTER (mode));
}

/*
 * pv_wrap_context_has_filesystem:
 * @self: The context
 * @fs: An absolute path
 * @mode_out: (optional): Used to return the filesystem mode if set
 *
 * If @fs was configured to be read-only, read/write or
 * explicitly unshared, set `*mode_out` and return %TRUE.
 * If no mode was specified for @fs, leave `*mode_out` unchanged
 * and return %FALSE.
 *
 * Returns: %TRUE if a mode for @fs was specified
 */
gboolean
pv_wrap_context_has_filesystem (PvWrapContext *self,
                                const char *fs,
                                FlatpakFilesystemMode *mode_out)
{
  void *mode_value = NULL;

  if (self->options.filesystems == NULL
      || !g_hash_table_lookup_extended (self->options.filesystems, fs,
                                        NULL, &mode_value))
    return FALSE;

  if (mode_out != NULL)
    *mode_out = GPOINTER_TO_INT (mode_value);

  return TRUE;
}

static gboolean
opt_copy_runtime_into_cb (const gchar *option_name,
                          const gchar *value,
                          gpointer data,
                          GError **error)
{
  PvWrapOptions *self = data;

  if (value == NULL)
    {
      /* Do nothing, keep previous setting */
    }
  else if (value[0] == '\0')
    {
      g_warning ("%s is deprecated, disable with --no-copy-runtime instead",
                 option_name);
      self->copy_runtime = FALSE;
    }
  else
    {
      g_warning ("%s is deprecated, use --copy-runtime and "
                 "--variable-dir instead",
                 option_name);
      self->copy_runtime = TRUE;
      g_free (self->variable_dir);
      self->variable_dir = g_strdup (value);
    }

  return TRUE;
}

static gboolean
opt_filesystem_cb (const char *option_name,
                   const char *value,
                   void *data,
                   GError **error)
{
  PvWrapOptions *self = data;
  g_autofree gchar *filesystem = NULL;
  FlatpakFilesystemMode mode = FLATPAK_FILESYSTEM_MODE_READ_WRITE;

  if (!flatpak_context_parse_filesystem (value,
                                         FALSE,   /* not --nofilesystem */
                                         &filesystem,
                                         &mode,
                                         error))
    return FALSE;

  if (g_str_equal (filesystem, "host-etc")
      || g_str_equal (filesystem, "host-os"))
    g_debug ("%s=\"%s\" accepted but ignored", option_name, value);
  else if (g_str_equal (filesystem, "home"))
    return usage_error (error,
                        "%s=\"%s\" not currently implemented (use --share-home instead)",
                        option_name, value);

  pv_wrap_options_take_filesystem (self, g_steal_pointer (&filesystem), mode);
  return TRUE;
}

static gboolean
opt_ignored_cb (const gchar *option_name,
                const gchar *value,
                gpointer data,
                GError **error)
{
  g_warning ("%s is deprecated and no longer has any effect", option_name);
  return TRUE;
}

static gboolean
opt_ld_something (PvWrapOptions *self,
                  PvPreloadVariableIndex which,
                  const char *value,
                  gboolean split,
                  GError **error)
{
  g_auto(GStrv) tokens = NULL;
  size_t i;

  if (split)
    {
      tokens = g_strsplit_set (value, pv_preload_variables[which].separators, 0);
    }
  else
    {
      tokens = g_new0 (char *, 2);
      tokens[0] = g_strdup (value);
      tokens[1] = NULL;
    }

  for (i = 0; tokens[i] != NULL; i++)
    {
      WrapPreloadModule module = { which, g_steal_pointer (&tokens[i]) };

      if (module.preload[0] == '\0')
        wrap_preload_module_clear (&module);
      else
        g_array_append_val (self->preload_modules, module);
    }

  return TRUE;
}

static gboolean
opt_ld_audit_cb (const gchar *option_name,
                 const gchar *value,
                 gpointer data,
                 GError **error)
{
  return opt_ld_something (data, PV_PRELOAD_VARIABLE_INDEX_LD_AUDIT,
                           value, FALSE, error);
}

static gboolean
opt_ld_audits_cb (const gchar *option_name,
                  const gchar *value,
                  gpointer data,
                  GError **error)
{
  return opt_ld_something (data, PV_PRELOAD_VARIABLE_INDEX_LD_AUDIT,
                           value, TRUE, error);
}

static gboolean
opt_ld_preload_cb (const gchar *option_name,
                   const gchar *value,
                   gpointer data,
                   GError **error)
{
  return opt_ld_something (data, PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
                           value, FALSE, error);
}

static gboolean
opt_ld_preloads_cb (const gchar *option_name,
                    const gchar *value,
                    gpointer data,
                    GError **error)
{
  return opt_ld_something (data, PV_PRELOAD_VARIABLE_INDEX_LD_PRELOAD,
                           value, TRUE, error);
}

static gboolean
opt_host_ld_preload_cb (const gchar *option_name,
                        const gchar *value,
                        gpointer data,
                        GError **error)
{
  g_warning ("%s is deprecated, use --ld-preload=%s instead",
             option_name, value);
  return opt_ld_preload_cb (option_name, value, data, error);
}

static gboolean
opt_pass_fd_cb (const char *name,
                const char *value,
                gpointer data,
                GError **error)
{
  PvWrapOptions *self = data;
  char *endptr;
  gint64 i64 = g_ascii_strtoll (value, &endptr, 10);
  int fd;
  int fd_flags;

  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);
  g_return_val_if_fail (value != NULL, FALSE);

  if (i64 < 0 || i64 > G_MAXINT || endptr == value || *endptr != '\0')
    {
      g_set_error (error, G_OPTION_ERROR, G_OPTION_ERROR_BAD_VALUE,
                   "Integer out of range or invalid: %s", value);
      return FALSE;
    }

  fd = (int) i64;

  fd_flags = fcntl (fd, F_GETFD);

  if (fd_flags < 0)
    return glnx_throw_errno_prefix (error, "Unable to receive --fd %d", fd);

  g_array_append_val (self->pass_fds, fd);
  return TRUE;
}

static gboolean
opt_share_home_cb (const gchar *option_name,
                   const gchar *value,
                   gpointer data,
                   GError **error)
{
  PvWrapOptions *self = data;

  if (g_strcmp0 (option_name, "--share-home") == 0)
    self->share_home = TRISTATE_YES;
  else if (g_strcmp0 (option_name, "--unshare-home") == 0)
    self->share_home = TRISTATE_NO;
  else
    g_return_val_if_reached (FALSE);

  return TRUE;
}

static gboolean
opt_shell_cb (const gchar *option_name,
              const gchar *value,
              gpointer data,
              GError **error)
{
  PvWrapOptions *self = data;

  if (g_strcmp0 (option_name, "--shell-after") == 0)
    value = "after";
  else if (g_strcmp0 (option_name, "--shell-fail") == 0)
    value = "fail";
  else if (g_strcmp0 (option_name, "--shell-instead") == 0)
    value = "instead";

  if (value == NULL || *value == '\0')
    {
      self->shell = PV_SHELL_NONE;
      return TRUE;
    }

  switch (value[0])
    {
      case 'a':
        if (g_strcmp0 (value, "after") == 0)
          {
            self->shell = PV_SHELL_AFTER;
            return TRUE;
          }
        break;

      case 'f':
        if (g_strcmp0 (value, "fail") == 0)
          {
            self->shell = PV_SHELL_FAIL;
            return TRUE;
          }
        break;

      case 'i':
        if (g_strcmp0 (value, "instead") == 0)
          {
            self->shell = PV_SHELL_INSTEAD;
            return TRUE;
          }
        break;

      case 'n':
        if (g_strcmp0 (value, "none") == 0 || g_strcmp0 (value, "no") == 0)
          {
            self->shell = PV_SHELL_NONE;
            return TRUE;
          }
        break;

      default:
        /* fall through to error */
        break;
    }

  g_set_error (error, G_OPTION_ERROR, G_OPTION_ERROR_FAILED,
               "Unknown choice \"%s\" for %s", value, option_name);
  return FALSE;
}

static gboolean
opt_terminal_cb (const gchar *option_name,
                 const gchar *value,
                 gpointer data,
                 GError **error)
{
  PvWrapOptions *self = data;

  if (g_strcmp0 (option_name, "--tty") == 0)
    value = "tty";
  else if (g_strcmp0 (option_name, "--xterm") == 0)
    value = "xterm";

  if (value == NULL || *value == '\0')
    {
      self->terminal = PV_TERMINAL_AUTO;
      return TRUE;
    }

  switch (value[0])
    {
      case 'a':
        if (g_strcmp0 (value, "auto") == 0)
          {
            self->terminal = PV_TERMINAL_AUTO;
            return TRUE;
          }
        break;

      case 'n':
        if (g_strcmp0 (value, "none") == 0 || g_strcmp0 (value, "no") == 0)
          {
            self->terminal = PV_TERMINAL_NONE;
            return TRUE;
          }
        break;

      case 't':
        if (g_strcmp0 (value, "tty") == 0)
          {
            self->terminal = PV_TERMINAL_TTY;
            return TRUE;
          }
        break;

      case 'x':
        if (g_strcmp0 (value, "xterm") == 0)
          {
            self->terminal = PV_TERMINAL_XTERM;
            return TRUE;
          }
        break;

      default:
        /* fall through to error */
        break;
    }

  g_set_error (error, G_OPTION_ERROR, G_OPTION_ERROR_FAILED,
               "Unknown choice \"%s\" for %s", value, option_name);
  return FALSE;
}

static gboolean
opt_with_host_graphics_cb (const gchar *option_name,
                           const gchar *value,
                           gpointer data,
                           GError **error)
{
  PvWrapOptions *self = data;

  /* This is the old way to get the graphics from the host system */
  if (g_strcmp0 (option_name, "--with-host-graphics") == 0)
    {
      if (g_file_test ("/run/host/usr", G_FILE_TEST_IS_DIR)
          && g_file_test ("/run/host/etc", G_FILE_TEST_IS_DIR))
        self->graphics_provider = g_strdup ("/run/host");
      else
        self->graphics_provider = g_strdup ("/");
    }
  /* This is the old way to avoid using graphics from the host */
  else if (g_strcmp0 (option_name, "--without-host-graphics") == 0)
    {
      self->graphics_provider = g_strdup ("");
    }
  else
    {
      g_return_val_if_reached (FALSE);
    }

  g_warning ("\"--with-host-graphics\" and \"--without-host-graphics\" have "
             "been deprecated and could be removed in future releases. Please use "
             "use \"--graphics-provider=/\", \"--graphics-provider=/run/host\" or "
             "\"--graphics-provider=\" instead.");

  return TRUE;
}

/*
 * @self: The pv-wrap(1) options
 * @tuple: A multiarch tuple such as `g_quark_from_static_string (SRT_ABI_I386)`
 * @path: (transfer full): An absolute filesystem path
 *
 * Record @path as the implementation of the graphics stack for the
 * architecture/ABI identified by @tuple, taking ownership of the strings.
 */
static void
pv_wrap_options_take_arch_graphics_provider (PvWrapOptions *self,
                                             GQuark tuple,
                                             gchar *path)
{
  if (self->arch_graphics_providers == NULL)
    self->arch_graphics_providers = g_hash_table_new_full (g_direct_hash,
                                                           g_direct_equal,
                                                           NULL,
                                                           g_free);

  g_hash_table_replace (self->arch_graphics_providers,
                        GUINT_TO_POINTER (tuple),
                        path);
}

static gboolean
opt_graphics_provider_cb (const gchar *option_name,
                          const gchar *value,
                          gpointer data,
                          GError **error)
{
  PvWrapOptions *self = data;
  const char *equals;

  g_return_val_if_fail (value != NULL, FALSE);

  /* --graphics-provider=x86_64-linux-gnu=/path/to/somewhere */
  if (value != NULL
      && value[0] != '/'
      && (equals = strchr (value, '=')) != NULL)
    {
      g_autoptr(GError) local_error = NULL;
      g_autofree gchar *tuple = g_strndup (value, equals - value);
      const char *path = equals + 1;

      if (!_srt_architecture_check_plausible_tuple (tuple, &local_error))
        {
          g_set_error_literal (error, G_OPTION_ERROR, G_OPTION_ERROR_BAD_VALUE,
                               local_error->message);
          return FALSE;
        }

      pv_wrap_options_take_arch_graphics_provider (self,
                                                   g_quark_from_string (tuple),
                                                   g_strdup (path));
      return TRUE;
    }

  /* --graphics-provider=/path/to/somewhere */
  g_clear_pointer (&self->graphics_provider, g_free);
  self->graphics_provider = g_strdup (value);
  return TRUE;
}

gboolean
pv_wrap_options_parse_environment (PvWrapOptions *self,
                                   GError **error)
{
  const char *value;

  pv_architecture_array_populate_from_environ (self->architectures);

  self->batch = _srt_boolean_environment ("PRESSURE_VESSEL_BATCH",
                                          self->batch);

  /* Process COPY_RUNTIME_INFO first so that COPY_RUNTIME and VARIABLE_DIR
   * can override it */
  opt_copy_runtime_into_cb ("$PRESSURE_VESSEL_COPY_RUNTIME_INTO",
                            g_getenv ("PRESSURE_VESSEL_COPY_RUNTIME_INTO"),
                            self, NULL);

  self->copy_runtime = _srt_boolean_environment ("PRESSURE_VESSEL_COPY_RUNTIME",
                                                 self->copy_runtime);

  self->deterministic = _srt_boolean_environment ("PRESSURE_VESSEL_DETERMINISTIC",
                                                  self->deterministic);
  self->devel = _srt_boolean_environment ("PRESSURE_VESSEL_DEVEL",
                                          self->devel);
  self->for_steam_client = _srt_boolean_environment ("STEAM_COMPAT_FOR_STEAM_CLIENT",
                                                     self->for_steam_client);

  value = g_getenv ("PRESSURE_VESSEL_EMULATOR");

  if (value == NULL)
    value = g_getenv ("STEAM_COMPAT_EMULATOR");

  if (value != NULL)
    {
      g_free (self->emulator_manifest);
      self->emulator_manifest = g_strdup (value);
    }

  value = g_getenv ("PRESSURE_VESSEL_VARIABLE_DIR");

  if (value != NULL)
    {
      g_free (self->variable_dir);
      self->variable_dir = g_strdup (value);
    }

  self->freedesktop_app_id = g_strdup (g_getenv ("PRESSURE_VESSEL_FDO_APP_ID"));

  if (self->freedesktop_app_id != NULL && self->freedesktop_app_id[0] == '\0')
    g_clear_pointer (&self->freedesktop_app_id, g_free);

  self->home = g_strdup (g_getenv ("PRESSURE_VESSEL_HOME"));

  if (self->home != NULL && self->home[0] == '\0')
    g_clear_pointer (&self->home, g_free);

  self->remove_game_overlay = _srt_boolean_environment ("PRESSURE_VESSEL_REMOVE_GAME_OVERLAY",
                                                        self->remove_game_overlay);
  self->systemd_scope = _srt_boolean_environment ("PRESSURE_VESSEL_SYSTEMD_SCOPE",
                                                  self->systemd_scope);
  self->import_ca_certs = _srt_boolean_environment ("PRESSURE_VESSEL_IMPORT_CA_CERTS",
                                                    self->import_ca_certs);
  self->import_openxr_1_runtimes = _srt_boolean_environment ("PRESSURE_VESSEL_IMPORT_OPENXR_1_RUNTIMES",
                                                             self->import_openxr_1_runtimes);
  self->import_openxr_1_layers = _srt_boolean_environment ("PRESSURE_VESSEL_IMPORT_OPENXR_1_LAYERS",
                                                           self->import_openxr_1_layers);
  self->import_vulkan_layers = _srt_boolean_environment ("PRESSURE_VESSEL_IMPORT_VULKAN_LAYERS",
                                                         self->import_vulkan_layers);

  self->share_home = tristate_environment ("PRESSURE_VESSEL_SHARE_HOME");

  self->gc_runtimes = _srt_boolean_environment ("PRESSURE_VESSEL_GC_RUNTIMES",
                                                self->gc_runtimes);
  self->generate_locales = _srt_boolean_environment ("PRESSURE_VESSEL_GENERATE_LOCALES",
                                                     self->generate_locales);

  self->share_pid = _srt_boolean_environment ("PRESSURE_VESSEL_SHARE_PID",
                                              self->share_pid);
  self->single_thread = _srt_boolean_environment ("PRESSURE_VESSEL_SINGLE_THREAD",
                                                self->single_thread);
  self->verbose = _srt_boolean_environment ("PRESSURE_VESSEL_VERBOSE",
                                            self->verbose);

  if (!opt_shell_cb ("$PRESSURE_VESSEL_SHELL",
                     g_getenv ("PRESSURE_VESSEL_SHELL"), self, error))
    return FALSE;

  if (!opt_terminal_cb ("$PRESSURE_VESSEL_TERMINAL",
                        g_getenv ("PRESSURE_VESSEL_TERMINAL"), self, error))
    return FALSE;

  return TRUE;
}

gboolean
pv_wrap_options_parse_argv (PvWrapOptions *self,
                            int *argcp,
                            char ***argvp,
                            GError **error)
{
  g_autoptr(GOptionContext) context = NULL;
  g_autoptr(GOptionGroup) main_group = NULL;
  GOptionEntry options[] =
  {
    { "batch", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &self->batch,
      "Disable all interactivity and redirection: ignore --shell*, "
      "--terminal, --xterm, --tty. [Default: if $PRESSURE_VESSEL_BATCH]", NULL },
    { "copy-runtime", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &self->copy_runtime,
      "If a --runtime is used, copy it into --variable-dir and edit the "
      "copy in-place.",
      NULL },
    { "no-copy-runtime", '\0',
      G_OPTION_FLAG_REVERSE, G_OPTION_ARG_NONE, &self->copy_runtime,
      "Don't behave as described for --copy-runtime. "
      "[Default unless $PRESSURE_VESSEL_COPY_RUNTIME is 1 or running in Flatpak]",
      NULL },
    { "copy-runtime-into", '\0',
      G_OPTION_FLAG_FILENAME|G_OPTION_FLAG_HIDDEN, G_OPTION_ARG_CALLBACK,
      opt_copy_runtime_into_cb,
      "Deprecated alias for --copy-runtime and --variable-dir", "DIR" },
    { "deterministic", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &self->deterministic,
      "Enforce a deterministic sort order on arbitrarily-ordered things, "
      "even if that's slower. [Default if $PRESSURE_VESSEL_DETERMINISTIC is 1]",
      NULL },
    { "devel", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &self->devel,
      "Use a more permissive configuration that is helpful during development "
      "but not intended for production use. "
      "[Default if $PRESSURE_VESSEL_DEVEL is 1]",
      NULL },
    { "env-if-host", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_FILENAME_ARRAY, &self->env_if_host,
      "Set VAR=VAL if COMMAND is run with /usr from the host system, "
      "but not if it is run with /usr from RUNTIME.", "VAR=VAL" },
    { "filesystem", '\0',
      G_OPTION_FLAG_FILENAME, G_OPTION_ARG_CALLBACK, opt_filesystem_cb,
      "Share filesystem directories with the container, "
      "specified as absolute paths, "
      "paths starting with '~/', "
      "or one of the special tokens host or host-root, "
      "optionally followed by :ro or :rw.",
      /* In fact host-etc, host-os are also accepted but intentionally not
       * documented here, because they're ignored. */
      "PATH[:MODE]" },
    { "for-steam-client", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &self->for_steam_client,
      "Container will be used to run the Steam Client",
      NULL },
    { "freedesktop-app-id", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_STRING, &self->freedesktop_app_id,
      "Make --unshare-home use ~/.var/app/ID as home directory, where ID "
      "is com.example.MyApp or similar. This interoperates with Flatpak. "
      "[Default: $PRESSURE_VESSEL_FDO_APP_ID if set]",
      "ID" },
    { "steam-app-id", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_STRING, &self->steam_app_id,
      "Make --unshare-home use ~/.var/app/com.steampowered.AppN "
      "as home directory. [Default: $STEAM_COMPAT_APP_ID or $SteamAppId]",
      "N" },
    { "gc-legacy-runtimes", '\0',
      G_OPTION_FLAG_HIDDEN, G_OPTION_ARG_CALLBACK, opt_ignored_cb,
      NULL, NULL },
    { "no-gc-legacy-runtimes", '\0',
      G_OPTION_FLAG_HIDDEN, G_OPTION_ARG_CALLBACK, opt_ignored_cb,
      NULL, NULL },
    { "gc-runtimes", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &self->gc_runtimes,
      "If using --variable-dir, garbage-collect old temporary "
      "runtimes. [Default, unless $PRESSURE_VESSEL_GC_RUNTIMES is 0]",
      NULL },
    { "no-gc-runtimes", '\0',
      G_OPTION_FLAG_REVERSE, G_OPTION_ARG_NONE, &self->gc_runtimes,
      "If using --variable-dir, don't garbage-collect old "
      "temporary runtimes.", NULL },
    { "generate-locales", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &self->generate_locales,
      "If using --runtime, attempt to generate any missing locales. "
      "[Default, unless $PRESSURE_VESSEL_GENERATE_LOCALES is 0]",
      NULL },
    { "no-generate-locales", '\0',
      G_OPTION_FLAG_REVERSE, G_OPTION_ARG_NONE, &self->generate_locales,
      "If using --runtime, don't generate any missing locales.", NULL },
    { "home", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_FILENAME, &self->home,
      "Use HOME as home directory. Implies --unshare-home. "
      "[Default: $PRESSURE_VESSEL_HOME if set]", "HOME" },
    { "host-ld-preload", '\0',
      G_OPTION_FLAG_FILENAME | G_OPTION_FLAG_HIDDEN, G_OPTION_ARG_CALLBACK,
      opt_host_ld_preload_cb,
      "Deprecated alias for --ld-preload=MODULE, which despite its name "
      "does not necessarily take the module from the host system",
      "MODULE" },
    { "graphics-provider", '\0',
      G_OPTION_FLAG_FILENAME, G_OPTION_ARG_CALLBACK, opt_graphics_provider_cb,
      "If using --runtime, use PATH as the graphics provider. "
      "The path is assumed to be relative to the current namespace, "
      "and will be adjusted for use on the host system if pressure-vessel "
      "is run in a container. The empty string means use the graphics "
      "stack from container."
      "[Default: $PRESSURE_VESSEL_GRAPHICS_PROVIDER or '/']", "[TUPLE=]PATH" },
    { "launcher", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &self->launcher,
      "Instead of specifying a command with its arguments to execute, all the "
      "elements after '--' will be used as arguments for "
      "'steam-runtime-launcher-service'. All the environment variables that are "
      "edited by pressure-vessel, or that are known to be wrong in the new "
      "container, or that needs to inherit the value from the host system, "
      "will be locked. This option implies --batch.", NULL },
    { "ld-audit", '\0',
      G_OPTION_FLAG_FILENAME, G_OPTION_ARG_CALLBACK, opt_ld_audit_cb,
      "Add MODULE from current execution environment to LD_AUDIT when "
      "executing COMMAND.",
      "MODULE" },
    { "ld-audits", '\0',
      G_OPTION_FLAG_FILENAME, G_OPTION_ARG_CALLBACK, opt_ld_audits_cb,
      "Add MODULEs from current execution environment to LD_AUDIT when "
      "executing COMMAND. Modules are separated by colons.",
      "MODULE[:MODULE...]" },
    { "ld-preload", '\0',
      G_OPTION_FLAG_FILENAME, G_OPTION_ARG_CALLBACK, opt_ld_preload_cb,
      "Add MODULE from current execution environment to LD_PRELOAD when "
      "executing COMMAND.",
      "MODULE" },
    { "ld-preloads", '\0',
      G_OPTION_FLAG_FILENAME, G_OPTION_ARG_CALLBACK, opt_ld_preloads_cb,
      "Add MODULEs from current execution environment to LD_PRELOAD when "
      "executing COMMAND. Modules are separated by colons and/or spaces.",
      "MODULE[:MODULE...]" },
    { "pass-fd", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_CALLBACK, opt_pass_fd_cb,
      "Let the launched process inherit the given fd.",
      "FD" },
    { "remove-game-overlay", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &self->remove_game_overlay,
      "Disable the Steam Overlay. "
      "[Default if $PRESSURE_VESSEL_REMOVE_GAME_OVERLAY is 1]",
      NULL },
    { "keep-game-overlay", '\0',
      G_OPTION_FLAG_REVERSE, G_OPTION_ARG_NONE, &self->remove_game_overlay,
      "Do not disable the Steam Overlay. "
      "[Default unless $PRESSURE_VESSEL_REMOVE_GAME_OVERLAY is 1]",
      NULL },
    { "import-openxr-1-runtimes", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &self->import_openxr_1_runtimes,
      "Import OpenXR 1 runtimes from the host system. "
      "[Default if $PRESSURE_VESSEL_IMPORT_OPENXR_1_RUNTIMES is 1]",
      NULL },
    { "no-import-openxr-1-runtimes", '\0',
      G_OPTION_FLAG_REVERSE, G_OPTION_ARG_NONE, &self->import_openxr_1_runtimes,
      "Do not import OpenXR 1 runtimes from the host system. Please note that "
      "certain OpenXR 1 runtimes might still continue to be reachable from "
      "inside the container. This could be the case for runtimes located in "
      "`~/.config/openxr/1` for example, because we usually share the real "
      "home directory."
      "[Default unless $PRESSURE_VESSEL_IMPORT_OPENXR_1_RUNTIMES is 1]",
      NULL },
    { "import-openxr-1-layers", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &self->import_openxr_1_layers,
      "Import OpenXR 1 layers from the host system. "
      "[Default if $PRESSURE_VESSEL_IMPORT_OPENXR_1_LAYERS is 1]",
      NULL },
    { "no-import-openxr-1-layers", '\0',
      G_OPTION_FLAG_REVERSE, G_OPTION_ARG_NONE, &self->import_openxr_1_layers,
      "Do not import OpenXR 1 layers from the host system. "
      "[Default unless $PRESSURE_VESSEL_IMPORT_OPENXR_1_LAYERS is 1]",
      NULL },
    { "import-vulkan-layers", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &self->import_vulkan_layers,
      "Import Vulkan layers from the host system. "
      "[Default unless $PRESSURE_VESSEL_IMPORT_VULKAN_LAYERS is 0]",
      NULL },
    { "no-import-vulkan-layers", '\0',
      G_OPTION_FLAG_REVERSE, G_OPTION_ARG_NONE, &self->import_vulkan_layers,
      "Do not import Vulkan layers from the host system. Please note that "
      "certain Vulkan layers might still continue to be reachable from inside "
      "the container. This could be the case for all the layers located in "
      " `~/.local/share/vulkan` for example, because we usually share the real "
      "home directory."
      "[Default if $PRESSURE_VESSEL_IMPORT_VULKAN_LAYERS is 0]",
      NULL },
    { "runtime", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_FILENAME, &self->runtime,
      "Mount the given sysroot or merged /usr in the container, and augment "
      "it with the provider's graphics stack. The empty string "
      "means don't use a runtime. [Default: $PRESSURE_VESSEL_RUNTIME or '']",
      "RUNTIME" },
    { "runtime-base", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_FILENAME, &self->runtime_base,
      "If a --runtime is a relative path, look for "
      "it relative to BASE. "
      "[Default: $PRESSURE_VESSEL_RUNTIME_BASE or '.']",
      "BASE" },
    { "share-home", '\0',
      G_OPTION_FLAG_NO_ARG, G_OPTION_ARG_CALLBACK, opt_share_home_cb,
      "Use the real home directory. "
      "[Default unless $PRESSURE_VESSEL_HOME is set or "
      "$PRESSURE_VESSEL_SHARE_HOME is 0]",
      NULL },
    { "unshare-home", '\0',
      G_OPTION_FLAG_NO_ARG, G_OPTION_ARG_CALLBACK, opt_share_home_cb,
      "Use an app-specific home directory chosen according to --home, "
      "--freedesktop-app-id, --steam-app-id or $STEAM_COMPAT_APP_ID. "
      "[Default if $PRESSURE_VESSEL_HOME is set or "
      "$PRESSURE_VESSEL_SHARE_HOME is 0]",
      NULL },
    { "share-pid", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &self->share_pid,
      "Do not create a new process ID namespace for the app. "
      "[Default, unless $PRESSURE_VESSEL_SHARE_PID is 0]",
      NULL },
    { "unshare-pid", '\0',
      G_OPTION_FLAG_REVERSE, G_OPTION_ARG_NONE, &self->share_pid,
      "Create a new process ID namespace for the app. "
      "[Default if $PRESSURE_VESSEL_SHARE_PID is 0]",
      NULL },
    { "shell", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_CALLBACK, opt_shell_cb,
      "--shell=after is equivalent to --shell-after, and so on. "
      "[Default: $PRESSURE_VESSEL_SHELL or 'none']",
      "{none|after|fail|instead}" },
    { "shell-after", '\0',
      G_OPTION_FLAG_NO_ARG, G_OPTION_ARG_CALLBACK, opt_shell_cb,
      "Run an interactive shell after COMMAND. Executing \"$@\" in that "
      "shell will re-run COMMAND [ARGS].",
      NULL },
    { "shell-fail", '\0',
      G_OPTION_FLAG_NO_ARG, G_OPTION_ARG_CALLBACK, opt_shell_cb,
      "Run an interactive shell after COMMAND, but only if it fails.",
      NULL },
    { "shell-instead", '\0',
      G_OPTION_FLAG_NO_ARG, G_OPTION_ARG_CALLBACK, opt_shell_cb,
      "Run an interactive shell instead of COMMAND. Executing \"$@\" in that "
      "shell will run COMMAND [ARGS].",
      NULL },
    { "single-thread", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &self->single_thread,
      "Disable multi-threaded code paths, for debugging",
      NULL },
    { "systemd-scope", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &self->systemd_scope,
      "Attempt to run the game in a systemd scope", NULL },
    { "no-systemd-scope", '\0',
      G_OPTION_FLAG_REVERSE, G_OPTION_ARG_NONE, &self->systemd_scope,
      "Do not run the game in a systemd scope", NULL },
    { "terminal", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_CALLBACK, opt_terminal_cb,
      "none: disable features that would use a terminal; "
      "auto: equivalent to xterm if a --shell option is used, or none; "
      "xterm: put game output (and --shell if used) in an xterm; "
      "tty: put game output (and --shell if used) on Steam's "
      "controlling tty "
      "[Default: $PRESSURE_VESSEL_TERMINAL or 'auto']",
      "{none|auto|xterm|tty}" },
    { "tty", '\0',
      G_OPTION_FLAG_NO_ARG, G_OPTION_ARG_CALLBACK, opt_terminal_cb,
      "Equivalent to --terminal=tty", NULL },
    { "xterm", '\0',
      G_OPTION_FLAG_NO_ARG, G_OPTION_ARG_CALLBACK, opt_terminal_cb,
      "Equivalent to --terminal=xterm", NULL },
    { "terminate-idle-timeout", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_DOUBLE, &self->terminate_idle_timeout,
      "If --terminate-timeout is used, wait this many seconds before "
      "sending SIGTERM. [default: 0.0]",
      "SECONDS" },
    { "terminate-timeout", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_DOUBLE, &self->terminate_timeout,
      "Send SIGTERM and SIGCONT to descendant processes that didn't "
      "exit within --terminate-idle-timeout. If they don't all exit within "
      "this many seconds, send SIGKILL and SIGCONT to survivors. If 0.0, "
      "skip SIGTERM and use SIGKILL immediately. "
      "[Default: -1.0, meaning don't signal].",
      "SECONDS" },
    { "variable-dir", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_FILENAME, &self->variable_dir,
      "If a runtime needs to be unpacked or copied, put it in DIR.",
      "DIR" },
    { "verbose", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &self->verbose,
      "Be more verbose.", NULL },
    { "version", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &self->version,
      "Print version number and exit.", NULL },
    { "version-only", '\0',
      G_OPTION_FLAG_HIDDEN, G_OPTION_ARG_NONE, &self->version_only,
      "Print version number (no other information) and exit.", NULL },
    { "with-host-graphics", '\0',
      G_OPTION_FLAG_NO_ARG | G_OPTION_FLAG_HIDDEN, G_OPTION_ARG_CALLBACK,
      opt_with_host_graphics_cb,
      "Deprecated alias for \"--graphics-provider=/\" or "
      "\"--graphics-provider=/run/host\"", NULL },
    { "without-host-graphics", '\0',
      G_OPTION_FLAG_NO_ARG | G_OPTION_FLAG_HIDDEN, G_OPTION_ARG_CALLBACK,
      opt_with_host_graphics_cb,
      "Deprecated alias for \"--graphics-provider=\"", NULL },
    { "write-final-argv", '\0',
      G_OPTION_FLAG_HIDDEN, G_OPTION_ARG_FILENAME, &self->write_final_argv,
      "Write the final argument vector, as null terminated strings, to the "
      "given file path.", "PATH" },
    { "test", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &self->test,
      "Smoke test pressure-vessel-wrap and exit.", NULL },
    { "only-prepare", '\0',
      G_OPTION_FLAG_NONE, G_OPTION_ARG_NONE, &self->only_prepare,
      "Prepare runtime, but do not actually run anything.", NULL },
    { NULL }
  };

  context = g_option_context_new ("[--] COMMAND [ARGS]\n"
                                  "Run COMMAND [ARGS] in a container.\n");
  main_group = g_option_group_new ("pressure-vessel-wrap",
                                   "Application Options:",
                                   "Application options",
                                   self,
                                   NULL);
  g_option_group_add_entries (main_group, options);
  g_option_context_set_main_group (context, g_steal_pointer (&main_group));

  if (!g_option_context_parse (context, argcp, argvp, error))
    return FALSE;

  return TRUE;
}

gboolean
pv_wrap_context_parse_argv (PvWrapContext *self,
                            int *argcp,
                            char ***argvp,
                            GError **error)
{
  int argc = *argcp;
  char **argv = *argvp;
  int i;

  self->original_argc = argc;
  g_clear_pointer (&self->original_argv, g_strfreev);
  self->original_argv = g_new0 (char *, argc + 1);

  for (i = 0; i < argc; i++)
    self->original_argv[i] = g_strdup (argv[i]);

  return pv_wrap_options_parse_argv (&self->options, argcp, argvp, error);
}

gboolean
pv_wrap_options_parse_environment_after_argv (PvWrapOptions *self,
                                              SrtSysroot *interpreter_root,
                                              GError **error)
{
  if (self->runtime == NULL)
    {
      self->runtime = g_strdup (g_getenv ("PRESSURE_VESSEL_RUNTIME"));

      /* Normalize empty string to NULL to simplify later code */
      if (self->runtime != NULL && self->runtime[0] == '\0')
        g_clear_pointer (&self->runtime, g_free);
    }

  if (self->runtime_base == NULL)
    self->runtime_base = g_strdup (g_getenv ("PRESSURE_VESSEL_RUNTIME_BASE"));

  if (self->graphics_provider == NULL)
    self->graphics_provider = g_strdup (g_getenv ("PRESSURE_VESSEL_GRAPHICS_PROVIDER"));

  if (self->graphics_provider == NULL)
    self->graphics_provider = g_strdup (g_getenv ("STEAM_COMPAT_GRAPHICS_PROVIDER"));

  if (self->graphics_provider == NULL)
    {
      /* Also check the deprecated 'PRESSURE_VESSEL_HOST_GRAPHICS' */
      Tristate value = tristate_environment ("PRESSURE_VESSEL_HOST_GRAPHICS");

      if (value == TRISTATE_MAYBE)
        {
          if (interpreter_root != NULL)
            self->graphics_provider = g_strdup (interpreter_root->path);
          else
            self->graphics_provider = g_strdup ("/");
        }
      else
        {
          g_warning ("$PRESSURE_VESSEL_HOST_GRAPHICS is deprecated, "
                     "please use PRESSURE_VESSEL_GRAPHICS_PROVIDER instead");

          if (value == TRISTATE_NO)
            self->graphics_provider = g_strdup ("");
          else if (interpreter_root != NULL)
            self->graphics_provider = g_strdup (interpreter_root->path);
          else if (g_file_test ("/run/host/usr", G_FILE_TEST_IS_DIR)
                   && g_file_test ("/run/host/etc", G_FILE_TEST_IS_DIR))
            self->graphics_provider = g_strdup ("/run/host");
          else
            self->graphics_provider = g_strdup ("/");
        }
    }

  g_assert (self->graphics_provider != NULL);

  if (self->graphics_provider[0] != '\0' && self->graphics_provider[0] != '/')
    {
      g_set_error (error, G_OPTION_ERROR, G_OPTION_ERROR_BAD_VALUE,
                   "--graphics-provider path must be absolute, not \"%s\"",
                   self->graphics_provider);
      return FALSE;
    }

  if (self->emulator_manifest != NULL
      && self->emulator_manifest[0] != '\0')
    {
      g_info ("Using emulator from %s", self->emulator_manifest);
      self->emulator = _srt_emulator_new_from_manifest (self->emulator_manifest,
                                                        error);

      if (self->emulator == NULL)
        return FALSE;
    }

  /* If no architectures have been configured, the default is whatever
   * architectures are hard-coded to be supported */
  if (self->architectures->len == 0)
    _srt_architecture_array_populate_with_defaults (self->architectures);

  if (self->emulator != NULL)
    {
      const GQuark *required_archs;
      size_t n = 0;

      required_archs = _srt_emulator_get_required_architectures (self->emulator,
                                                                 &n);

      for (size_t i = 0; i < n; i++)
        {
          if (_srt_architecture_array_add (self->architectures,
                                           required_archs[i]))
            g_info ("Added architecture %s, required by emulator",
                    g_quark_to_string (required_archs[i]));
        }

      if (n == 0)
        g_info ("Emulator declares no required architectures, "
                "assuming it's statically-linked");
    }

#ifdef _SRT_MULTIARCH
  /* We expect we will need our own architecture to be able to run
   * pv-adverb, or s-r-supervisor if we switch to using that as the
   * subreaper. */
  if (_srt_architecture_array_add (self->architectures,
                                   g_quark_from_static_string (_SRT_MULTIARCH)))
    g_info ("Added architecture %s, required by pressure-vessel itself",
            _SRT_MULTIARCH);
#endif

  /* All edits to self->architectures need to be done before this point,
   * otherwise it'll be too late to look up their graphics providers
   * in the environment. */

  for (size_t i = 0; i < self->architectures->len; i++)
    {
      GQuark tuple = g_array_index (self->architectures, GQuark, i);
      gconstpointer key = GUINT_TO_POINTER (tuple);
      gpointer value;

      if (self->arch_graphics_providers == NULL
          || !g_hash_table_contains (self->arch_graphics_providers, key))
        {
          g_autofree gchar *var = NULL;
          const char *path;

          var = g_strdup_printf ("PRESSURE_VESSEL_GRAPHICS_PROVIDER_%s",
                                 g_quark_to_string (tuple));
          g_strdelimit (var, "-", '_');
          path = g_getenv (var);

          if (path != NULL)
            pv_wrap_options_take_arch_graphics_provider (self,
                                                         tuple,
                                                         g_strdup (path));
        }

      if (self->arch_graphics_providers != NULL
          && g_hash_table_lookup_extended (self->arch_graphics_providers,
                                           key,
                                           NULL,
                                           &value))
        {
          const char *path = value;

          if (path[0] != '/')
            {
              g_set_error (error, G_OPTION_ERROR, G_OPTION_ERROR_BAD_VALUE,
                           "--graphics-provider path must be absolute, not \"%s\"",
                           (const char *) value);
              return FALSE;
            }

          g_debug ("Architecture-specific graphics provider for %s: %s",
                   g_quark_to_string (tuple), path);
        }
    }

  if (self->arch_graphics_providers != NULL)
    {
      GHashTableIter iter;
      void *k;

      g_hash_table_iter_init (&iter, self->arch_graphics_providers);

      while (g_hash_table_iter_next (&iter, &k, NULL))
        {
          GQuark q = GPOINTER_TO_UINT (k);

          if (!pv_wrap_options_has_architecture (self, q))
            g_warning ("Not a configured multiarch tuple: %s",
                       g_quark_to_string (q));
        }
    }

  return TRUE;
}

gboolean
pv_wrap_context_choose_home_mode (PvWrapContext *self,
                                  PvHomeMode *home_mode_out,
                                  gchar **private_home_out,
                                  const char **steam_app_id_out,
                                  GError **error)
{
  g_autofree gchar *private_home = NULL;
  PvHomeMode home_mode;
  const char *steam_app_id;

  if (self->options.steam_app_id != NULL)
    steam_app_id = self->options.steam_app_id;
  else
    steam_app_id = _srt_get_steam_app_id (_srt_const_strv (self->original_environ));

  if (self->options.for_steam_client && self->options.share_home != TRISTATE_YES)
    {
      if (self->options.share_home == TRISTATE_NO)
        _srt_log_warning ("Overriding PRESSURE_VESSEL_SHARE_HOME=0 or "
                          "--unshare-home: the Steam Client always needs "
                          "the equivalent of --share-home");

      self->options.share_home = TRISTATE_YES;
    }

  if (self->options.share_home == TRISTATE_YES)
    {
      home_mode = PV_HOME_MODE_SHARED;
    }
  else if (self->options.home)
    {
      home_mode = PV_HOME_MODE_PRIVATE;
      private_home = g_strdup (self->options.home);
    }
  else if (self->options.share_home == TRISTATE_MAYBE)
    {
      home_mode = PV_HOME_MODE_SHARED;
    }
  else if (self->options.freedesktop_app_id)
    {
      home_mode = PV_HOME_MODE_PRIVATE;
      private_home = g_build_filename (g_quark_to_string (self->current_home),
                                       ".var", "app",
                                       self->options.freedesktop_app_id,
                                       NULL);
    }
  else if (steam_app_id != NULL)
    {
      home_mode = PV_HOME_MODE_PRIVATE;
      self->options.freedesktop_app_id = g_strdup_printf ("com.steampowered.App%s",
                                                          steam_app_id);
      private_home = g_build_filename (g_quark_to_string (self->current_home),
                                       ".var", "app",
                                       self->options.freedesktop_app_id,
                                       NULL);
    }
  else if (self->options.batch)
    {
      home_mode = PV_HOME_MODE_TRANSIENT;
      private_home = NULL;
      g_info ("Unsharing the home directory without choosing a valid "
              "candidate, using tmpfs as a fallback");
    }
  else
    {
      return usage_error (error,
                          "Either --home, --freedesktop-app-id, --steam-app-id "
                          "or $SteamAppId is required");
    }

  if (home_mode == PV_HOME_MODE_PRIVATE)
    g_assert (private_home != NULL);
  else
    g_assert (private_home == NULL);

  if (home_mode_out != NULL)
    *home_mode_out = home_mode;

  if (private_home_out != NULL)
    *private_home_out = g_steal_pointer (&private_home);

  if (steam_app_id_out != NULL)
    *steam_app_id_out = steam_app_id;

  return TRUE;
}

gboolean
pv_wrap_context_after_parsing_arguments (PvWrapContext *self,
                                         PvWrapTestFlags test_flags,
                                         GError **error)
{
  g_autoptr(SrtEmulatorServer) server = NULL;
  g_autofree char *bindir = NULL;
  const char *prefix;
  const char *pkglibexecdir = NULL;

  if (self->options.deterministic)
    {
      self->arbitrary_dirent_order = _srt_dirent_strcmp;
      self->arbitrary_str_order = _srt_generic_strcmp0;
    }

  if (self->options.terminal == PV_TERMINAL_AUTO)
    {
      if (self->options.shell != PV_SHELL_NONE)
        self->options.terminal = PV_TERMINAL_XTERM;
      else
        self->options.terminal = PV_TERMINAL_NONE;
    }

  if (self->options.terminal == PV_TERMINAL_NONE
      && self->options.shell != PV_SHELL_NONE)
    return usage_error (error, "--terminal=none is incompatible with --shell");

  bindir = _srt_find_executable_dir (error);

  if (bindir == NULL)
    return FALSE;

  g_debug ("Found executable directory: %s", bindir);

  prefix = _srt_find_myself (NULL, &pkglibexecdir, error);

  if (prefix == NULL)
    return FALSE;

  if (self->options.emulator != NULL
      && !_srt_emulator_server_maybe_start (self->options.emulator,
                                            NULL,   /* envp */
                                            &server,
                                            error))
    return FALSE;

  self->run_in_current_context = _srt_subprocess_runner_new_full (self->options.emulator,
                                                                  server,
                                                                  NULL,   /* envp */
                                                                  bindir,
                                                                  pkglibexecdir,
                                                                  NULL,   /* sysroot */
                                                                  SRT_TEST_FLAGS_NONE,
                                                                  NULL);  /* cwd */

  if (test_flags & PV_WRAP_TEST_FLAGS_MOCK_BWRAP)
    {
      self->bwrap_executable = g_strdup ("/path/to/srt-bwrap");
      self->bwrap_flags = SRT_BWRAP_FLAGS_NONE;
    }
  else if (self->is_flatpak_env)
    {
      /* If we are in a Flatpak environment we can't use bwrap directly */
      if (!pv_wrap_check_flatpak (bindir, &self->flatpak_subsandbox, error))
        return FALSE;
    }
  else
    {
      g_debug ("Checking for bwrap...");

      self->bwrap_executable = pv_wrap_check_bwrap (self->run_in_current_context,
                                                    self->options.only_prepare,
                                                    &self->bwrap_flags,
                                                    error);

      if (self->bwrap_executable == NULL)
        return FALSE;

      g_debug ("OK (%s)", self->bwrap_executable);
    }

  self->workarounds = pv_get_workarounds (self->bwrap_flags,
                                          _srt_const_strv (self->original_environ));

  if (self->options.for_steam_client
      && !(self->workarounds & PV_WORKAROUND_FLAGS_LIMIT_SHARED_DIRS))
    {
      static const char * const host_filesystems[] = { "host", "host-root" };

      for (size_t i = 0; i < G_N_ELEMENTS (host_filesystems); i++)
        {
          const char *fs = host_filesystems[i];

          if (!pv_wrap_context_has_filesystem (self, fs, NULL))
            pv_wrap_options_set_filesystem (&self->options, fs,
                                            FLATPAK_FILESYSTEM_MODE_READ_WRITE);
        }
    }

  return TRUE;
}

/*
 * Return %TRUE if @path might appear in `XDG_DATA_DIRS`, etc. as part of
 * the operating system, and should not trigger warnings on that basis.
 */
static gboolean
is_os_path (const char *path)
{
  static const char * const os_paths[] =
  {
    "/etc",
    "/run",
    "/var",
    "/usr",
  };
  size_t i;

  for (i = 0; i < G_N_ELEMENTS (os_paths); i++)
    {
      if (_srt_get_path_after (path, os_paths[i]) != NULL)
        return TRUE;
    }

  return FALSE;
}

/*
 * export_not_allowed:
 * @self: The context
 * @path: The path we propose to export
 * @reserved_path: The reserved path preventing us from exporting @path
 * @source: The environment variable or --option where we found @path
 * @before: "...:" to represent other entries in a colon-delimited
 *  environment variable, or empty
 * @after: ":..." to represent other entries in a colon-delimited
 *  environment variable, or empty
 * @flags: Flags affecting how we log
 *
 * Log either a warning or an informational message saying that @path
 * will not be exported.
 */
static void
export_not_allowed (PvWrapContext *self,
                    const char *path,
                    const char *reserved_path,
                    const char *source,
                    const char *before,
                    const char *after,
                    PvWrapExportFlags flags)
{
  GLogLevelFlags log_level;

  if ((flags & PV_WRAP_EXPORT_FLAGS_OS_QUIET) && is_os_path (path))
    {
      /* Don't warn loudly about e.g. /usr/share in XDG_DATA_DIRS */
      log_level = G_LOG_LEVEL_INFO;
    }
  else
    {
      if (self->paths_not_exported == NULL)
        self->paths_not_exported = g_hash_table_new_full (g_str_hash,
                                                          g_str_equal,
                                                          g_free,
                                                          NULL);

      if (g_hash_table_lookup_extended (self->paths_not_exported,
                                        path, NULL, NULL))
        {
          /* We already warned about this path, de-escalate subsequent
           * warnings to INFO level */
          log_level = G_LOG_LEVEL_INFO;
        }
      else
        {
          /* Warn the first time */
          log_level = G_LOG_LEVEL_WARNING;
          g_hash_table_add (self->paths_not_exported, g_strdup (path));
        }
    }

  g_log (G_LOG_DOMAIN, log_level,
         "Not sharing path %s=\"%s%s%s\" with container because "
         "\"%s\" is reserved by the container framework",
         source, before, path, after, reserved_path);
}

/*
 * pv_wrap_context_export_if_allowed:
 * @self: The context
 * @export_mode: Mode with which to add @path
 * @path: The path we propose to export, as an absolute path within the
 *  current execution environment
 * @host_path: @path represented as an absolute path on the host system
 * @source: The environment variable or --option where we found @path
 * @before: (nullable): "...:" to represent other entries in a colon-delimited
 *  environment variable, or empty or %NULL
 * @after: (nullable): ":..." to represent other entries in a colon-delimited
 *  environment variable, or empty or %NULL
 * @flags: Flags affecting how we do it
 *
 * If @path can be exported (shared with the container), do so.
 * Otherwise, log a warning or informational message as appropriate.
 *
 * Returns: %TRUE if exporting the path is allowed
 */
gboolean
pv_wrap_context_export_if_allowed (PvWrapContext *self,
                                   FlatpakFilesystemMode export_mode,
                                   const char *path,
                                   const char *host_path,
                                   const char *source,
                                   const char *before,
                                   const char *after,
                                   PvWrapExportFlags flags)
{
  const char * const *reserved_paths = pv_get_reserved_paths ();
  size_t i;

  g_return_val_if_fail (PV_IS_WRAP_CONTEXT (self), FALSE);
  g_return_val_if_fail (self->exports != NULL, FALSE);
  g_return_val_if_fail (export_mode > FLATPAK_FILESYSTEM_MODE_NONE, FALSE);
  g_return_val_if_fail (export_mode <= FLATPAK_FILESYSTEM_MODE_LAST, FALSE);
  g_return_val_if_fail (g_path_is_absolute (path), FALSE);
  g_return_val_if_fail (g_path_is_absolute (host_path), FALSE);
  g_return_val_if_fail (source != NULL, FALSE);

  if (before == NULL)
    before = "";

  if (after == NULL)
    after = "";

  for (i = 0; reserved_paths[i] != NULL; i++)
    {
      if (_srt_get_path_after (path, reserved_paths[i]) != NULL)
        {
          export_not_allowed (self, path, reserved_paths[i],
                              source, before, after, flags);
          return FALSE;
        }

      if (_srt_get_path_after (reserved_paths[i], path) != NULL)
        {
          export_not_allowed (self, path, reserved_paths[i],
                              source, before, after, flags);
          return FALSE;
        }
    }

  if (g_strcmp0 (path, host_path) == 0)
    g_info ("Bind-mounting %s=\"%s%s%s\" into the container",
            source, before, path, after);
  else
    g_info ("Bind-mounting %s=\"%s%s%s\" from the current environment "
            "as %s=\"%s%s%s\" on the host and in the container",
            source, before, path, after,
            source, before, host_path, after);

  /* This generally shouldn't fail in practice, because we already checked
   * against reserved_paths[] above */
  pv_exports_expose_or_log (self->exports, export_mode, path);

  return TRUE;
}

/*
 * pv_wrap_context_maybe_wrap_in_launcher:
 * @payload_command: The execution environment, possibly already including
 *  wrappers such as an emulator
 * @container_env: Alterations to environment variables inside the container
 * @emulator: The emulator in use, or %NULL
 * @layer: One of the possible values for `compatmanager_layer_name`
 *  and `$STEAM_COMPAT_LAUNCHER_SERVICE`, as documented
 *  in `docs/steam-compat-tool-interface.md`
 *
 * If the environment variables in @self indicate that @layer
 * should be wrapped in `s-r-launcher-service(1)`, append arguments that
 * will do so.
 */
static void
pv_wrap_context_maybe_wrap_in_launcher (PvWrapContext *self,
                                        FlatpakBwrap *payload_command,
                                        SrtEnvOverlay *container_env,
                                        SrtEmulator *emulator,
                                        const char *layer)
{
  const char *helper_tuple;
  const char * const *options;
  size_t n_options = 0;
  const char *value;

  g_return_if_fail (PV_IS_WRAP_CONTEXT (self));
  g_return_if_fail (payload_command != NULL);
  g_return_if_fail (container_env != NULL);
  g_return_if_fail (layer != NULL);

  value = g_environ_getenv (self->original_environ,
                            STEAM_COMPAT_LAUNCHER_SERVICE_ENVVAR);

  if (value == NULL || !g_str_equal (value, layer))
    return;

  if (emulator != NULL)
    {
      const GQuark *emulated_archs;

      emulated_archs = _srt_emulator_get_emulated_architectures (emulator, NULL);
      g_return_if_fail (emulated_archs[0] != SRT_ARCHITECTURE_QUARK_NONE);
      helper_tuple = g_quark_to_string (emulated_archs[0]);
    }
  else
    {
      const GQuark *supported_archs;

      supported_archs = pv_wrap_options_get_architectures (&self->options, NULL);
      g_return_if_fail (supported_archs[0] != SRT_ARCHITECTURE_QUARK_NONE);
      helper_tuple = g_quark_to_string (supported_archs[0]);
    }

  options = _srt_launcher_interface_get_options (&n_options);
  g_return_if_fail (n_options < INT_MAX);
  g_return_if_fail (options[n_options] == NULL);

  flatpak_bwrap_add_arg_printf (payload_command,
                                "%s/%s-srt-launcher-service",
                                pv_wrap_context_get_helpers_dir_in_container (self),
                                helper_tuple);

  if (_srt_util_is_debugging ())
    flatpak_bwrap_add_arg (payload_command, "--verbose");

  flatpak_bwrap_append_argsv (payload_command, (char **) options, (int) n_options);
  flatpak_bwrap_add_arg (payload_command, "--");

  /* If we run steam-runtime-launcher-interface-0 with the same @layer,
   * or if we run this same function again further down the exec chain,
   * don't set up the launcher-service for a second time */
  _srt_env_overlay_set (container_env,
                        STEAM_COMPAT_LAUNCHER_SERVICE_ENVVAR,
                        NULL);
}

/*
 * pv_wrap_context_append_payload_command:
 * @self: The context
 * @argv: (array length=argc): Arbitrary arguments
 * @argc: Number of arguments
 * @payload_command: Argument vector to be used inside the container
 * @container_env: Environment variables to be used inside the container
 * @error: Used to report error on failure
 *
 * Append arguments to @payload_command that will run the "payload"
 * command for the container, and edit @container_env appropriately.
 *
 * If `self->options.launcher` is set, then the arguments that are appended
 * are an invocation of `steam-runtime-launcher-service` with arbitrary
 * arguments.
 *
 * Otherwise, the arguments that are appended are the COMMAND that was
 * passed to `pressure-vessel-wrap(1)`.
 * Typically this is a Steam game, or a compatibility tool like Proton
 * that wraps a game, but during debugging and development it might be
 * something else such as an interactive shell.
 *
 * On entry, @payload_command must either be empty, or contain an
 * "adverb" command that wraps an arbitrary command inside the container.
 *
 * Returns: %TRUE if successful
 */
gboolean
pv_wrap_context_append_payload_command (PvWrapContext *self,
                                        const char * const *argv,
                                        int argc,
                                        FlatpakBwrap *payload_command,
                                        SrtEnvOverlay *container_env,
                                        GError **error)
{
#ifdef _SRT_MULTIARCH
  const char *helpers_dir;
#else
  const char *tools_dir;
#endif

  g_return_val_if_fail (PV_IS_WRAP_CONTEXT (self), FALSE);
  g_return_val_if_fail (argc >= 0, FALSE);
  g_return_val_if_fail (argv != NULL, FALSE);
  g_return_val_if_fail (payload_command != NULL, FALSE);
  g_return_val_if_fail (!pv_bwrap_was_finished (payload_command), FALSE);
  g_return_val_if_fail (container_env != NULL, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  if (!(self->options.launcher || self->options.only_prepare))
    {
      g_return_val_if_fail (argc >= 1, FALSE);
      g_return_val_if_fail (argv[0] != NULL, FALSE);
    }

#ifdef _SRT_MULTIARCH
  helpers_dir = _srt_subprocess_runner_get_helpers_path (self->run_in_current_context);
#else
  tools_dir = _srt_subprocess_runner_get_bin_path (self->run_in_current_context);
#endif

  if (self->options.launcher)
    {
      g_autoptr(FlatpakBwrap) launcher_argv =
        flatpak_bwrap_new (flatpak_bwrap_empty_env);
      g_autofree gchar *launcher_service = NULL;

#ifdef _SRT_MULTIARCH
      launcher_service = g_build_filename (helpers_dir,
                                           _SRT_MULTIARCH "-srt-launcher-service",
                                           NULL);
#else
      launcher_service = g_build_filename (tools_dir,
                                           "steam-runtime-launcher-service",
                                           NULL);
#endif
      g_debug ("Adding steam-runtime-launcher-service '%s'...", launcher_service);
      flatpak_bwrap_add_arg (launcher_argv, launcher_service);

      if (_srt_util_is_debugging ())
        flatpak_bwrap_add_arg (launcher_argv, "--verbose");

      /* In --launcher mode, arguments after the "--" separator are
       * passed to the launcher */
      flatpak_bwrap_append_argsv (launcher_argv, (char **) argv, argc);

      g_warn_if_fail (g_strv_length (launcher_argv->envp) == 0);
      flatpak_bwrap_append_bwrap (payload_command, launcher_argv);
    }
  else
    {
      SrtEmulator *emulator = pv_wrap_context_get_emulator_in_container (self);
      size_t argc_after_emulator = 0;

      /* We don't actually know the architecture of the game we're launching
       * (which could be a chain of scripts and helper executables that
       * eventually ends up at the target executable), but we can assume that
       * Steam wouldn't have told us to use an emulator if not needed.
       *
       * This only sets the argv, not the environment variables (which are
       * placed in container_env by pv_runtime_bind()). */
      if (emulator != NULL)
        {
          const char * const *emulator_argv = _srt_emulator_get_main_argv (emulator);

          flatpak_bwrap_append_argsv (payload_command,
                                      (char **) emulator_argv, -1);
          argc_after_emulator = payload_command->argv->len;
        }

      /* Similarly, if we want the launcher-service to be able to run a
       * command from the runtime, such as `bash -i`, then we need it to be
       * able to run emulated commands transparently - and that will only
       * work if the launcher-service is, itself, an emulated command.
       * So we stack this immediately after the emulator,
       * and tell it to use the s-r-launcher-service that matches the
       * container's primary architecture. */
      pv_wrap_context_maybe_wrap_in_launcher (self,
                                              payload_command,
                                              container_env,
                                              emulator,
                                              STEAM_COMPAT_LAUNCHER_SERVICE_LAYER_CONTAINER_RUNTIME);

      /* If we're using PRESSURE_VESSEL_SHELL=instead or similar,
       * we stack that after the launcher-service, so that the
       * launcher-service will already be running before the user
       * types `"$@"` at the prompt. */
      switch (self->options.terminal)
        {
          case PV_TERMINAL_XTERM:
            g_debug ("Wrapping command with xterm");
            pv_bwrap_wrap_in_xterm (payload_command,
                                    g_environ_getenv (self->original_environ,
                                                      "XCURSOR_PATH"));
            break;

          /* TTY was already handled by pv_wrap_adverb_assign_stdio() */
          case PV_TERMINAL_TTY:
          case PV_TERMINAL_NONE:
            break;

          /* main() should have replaced AUTO with something else already */
          case PV_TERMINAL_AUTO:
          default:
            g_warn_if_reached ();
            break;
        }

      if (self->options.shell != PV_SHELL_NONE
          || self->options.terminal == PV_TERMINAL_XTERM)
        {
          /* In the (PV_SHELL_NONE, PV_TERMINAL_XTERM) case, just don't let the
           * xterm close before the user has had a chance to see the output */
          pv_bwrap_wrap_interactive (payload_command, self->options.shell);
        }

      /* The emulator most likely won't search the PATH for the
       * executable, so we need to give it an executable that is
       * of an architecture that it emulates, but which *will* search
       * the PATH.
       *
       * However, we only need to do this if we have *not* appended any of our
       * other wrappers, such as s-r-launcher-service. If we did, then
       * it will be one of those that decides what to exec next,
       * and they all do search the path if necessary. */
      if (emulator != NULL
          && argc_after_emulator == payload_command->argv->len)
        {
          if (argc > 0 && strchr (argv[0], '/') == NULL)
            {
              const GQuark *emulated_architectures;

              emulated_architectures =
                _srt_emulator_get_emulated_architectures (emulator, NULL);

              /* As above, we don't know the architecture, so we arbitrarily
               * choose the first one supported by the emulator. */
              g_return_val_if_fail (emulated_architectures[0] != SRT_ARCHITECTURE_QUARK_NONE,
                                    FALSE);
              flatpak_bwrap_add_arg_printf (payload_command, "%s/%s-exec",
                                            pv_wrap_context_get_helpers_dir_in_container (self),
                                            g_quark_to_string (emulated_architectures[0]));
              flatpak_bwrap_add_arg_printf (payload_command, "--");
            }
        }

      /* In non-"--launcher" mode, arguments after the "--" separator
       * are the command to execute, passed to the adverb (or an intermediate
       * command such as s-r-launcher-service) after its own "--" argument.
       * Because we always use a wrapper that we control (and for example
       * we don't pass the user-supplied command directly to a system copy
       * of bwrap), we don't need to worry about whether argv[0]
       * starts with "-". */
      flatpak_bwrap_append_argsv (payload_command, (char **) argv, argc);
    }

  return TRUE;
}
