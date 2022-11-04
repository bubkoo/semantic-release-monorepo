#!/usr/bin/env node

import _ from 'lodash'
import meow from 'meow'
import { release } from '@semantic-release-monorepo/core'

const cli = meow(
  `
  Usage
    $ srm [options]

  Options
    --dry-run Dry run mode
    --debug Output debugging information
    --sequential Avoid hypothetical concurrent initialization collisions
    --first-parent Apply commit filtering to current branch only
    --deps.bump Define deps version updating rule. Allowed: override, satisfy, inherit
    --deps.prefix Optional prefix to be attached to the next dep version if '--deps.bump' set to 'override'. Supported values: '^' | '~' | '' (empty string as default)
    --deps.release Define release type for dependent package if any of its deps changes. Supported values: patch, minor, major, inherit
    --ignore-packages Packages list to be ignored on bumping process
    --ignore-private-packages Ignore private packages
    --gpr Publish to Github Package Registry
    --gpr-scope The scope of Github Package Registry, default to the repo owner
    --comment-footer The footer message in the 'successComment' or 'failComment' created by @semantic-release/github plugin
    --version Show version info
	  --help Show help info

  Examples
    $ srm --debug
    $ srm --deps.bump=satisfy --deps.release=patch
    $ srm --ignore-packages=packages/a/**,packages/b/**
`,
  {
    flags: {
      sequential: {
        type: 'boolean',
      },
      firstParent: {
        type: 'boolean',
      },
      debug: {
        type: 'boolean',
      },
      dryRun: {
        type: 'boolean',
      },
      'deps.bump': {
        type: 'string',
        default: 'inherit',
      },
      'deps.release': {
        type: 'string',
        default: 'patch',
      },
      'deps.prefix': {
        type: 'string',
        default: '^',
      },
      ignorePackages: {
        type: 'string',
      },
      ignorePrivatePackages: {
        type: 'boolean',
      },
      gpr: {
        type: 'boolean',
      },
      gprScope: {
        type: 'string',
      },
      commentFooter: {
        type: 'string',
      },
    },
    importMeta: import.meta,
    allowUnknownFlags: true,
    version: true,
  },
)

function processFlags(flags) {
  return _.toPairs(flags).reduce((m, [k, v]) => {
    if (k === 'ignorePackages' && v) return _.set(m, k, v.split(','))
    return _.set(m, k, v)
  }, {})
}

const flags = processFlags(cli.flags)

release(flags)
