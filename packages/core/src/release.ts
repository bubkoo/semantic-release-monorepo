import _ from 'lodash'
import semanticRelease from 'semantic-release'
import { dirname } from 'path'
import { Signale } from 'signale'
import { check } from './blork.js'
import { getManifest } from './manifest.js'
import { Synchronizer } from './synchronizer.js'
import { toAbsolutePath } from './util.js'
import { RescopedStream } from './rescoped-stream.js'
import { getOptions, getSemanticConfig } from './options.js'
import { MSRContext, Flags, Options, Package, Context } from './types.js'
import { CreateInlinePlugins, makeInlinePluginsCreator } from './plugins.js'

export async function releasePackages(
  paths: string[],
  inputOptions: semanticRelease.Options,
  flags: Flags,
  { cwd, env, stdout, stderr }: Context,
  logger: Signale,
) {
  check(paths, 'paths: string[]')
  check(cwd, 'cwd: directory')
  check(env, 'env: objectlike')
  check(stdout, 'stdout: stream')
  check(stderr, 'stderr: stream')

  // eslint-disable-next-line no-param-reassign
  cwd = toAbsolutePath(cwd)

  logger.start(`Loading ${paths.length} packages...`)

  const globalOptions = await getOptions(cwd)
  const context: MSRContext = {
    globalOptions,
    inputOptions,
    cwd,
    env,
    stdout,
    stderr,
  }

  // Load packages from paths
  const allPackages = await Promise.all(
    paths.map((path) => getPackage(path, context)),
  )
  const packages = allPackages.filter((pkg) => {
    if (flags.ignorePrivatePackages && pkg.manifest.private === true) {
      logger.info(`[${pkg.name}] is private, will be ignored`)
      return false
    }
    return true
  })

  packages.forEach((pkg) => {
    pkg.localDeps = _.uniq(
      pkg.deps
        .map((dep) => packages.find((pkg) => dep === pkg.name))
        .filter((pkg) => pkg != null) as Package[],
    )
    logger.success(`Loaded package ${pkg.name}`)
  })

  logger.start(`Queued ${packages.length} packages! Starting release...`)

  const synchronizer = new Synchronizer(packages)
  const createInlinePlugins = makeInlinePluginsCreator(
    packages,
    context,
    synchronizer,
    flags,
  )

  await Promise.all(
    packages.map(async (pkg) => {
      if (flags.sequential) {
        synchronizer.getLucky('readyForRelease', pkg)
        await synchronizer.waitFor('readyForRelease', pkg)
      }

      return releasePackage(pkg, createInlinePlugins, context, flags)
    }),
  )

  const numReleased = packages.filter((pkg) => pkg.result != null).length
  logger.complete(
    `Released ${numReleased} of ${packages.length} packages, semantically!`,
  )

  return packages
}

async function getPackage(
  path: string,
  { globalOptions, inputOptions, env, cwd, stdout, stderr }: MSRContext,
): Promise<Package> {
  // eslint-disable-next-line no-param-reassign
  path = toAbsolutePath(path, cwd)
  const dir = dirname(path)
  const manifest = getManifest(path)
  const name = manifest.name

  // get all dependency names
  const deps = Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  })

  // Load the package-specified options
  const pkgOptions = await getOptions(dir)

  // The `finalOptions` are the global options merged with package-specified
  // options. The package-specified options can override global options.
  const finalOptions = {
    ...globalOptions,
    ...pkgOptions,
    ...inputOptions,
  }

  // Make a fake logger so semantic-release's get-config doesn't fail.
  const logger = { error() {}, log() {} }

  // Use semantic-release's internal config to get the plugins object and the
  // package options including defaults. We need this so we can call e.g.
  // `plugins.analyzeCommit()` to be able to affect the input and output of
  // the whole set of plugins.
  const { options, plugins } = await getSemanticConfig(
    { cwd: dir, env, stdout, stderr, logger },
    finalOptions,
  )

  return {
    path,
    dir,
    name,
    manifest,
    deps,
    localDeps: [], // will be updated in the next step
    localDepsChanged: [], // will be updated in the next step
    options,
    plugins,
    logger,
    status: {},
  }
}

async function releasePackage(
  pkg: Package,
  createInlinePlugins: CreateInlinePlugins,
  context: MSRContext,
  flags: Flags,
) {
  const { options: pkgOptions, name, dir } = pkg
  const { env, stdout, stderr } = context

  // Make an 'inline plugin' for this package.
  // The inline plugin is the only plugin we call `semanticRelease()` with.
  const inlinePlugins = createInlinePlugins(pkg)

  // Set the options that we call semanticRelease() with.
  // This consists of:
  // - The global options (e.g. from the top level package.json)
  // - The package options (e.g. from the specific package's package.json)
  // TODO filter flags
  const options: Options = {
    ...flags,
    ...pkgOptions,
    ...inlinePlugins,
    pkgOptions,
    tagFormat: `${name}@\${version}`,
  }

  // Call `semanticRelease()` on the directory and save result to pkg.
  // No need to log out errors as semantic-release already does that.
  pkg.result = await semanticRelease(options, {
    env,
    cwd: dir,
    stdout: RescopedStream.create(stdout, name),
    stderr: RescopedStream.create(stderr, name),
  })
}
