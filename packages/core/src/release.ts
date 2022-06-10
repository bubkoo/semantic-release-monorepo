import _ from 'lodash'
import signale, { Signale } from 'signale'
import semanticRelease from 'semantic-release'
import semanticGetConfig from 'semantic-release/lib/get-config.js'
import { WritableStreamBuffer } from 'stream-buffers'
import { dirname } from 'path'
import { check } from './blork.js'
import {
  Logger,
  MSRContext,
  MSROptions,
  Options,
  Package,
  Context,
} from './types.js'
import { getOptions, getSuccessComment } from './options.js'
import { getManifest } from './manifest.js'
import { Synchronizer } from './synchronizer.js'
import { toAbsolutePath } from './util.js'
import { RescopedStream } from './rescoped-stream.js'
import { CreateInlinePlugins, makeInlinePluginsCreator } from './plugins.js'

export async function releasePackages(
  paths: string[],
  inputOptions: semanticRelease.Options,
  msrOptions: MSROptions,
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
    paths.map((path) => loadPackage(path, context, msrOptions)),
  )
  const packages = allPackages.filter((pkg) => {
    if (msrOptions.ignorePrivatePackages && pkg.manifest.private === true) {
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
    msrOptions,
  )

  await Promise.all(
    packages.map(async (pkg) => {
      if (msrOptions.sequential) {
        synchronizer.getLucky('readyForRelease', pkg)
        await synchronizer.waitFor('readyForRelease', pkg)
      }

      return releasePackage(pkg, createInlinePlugins, context, msrOptions)
    }),
  )

  const numReleased = packages.filter((pkg) => pkg.result != null).length
  logger.complete(
    `Released ${numReleased} of ${packages.length} packages, semantically!`,
  )

  return packages
}

async function releasePackage(
  pkg: Package,
  createInlinePlugins: CreateInlinePlugins,
  context: MSRContext,
  msrOptions: MSROptions,
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
  const options: Options = {
    ...msrOptions,
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

async function loadPackage(
  path: string,
  { globalOptions, inputOptions, env, cwd, stdout, stderr }: MSRContext,
  msrOptions: MSROptions,
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
    msrOptions,
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

export async function getSemanticConfig(
  {
    cwd,
    env,
    stdout,
    stderr,
    logger,
  }: {
    cwd: string
    env: { [name: string]: string }
    stdout: NodeJS.WriteStream
    stderr: NodeJS.WriteStream
    logger: Logger
  },
  options: semanticRelease.Options,
  msrOptions: MSROptions,
) {
  try {
    // blackhole logger (don't output verbose messages).
    const blackhole = new signale.Signale({
      stream: new WritableStreamBuffer() as any,
    })

    const options1 = _.cloneDeep(options)
    const options2 = _.cloneDeep(options)
    const githubPlugin = '@semantic-release/github'
    if (options1.plugins) {
      options1.plugins = options1.plugins.map((plugin) => {
        if (Array.isArray(plugin)) {
          const pluginName = plugin[0]
          const pluginOptions = plugin[1] || {}
          if (pluginName === githubPlugin) {
            return [pluginName, { ...pluginOptions, successComment: false }]
          }
        }

        if (plugin === githubPlugin) {
          return [plugin, { successComment: false }]
        }

        return plugin
      })
    }

    if (options2.plugins) {
      options2.plugins = options2.plugins.map((plugin) => {
        if (Array.isArray(plugin)) {
          const pluginName = plugin[0]
          const pluginOptions = plugin[1] || {}
          if (pluginName === githubPlugin) {
            const successComment =
              pluginOptions.successComment ||
              getSuccessComment(msrOptions.successCommentFooter)
            return [
              pluginName,
              { ...pluginOptions, successComment, addReleases: false },
            ]
          }
        }

        if (plugin === githubPlugin) {
          const successComment = getSuccessComment(
            msrOptions.successCommentFooter,
          )
          return [plugin, { successComment, addReleases: false }]
        }

        return plugin
      })
    }

    const context = { cwd, env, stdout, stderr, logger: blackhole }
    const ret1 = await semanticGetConfig(context, options1)
    const ret2 = await semanticGetConfig(context, options2)
    return {
      ...ret1,
      plugins: {
        ...ret1.plugins,
        successWithoutComment: ret1.plugins.success,
        successWithoutReleaseNote: ret2.plugins.success,
      },
    }
  } catch (error) {
    logger.error(`Error in semanticGetConfig(): %0`, error)
    throw error
  }
}
