# Copyright 2019-2025 Collabora Ltd.
# SPDX-License-Identifier: MIT

man5 = [
  'steam-runtime-emulator.json',
]

if build_gtk_doc
  subdir('reference')
endif

if build_man_pages
  foreach man : man5
    custom_target(
      man + '.5',
      build_by_default : true,
      command : [
        pandoc,
        '-s',
        '-o', '@OUTPUT@',
        '-f', pandoc_markdown_nosmart,
        '-t', 'man',
        '@INPUT@',
      ],
      input : man + '.5.md',
      output : man + '.5',
      install : true,
      install_dir : join_paths(get_option('prefix'), get_option('mandir'), 'man5'),
    )
  endforeach
endif
