/*
 * Copyright © 2025 Collabora Ltd.
 * SPDX-License-Identifier: MIT
 */

#include "steam-runtime-tools/emulator-private.h"

#include "steam-runtime-tools/architecture-internal.h"
#include "steam-runtime-tools/json-glib-backports-internal.h"
#include "steam-runtime-tools/json-utils-internal.h"
#include "steam-runtime-tools/utils-internal.h"

static gboolean
manifest_read_argv (JsonObject *object,
                    const char *member_name,
                    const char *real_manifest,
                    GStrv *argv_out,
                    GError **error)
{
  g_auto(GStrv) argv = NULL;
  JsonNode *member;

  g_return_val_if_fail (argv_out != NULL, FALSE);
  g_return_val_if_fail (*argv_out == NULL, FALSE);

  member = json_object_get_member (object, member_name);

  if (member == NULL)
    return TRUE;

  if (JSON_NODE_HOLDS_ARRAY (member))
    {
      JsonArray *array = json_node_get_array (member);
      size_t len = json_array_get_length (array);

      argv = g_new0 (char *, len + 1);

      for (size_t i = 0; i < len; i++)
        {
          JsonNode *element = json_array_get_element (array, i);
          const char *s = json_node_get_string (element);

          if (s == NULL)
            return glnx_throw (error, "Elements of %s array must be strings",
                               member_name);

          argv[i] = g_strdup (s);
        }

      argv[len] = NULL;
    }
  else if (JSON_NODE_HOLDS_VALUE (member))
    {
      const char *s = json_node_get_string (member);

      if (s == NULL)
        return glnx_throw (error, "%s must be an array or a string",
                           member_name);

      if (!g_shell_parse_argv (s, NULL, &argv, error))
        return FALSE;
    }
  else
    {
      return glnx_throw (error, "%s must be an array or a string",
                         member_name);
    }

  if (argv == NULL || argv[0] == NULL)
    return glnx_throw (error, "%s array must not be empty", member_name);

  /* TODO: Should "argv": ["myexe"] mean ./myexe or search PATH for myexe?
   * For now we just don't allow it, and we can give it one of those
   * meanings later, if desired */
  if (strchr (argv[0], '/') == NULL)
    return glnx_throw (error,
                       "Executable \"%s\" in %s must contain a slash (use ./exe if necessary)",
                       argv[0], member_name);

  if (!g_path_is_absolute (argv[0]))
    {
      g_autofree char *real_dir = g_path_get_dirname (real_manifest);
      g_autofree char *argv0 = g_steal_pointer (&argv[0]);
      const char *exe = argv0;

      if (g_str_has_prefix (exe, "./"))
        exe += 2;

      while (exe[0] == '/')
        exe++;

      argv[0] = g_build_filename (real_dir, exe, NULL);
    }

  *argv_out = g_steal_pointer (&argv);
  return TRUE;
}

typedef struct
{
  const char *object_name;
  SrtEnvOverlay *overlay;
  GError **error;
  gboolean ok;
} ManifestReadEnvironmentData;

static void
foreach_environment_cb (JsonObject *env_object,
                        const char *name,
                        JsonNode *value,
                        void *user_data)
{
  ManifestReadEnvironmentData *data = user_data;
  const char *str = NULL;

  if (!data->ok)
    return;

  if (JSON_NODE_HOLDS_NULL (value))
    {
      _srt_env_overlay_set (data->overlay, name, NULL);
      return;
    }

  if (JSON_NODE_HOLDS_VALUE (value))
    str = json_node_get_string (value);

  if (str == NULL)
    {
      glnx_throw (data->error, "Values in %s must be strings",
                  data->object_name);
      data->ok = FALSE;
      return;
    }

  _srt_env_overlay_set (data->overlay, name, str);
}

static gboolean
manifest_read_environment (JsonObject *object,
                           const char *member_name,
                           SrtEnvOverlay *overlay,
                           GError **error)
{
  ManifestReadEnvironmentData data =
    {
      .object_name = member_name,
      .overlay = overlay,
      .error = error,
      .ok = TRUE,
    };
  JsonNode *member;
  JsonObject *env_object;

  member = json_object_get_member (object, member_name);

  if (member == NULL)
    return TRUE;

  if (!JSON_NODE_HOLDS_OBJECT (member))
    return glnx_throw (error, "%s must be an object", member_name);

  env_object = json_node_get_object (member);
  json_object_foreach_member (env_object, foreach_environment_cb, &data);
  return data.ok;
}

