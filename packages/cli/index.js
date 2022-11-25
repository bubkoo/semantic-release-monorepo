#!/usr/bin/env node

import _ from 'lodash'
import meow from 'meow'
import { release } from '@semantic-release-monorepo/core'

const cli = meow(
  `
  Usage
    $ srm [options]

  Options
    --debug ······················ Output debugging information
    --dry-run ···················· Dry run mode
    --sequential ················· Avoid hypothetical concurrent initialization collisions
    --first-parent ··············· Apply commit filtering to current branch only
    --deps.bump ·················· Define deps version updating rule.
                                   Allowed: override, satisfy, inherit
    --deps.prefix ················ Optional prefix to be attached to the next dep version
                                   when '--deps.bump' set to 'override'. Supported values:
                                   '^' | '~' | '' (empty string as default)
    --deps.release ··············· Define release type for dependent package if any of its
                                   deps changes.
                                   Supported values: patch, minor, major, inherit
    --gpr ························ Publish to Github Package Registry
    --gpr-scope ·················· The scope of Github Package Registry
                                   Default to the repo owner
    --ignore-packages ············ Packages to be ignored on bumping process
    --ignore-private-packages ···· Ignore private packages
    --comment-footer ············· The footer message in the 'successComment' or 'failComment'
                                   created by "@semantic-release/github" plugin
    --combine-commits ············ Combine the commits of released paclages
    --combined-message-header ···· The header of combined commit message
    --combined-message-body ······ The body of combined commit message
    --version ···················· Show version info
 	  --help ······················· Show help info

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
      combineCommits: {
        type: 'boolean',
      },
      combinedMessageHeader: {
        type: 'string',
      },
      combinedMessageBody: {
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
