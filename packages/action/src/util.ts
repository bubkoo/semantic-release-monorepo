import * as core from '@actions/core'
import { MSROptions } from '@semantic-release-monorepo/core'

function getInput(name: string, options?: core.InputOptions) {
  return core.getInput(name, options) || undefined
}

function getBooleanInput(name: string, options?: core.InputOptions) {
  return core.getInput(name, options) === 'true'
}

export function getMSROptions(): MSROptions {
  const ignorePackagesRaw = core.getInput('ignorePackages')
  const ignorePackages = ignorePackagesRaw.split(
    ignorePackagesRaw.indexOf(',') >= 0 ? ',' : /\s+/g,
  )
  return {
    debug: getBooleanInput('debug'),
    dryRun: getBooleanInput('dryRun'),
    sequential: getBooleanInput('sequential'),
    firstParent: getBooleanInput('firstParent'),
    ignorePackages,
    ignorePrivatePackages: getBooleanInput('ignorePrivatePackages'),
    deps: {
      bump: getInput('deps_bump') as any,
      prefix: getInput('deps_prefix') as any,
      release: getInput('deps_release') as any,
    },
  }
}