static gboolean
manifest_read_architectures (JsonObject *object,
                             const char *member_name,
                             GArray *architectures,
                             GError **error)
{
  JsonNode *member;
  JsonArray *array;
  size_t len = 0;

  member = json_object_get_member (object, member_name);

  if (member == NULL)
    return TRUE;

  if (!JSON_NODE_HOLDS_ARRAY (member))
    return glnx_throw (error, "%s must be an array", member_name);

  array = json_node_get_array (member);
  len = json_array_get_length (array);

  for (size_t i = 0; i < len; i++)
    {
      JsonNode *element = json_array_get_element (array, i);
      const char *s;
      GQuark arch;

      s = json_node_get_string (element);

      if (s == NULL)
        return glnx_throw (error, "Elements of %s array must be strings",
                           member_name);

      arch = _srt_architecture_guess_from_user_input (s, NULL, error);

      if (arch == SRT_ARCHITECTURE_QUARK_NONE)
        return FALSE;

      g_array_append_vals (architectures, &arch, 1);
    }

  return TRUE;
}

static gboolean
manifest_read_strv (JsonObject *object,
                    const char *member_name,
                    GStrv *strv_out,
                    GError **error)
{
  g_auto(GStrv) strv = NULL;
  JsonNode *member;

  member = json_object_get_member (object, member_name);

  if (member == NULL)
    return TRUE;

  if (JSON_NODE_HOLDS_ARRAY (member))
    {
      JsonArray *array = json_node_get_array (member);
      size_t len = json_array_get_length (array);

      strv = g_new0 (char *, len + 1);

      for (size_t i = 0; i < len; i++)
        {
          JsonNode *element = json_array_get_element (array, i);
          const char *s = json_node_get_string (element);

          if (s == NULL)
            return glnx_throw (error, "Elements of %s array must be strings",
                               member_name);

          strv[i] = g_strdup (s);
        }

      strv[len] = NULL;
    }
  else
    {
      return glnx_throw (error, "%s must be an array if present", member_name);
    }

  *strv_out = g_steal_pointer (&strv);
  return TRUE;
}

SrtEmulator *
_srt_emulator_new_from_manifest (const char *path,
                                 GError **error)
{
  GLNX_AUTO_PREFIX_ERROR (path, error);
  g_autoptr(GArray) emulated_architectures = _srt_architecture_array_new ();
  g_autoptr(GArray) required_architectures = _srt_architecture_array_new ();
  g_autoptr(JsonParser) parser = json_parser_new ();
  g_autoptr(SrtEnvOverlay) environment = _srt_env_overlay_new ();
  g_autoptr(SrtEnvOverlay) container_environment = _srt_env_overlay_new ();
  g_auto(GStrv) argv = NULL;
  g_auto(GStrv) container_argv = NULL;
  g_auto(GStrv) main_argv = NULL;
  g_auto(GStrv) server_argv = NULL;
  g_auto(GStrv) required_libraries = NULL;
  g_autofree char *real_manifest = NULL;
  JsonNode *member;
  JsonNode *root;
  JsonObject *object;
  JsonObject *root_object;

  real_manifest = realpath (path, NULL);

  if (real_manifest == NULL)
    return glnx_null_throw_errno (error);

  if (!json_parser_load_from_file (parser, real_manifest, error))
    return NULL;

  root = json_parser_get_root (parser);

  if (root == NULL || !JSON_NODE_HOLDS_OBJECT (root))
    return glnx_null_throw (error, "Top level must be a JSON object");

  root_object = json_node_get_object (root);

  member = json_object_get_member (root_object, "emulator_v0");

  if (member == NULL || !JSON_NODE_HOLDS_OBJECT (member))
    return glnx_null_throw (error, "emulator_v0 member is missing or not an object");

  object = json_node_get_object (member);

  if (!manifest_read_argv (object, "argv", real_manifest, &argv, error))
    return NULL;

  if (argv == NULL)
    return glnx_null_throw (error, "Does not declare argv");

  g_assert (argv[0] != NULL);

  if (!manifest_read_argv (object, "container_argv", real_manifest,
                           &container_argv, error))
    return NULL;

  if (!manifest_read_argv (object, "main_argv", real_manifest,
                           &main_argv, error))
    return NULL;

  if (!manifest_read_argv (object, "server_argv", real_manifest,
                           &server_argv, error))
    return NULL;

  if (!manifest_read_architectures (object, "emulated_architectures",
                                    emulated_architectures, error))
    return NULL;

  if (emulated_architectures->len == 0)
    return glnx_null_throw (error, "Does not declare support for any architectures");

  /* Possibly NULL or empty, that's OK */
  if (!manifest_read_strv (object, "required_libraries",
                           &required_libraries, error))
    return NULL;

  /* Unlike emulated_architectures, it's OK if this array is missing
   * or empty, in which case we assume the emulator is statically linked
   * and doesn't need any glibc support */
  if (!manifest_read_architectures (object, "required_architectures",
                                    required_architectures, error))
    return NULL;

  if (!manifest_read_environment (object, "environment", environment, error))
    return NULL;

  if (!manifest_read_environment (object, "container_environment",
                                  container_environment, error))
    return NULL;

  return _srt_emulator_new (_srt_const_strv (argv),
                            _srt_const_strv (container_argv),
                            container_environment,
                            emulated_architectures,
                            environment,
                            _srt_const_strv (main_argv),
                            real_manifest,
                            required_architectures,
                            _srt_const_strv (required_libraries),
                            _srt_const_strv (server_argv));
}

