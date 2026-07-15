# Copyright © 2019-2020 Collabora Ltd.
#
# SPDX-License-Identifier: MIT
#
# Permission is hereby granted, free of charge, to any person obtaining
# a copy of this software and associated documentation files (the
# "Software"), to deal in the Software without restriction, including
# without limitation the rights to use, copy, modify, merge, publish,
# distribute, sublicense, and/or sell copies of the Software, and to
# permit persons to whom the Software is furnished to do so, subject to
# the following conditions:
#
# The above copyright notice and this permission notice shall be included
# in all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
# EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
# MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
# IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
# CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
# TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
# SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

pv_tests_dir = tests_dir / 'pressure-vessel'

test_env = environment(common_test_env_vars + uninstalled_env_vars)
test_env.set('G_TEST_SRCDIR', meson.current_source_dir())
test_env.set('G_TEST_BUILDDIR', meson.current_build_dir())
test_env.set(
  'PRESSURE_VESSEL_TEST_CONTAINERS',
  get_option('test_containers_dir'),
)
test_env.prepend('PYTHONPATH', meson.current_source_dir() / '..')

if get_option('installed_tests')
  install_subdir('mock-drivers', install_dir: pv_tests_dir)
  install_subdir('mock-emulators', install_dir: pv_tests_dir)
endif

# Helper programs and manual tests
helpers = [
  'cheap-copy',
  'mtree-apply',
]

foreach helper : helpers
  test_depends += executable(
    'test-' + helper,
    sources : [
      helper + '.c',
    ],
    dependencies : [
      gio_unix,
      json_glib,
      libglnx_dep,
      test_utils_static_libsteamrt_dep,
    ],
    link_with : [
      pressure_vessel_utils,
    ],
    include_directories : pv_include_dirs,
    install : get_option('installed_tests'),
    install_dir : pv_tests_dir,
  )
endforeach

tests = [
  'adverb.py',
  'cheap-copy.py',
  'invocation.py',
  'mtree-apply.py',
  'test-locale-gen.sh',
  'verify.py',
]

containers_tests = [
  'no-runtime.py',
  'scout-sysroot.py',
  'scout-usr.py',
  'soldier-sysroot.py',
  'soldier-usr.py',
]

compiled_tests = [
  {'name': 'adverb-preload', 'adverb': true},
  {'name': 'adverb-sdl', 'adverb': true},
  {'name': 'bwrap', 'wrap': true},
  {'name': 'graphics-provider', 'wrap': true},
  {'name': 'wrap-setup', 'wrap': true},
  {'name': 'utils'},
]

foreach test_info : compiled_tests
  test_name = test_info['name']

  # For whatever reason, linking to both -adverb and -wrap code in a Scout
  # environment results in the json-glib dependency not being found.
  # None of our tests actually need both, so only link to one (or neither).
  if test_info.get('adverb', false)
    pv_dep = pv_adverb_lib_dep
  elif test_info.get('wrap', false)
    pv_dep = pressure_vessel_wrap_lib_dep
  else
    pv_dep = pressure_vessel_utils_dep
  endif

  exe = executable(
    'test-' + test_name,
    files(test_name + '.c'),
    dependencies : [
      gio_unix,
      libglnx_dep,
      # Keep libsteamrt_dep at the bottom to avoid linking errors with Scout
      pv_dep,
      test_utils_static_libsteamrt_dep,
    ],
    include_directories : pv_include_dirs,
    install : get_option('installed_tests'),
    install_dir : pv_tests_dir,
  )
  test(
    test_name, exe,
    args : ['--tap'],
    depends : test_depends,
    env : test_env,
    protocol : 'tap',
    suite : ['pressure-vessel'],
  )
endforeach

foreach test_name : tests + containers_tests
  program = files(test_name)
  suites = ['pressure-vessel']
  test_argv = []
  timeout = 30

  if test_name.endswith('.py')
    suites += 'python'
    test_argv = ['-S', program] + test_argv
    program = python
  endif

  if test_name in ['test-locale-gen.sh'] + containers_tests
    timeout = 90
  endif

  if test_name in containers_tests
    suites += 'containers'
  endif

  test(
    test_name, program,
    args : test_argv,
    depends : test_depends,
    env : test_env,
    protocol : 'tap',
    suite : suites,
    timeout : timeout,
  )

endforeach

if get_option('installed_tests')
  install_data(
    'containers.py',
    'inside-runtime.py',
    'prepare-test-depots.sh',
    'pressure-vessel.supp',
    'relocatable-install.py',
    containers_tests,
    tests,
    install_dir: pv_tests_dir,
  )

  # This file is used in .gitlab-ci.yml to enumerate the available tests
  # without having to rebuild all of steam-runtime-tools on each host OS
  test_conf = configuration_data()
  test_conf.set('TESTS', '\n'.join(containers_tests))
  configure_file(
    input: files('containers-tests.txt.in'),
    output: 'containers-tests.txt',
    install_dir: pv_tests_dir,
    configuration: test_conf,
  )
endif

# vim:set sw=2 sts=2 et:
