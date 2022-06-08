import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import SemanticRelease from 'semantic-release'
// import srPkgJSON from 'semantic-release/package.json'
import { Context, Flags } from './types.js'
import { getManifest, getManifestPaths } from './manifest.js'
import { getLogger } from './logger.js'
import { enableDebugger } from './debugger.js'
import { releasePackages } from './release.js'

export default function (
  flags: Flags = {},
  options: SemanticRelease.Options = {},
  context: Context = {
    cwd: process.cwd(),
    env: process.env as { [name: string]: string },
    stdout: process.stdout,
    stderr: process.stderr,
  },
) {
  enableDebugger(flags.debug)
  const logger = getLogger(context)
  const filename = fileURLToPath(import.meta.url)
  const dirname = path.dirname(filename)
  const msrPkgJSON = getManifest(path.resolve(dirname, `../package.json`))

  try {
    logger.info(`Running msr version ${msrPkgJSON.version}`)

    const paths = getManifestPaths(context.cwd, flags.ignorePackages)
    releasePackages(paths, options, flags, context, logger).then(
      () => {
        process.exit(0)
      },
      (error) => {
        logger.error(`[msr]:`, error)
        process.exit(1)
      },
    )
  } catch (error) {
    logger.error(`[msr]:`, error)
    process.exit(1)
  }
}