static void
builder_emit_architectures (JsonBuilder *builder,
                            const GQuark *architectures,
                            size_t n)
{
  json_builder_begin_array (builder);
    {
      for (size_t i = 0; i < n; i++)
        json_builder_add_string_value (builder,
                                       g_quark_to_string (architectures[i]));
    }
  json_builder_end_array (builder);
}

static void
builder_emit_environment (JsonBuilder *builder,
                          SrtEnvOverlay *overlay)
{
  json_builder_begin_object (builder);
    {
      g_autoptr(GList) vars = _srt_env_overlay_get_vars (overlay);
      const GList *iter;

      for (iter = vars; iter != NULL; iter = iter->next)
        {
          const char *var = iter->data;

          json_builder_set_member_name (builder, var);
          json_builder_add_string_value (builder,
                                         _srt_env_overlay_get (overlay, var));
        }
    }
  json_builder_end_object (builder);
}

/*
 * Return a JSON manifest representing @self, with no trailing newline.
 */
gchar *
_srt_emulator_serialize_manifest (SrtEmulator *self)
{
  g_autoptr(JsonBuilder) builder = json_builder_new ();
  g_autoptr(JsonGenerator) generator = json_generator_new ();
  g_autoptr(JsonNode) root = NULL;

  g_return_val_if_fail (SRT_IS_EMULATOR (self), NULL);

  json_builder_begin_object (builder);
    {
      json_builder_set_member_name (builder, "emulator_v0");
      json_builder_begin_object (builder);
        {
          _srt_json_builder_add_strv_value (builder, "argv",
                                            _srt_const_strv (self->argv),
                                            /* can't be NULL or empty so
                                             * this parameter doesn't
                                             * actually matter */
                                            FALSE);
          _srt_json_builder_add_strv_value (builder, "container_argv",
                                            _srt_const_strv (self->container_argv),
                                            /* emit nothing if NULL */
                                            FALSE);
          _srt_json_builder_add_strv_value (builder, "main_argv",
                                            _srt_const_strv (self->main_argv),
                                            /* emit nothing if NULL */
                                            FALSE);
          _srt_json_builder_add_strv_value (builder, "server_argv",
                                            _srt_const_strv (self->server_argv),
                                            /* emit nothing if NULL */
                                            FALSE);

          json_builder_set_member_name (builder, "environment");
          builder_emit_environment (builder, self->environment);
          json_builder_set_member_name (builder, "container_environment");
          builder_emit_environment (builder, self->container_environment);

          json_builder_set_member_name (builder, "emulated_architectures");
          builder_emit_architectures (builder,
                                      self->emulated_architectures,
                                      self->n_emulated_architectures);

          json_builder_set_member_name (builder, "required_architectures");
          builder_emit_architectures (builder,
                                      self->required_architectures,
                                      self->n_required_architectures);

          _srt_json_builder_add_strv_value (builder, "required_libraries",
                                            _srt_const_strv (self->required_libraries),
                                            /* emit nothing if NULL or empty */
                                            FALSE);
        }
      json_builder_end_object (builder);
    }
  json_builder_end_object (builder);

  root = json_builder_get_root (builder);
  json_generator_set_root (generator, root);
  json_generator_set_pretty (generator, TRUE);
  return json_generator_to_data (generator, NULL);
}

/*
 * Write a JSON manifest representing @self to @path.
 */
gboolean
_srt_emulator_write_manifest (SrtEmulator *self,
                              const char *path,
                              GError **error)
{
  g_autofree gchar *json_output = _srt_emulator_serialize_manifest (self);
  size_t len;

  g_return_val_if_fail (json_output != NULL, FALSE);
  len = strlen (json_output);
  g_assert (json_output[len] == '\0');
  json_output[len] = '\n';
  return g_file_set_contents (path, json_output, len + 1, error);
}
