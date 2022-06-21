require('@semantic-release/commit-analyzer')
require('@semantic-release/release-notes-generator')
require('@semantic-release/npm')
require('@semantic-release/github')
require('@semantic-release/git')
require('@semantic-release/changelog')
const core = require('@actions/core')
const github = require('@actions/github')
const { release } = require('@semantic-release-monorepo/core')

function getInput(name, options) {
  return core.getInput(name, options) || undefined
}

function getBooleanInput(name, options) {
  return core.getInput(name, options) === 'true'
}

function getSRMOptions() {
  const ignorePackagesRaw = core.getInput('ignorePackages')
  const ignorePackages = ignorePackagesRaw
    .split(ignorePackagesRaw.indexOf(',') >= 0 ? ',' : /\s+/g)
    .map((str) => str.trim())
    .filter((str) => str.length > 0)

  return {
    debug: getBooleanInput('debug'),
    dryRun: getBooleanInput('dryRun'),
    sequential: getBooleanInput('sequential'),
    firstParent: getBooleanInput('firstParent'),
    ignorePackages,
    ignorePrivatePackages: getBooleanInput('ignorePrivatePackages'),
    deps: {
      bump: getInput('deps_bump'),
      prefix: getInput('deps_prefix'),
      release: getInput('deps_release'),
    },
  }
}

try {
  console.warn(github, core, process.cwd(), process.env)
  const srmOptions = getSRMOptions()
  core.info(JSON.stringify(srmOptions))
  release(srmOptions)
} catch (e) {
  core.error(e)
  core.setFailed(e.message)
}
