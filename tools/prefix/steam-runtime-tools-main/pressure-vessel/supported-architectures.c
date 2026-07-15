/*
 * Copyright © 2020-2022 Collabora Ltd.
 *
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library. If not, see <http://www.gnu.org/licenses/>.
 */

#include "config.h"

#include "supported-architectures.h"

#include "steam-runtime-tools/glib-backports-internal.h"
#include "steam-runtime-tools/utils-internal.h"
#include "steam-runtime-tools/architecture.h"
#include "libglnx.h"

void
pv_architecture_array_populate_from_environ (GArray *arch_quarks)
{
  const char *value;

  value = g_getenv ("PRESSURE_VESSEL_ARCHITECTURES");

  if (value != NULL)
    {
      g_auto(GStrv) entries = g_strsplit (value, ":", -1);
      gsize i;

      for (i = 0; entries != NULL && entries[i] != NULL; i++)
        {
          g_autoptr(GError) local_error = NULL;
          const SrtKnownArchitecture *known;
          GQuark arch_quark;

          arch_quark = _srt_architecture_guess_from_user_input (entries[i],
                                                                &known,
                                                                &local_error);

          if (arch_quark == SRT_ARCHITECTURE_QUARK_NONE)
            {
              g_warning ("%s", local_error->message);
              continue;
            }

          if (g_quark_try_string (entries[i]) != arch_quark)
            g_warning ("Canonicalized architecture \"%s\" to \"%s\"",
                       entries[i], g_quark_to_string (arch_quark));

          if (known == NULL)
            g_message ("Unknown architecture \"%s\", assuming you know what you're doing",
                       g_quark_to_string (arch_quark));

          g_array_append_val (arch_quarks, arch_quark);
        }

      if (arch_quarks->len == 0)
        g_warning ("No valid architectures found in "
                   "$PRESSURE_VESSEL_ARCHITECTURES, will use defaults");
    }
}
