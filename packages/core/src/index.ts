import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import SemanticRelease from 'semantic-release'
import { getLogger } from './logger.js'
import { releasePackages } from './release.js'
import { Context, SRMOptions as Options } from './types.js'
import { getManifest, getManifestPaths } from './manifest.js'
import { enableDebugger, getDebugger } from './debugger.js'

const debug = getDebugger('options')

async function release(
  srmOptions: Options = {},
  srOptions: SemanticRelease.Options = {},
  context: Context = {
    cwd: process.cwd(),
    env: process.env as { [name: string]: string },
    stdout: process.stdout,
    stderr: process.stderr,
  },
) {
  enableDebugger(srmOptions.debug || context.env.SRM_DEBUG)
  const logger = getLogger(context)
  const filename = fileURLToPath(import.meta.url)
  const dirname = path.dirname(filename)
  const srmPkgJSON = getManifest(path.resolve(dirname, `../package.json`))

  try {
    logger.info(`Running srm version ${srmPkgJSON.version}`)
    logger.info(`Load packages from: ${context.cwd}`)

    debug(JSON.stringify(srmOptions, null, 2))

    const paths = getManifestPaths(context.cwd, srmOptions.ignorePackages)
    await releasePackages(paths, srOptions, srmOptions, context, logger)
    process.exit(0)
  } catch (error) {
    logger.error(`[srm]:`, error)
    process.exit(1)
  }
}

export { Options }
export { release }

export default release
