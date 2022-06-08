import _ from 'lodash'
import { getManifest } from './manifest.js'
import { Package, PrepareContext } from './types.js'
import { toAbsolutePath } from './util.js'

/**
 * Return all the 'pkgRoot' options from plugins.
 *
 * This option primarily comes from the `@semantic-release/npm` plugin and
 * represents the directory path to publish.
 * @see https://github.com/semantic-release/npm#options
 */
function getPkgRoots(context: PrepareContext) {
  // currently loaded plugins
  const plugins = context.options.plugins ? context.options.plugins : []
  // Parse every plugin configuration and look for a `pkgRoot` option.
  return plugins.reduce<string[]>((memo, plugin) => {
    let config: any
    if (_.isArray(plugin) && plugin.length > 1) {
      config = plugin[1]
    } else if (_.isPlainObject(plugin) && !_.isNil((plugin as any).path)) {
      config = plugin
    }
    // Keep any `pkgRoot` option that might exists but avoid duplicates.
    if (config && config.pkgRoot && !memo.includes(config.pkgRoot)) {
      memo.push(config.pkgRoot)
    }
    return memo
  }, [])
}

export function getRootPkgs(
  context: PrepareContext,
  pkgExtras: { localDepsChanged: Package[] },
) {
  return getPkgRoots(context).map((pkgRootPath) => {
    const path = toAbsolutePath(`${pkgRootPath}/package.json`, context.cwd)
    const manifest = getManifest(path)
    return { path, manifest, ...pkgExtras }
  }) as any as Package[]
}
