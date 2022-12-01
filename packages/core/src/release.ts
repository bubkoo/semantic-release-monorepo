import _ from 'lodash'
import path, { dirname } from 'path'
import signale, { Signale } from 'signale'
import semanticRelease from 'semantic-release'
import semanticGetConfig from 'semantic-release/lib/get-config.js'
import { WritableStreamBuffer } from 'stream-buffers'
import { check } from './blork.js'
import {
  Logger,
  SRMContext,
  SRMOptions,
  Options,
  Package,
  Context,
} from './types.js'
import { getManifest } from './manifest.js'
import { Synchronizer } from './synchronizer.js'
import { toAbsolutePath } from './util.js'
import { RescopedStream } from './rescoped-stream.js'
import { COMMIT_NAME, COMMIT_EMAIL } from './constants.js'
import { CreateInlinePlugins, getInlinePluginsCreator } from './plugins.js'
import { getOptions, getSuccessComment, getFailComment } from './options.js'

export async function releasePackages(
  paths: string[],
  localOptions: semanticRelease.Options,
  srmOptions: SRMOptions,
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
  // set the commits author and commiter info
  Object.assign(env, {
    GIT_AUTHOR_NAME: COMMIT_NAME,
    GIT_AUTHOR_EMAIL: COMMIT_EMAIL,
    GIT_COMMITTER_NAME: COMMIT_NAME,
    GIT_COMMITTER_EMAIL: COMMIT_EMAIL,
    ...env,
  })

  logger.start(`Loading ${paths.length} packages...`)

  const globalOptions = await getOptions(cwd)
  const context: SRMContext = {
    cwd,
    env,
    stdout,
    stderr,
    localOptions,
    globalOptions,
  }

  // Load packages from paths
  const allPackages = await Promise.all(
    paths.map((path) => loadPackage(path, context, srmOptions)),
  )
  const packages = allPackages.filter((pkg) => {
    if (srmOptions.ignorePrivatePackages && pkg.manifest.private === true) {
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
  const createInlinePlugins = getInlinePluginsCreator(
    packages,
    context,
    synchronizer,
    srmOptions,
  )

  await Promise.all(
    packages.map(async (pkg) => {
      if (srmOptions.sequential) {
        synchronizer.getLucky('readyForRelease', pkg)
        await synchronizer.waitFor('readyForRelease', pkg)
      }

      return releasePackage(pkg, createInlinePlugins, context, srmOptions)
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
  context: SRMContext,
  srmOptions: SRMOptions,
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
    ...srmOptions,
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
  { globalOptions, localOptions, env, cwd, stdout, stderr }: SRMContext,
  srmOptions: SRMOptions,
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
    ...localOptions,
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
    srmOptions,
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

function makePushToGitMethod(
  context: any,
  parsedOptions: semanticRelease.Options,
  plugin: undefined | string | [string, any],
  srmOptions: SRMOptions,
) {
  // https://github.com/semantic-release/git
  if (plugin) {
    return async (
      branch: semanticRelease.BranchObject,
      releases: {
        package: Package
        lastRelease: semanticRelease.LastRelease
        nextReleases: semanticRelease.Release[]
      }[],
    ) => {
      const pluginName = Array.isArray(plugin) ? plugin[0] : plugin
      const pluginOptions = Array.isArray(plugin) ? plugin[1] || {} : {}
      const cwd = process.cwd()
      const packageDirs = releases.map((r) => path.relative(cwd, r.package.dir))
      const parsedAssets: string[] = []

      let assets: string[] = pluginOptions.assets || []
      if (!Array.isArray(assets)) {
        assets = [assets]
      }
      packageDirs.forEach((dir) =>
        assets.forEach((asset) => {
          parsedAssets.push(path.join(dir, asset))
        }),
      )

      const bodyTemplate =
        srmOptions.combinedMessageBody ||
        // eslint-disable-next-line no-template-curly-in-string
        '[${nextRelease.gitTag}](${nextRelease.url})'

      const headerTemplate =
        srmOptions.combinedMessageHeader ||
        `chore(release): release ${releases.length} package${
          releases.length > 1 ? 's' : ''
        } [skip ci]`

      const header = _.template(headerTemplate)({
        releases,
        branch: branch.name,
      })
      const body = releases
        .map(({ lastRelease, nextReleases }) =>
          nextReleases
            .map((nextRelease) =>
              _.template(bodyTemplate)({
                branch: branch.name,
                lastRelease,
                nextRelease,
              }),
            )
            .join('\n'),
        )
        .join('\n\n')

      const options = _.cloneDeep({
        ...parsedOptions,
        plugins: [
          [
            pluginName,
            {
              assets: parsedAssets,
              message: `${header}\n\n${body}`,
            },
          ],
        ],
      })

      const ret = await semanticGetConfig(context, options)

      return ret.plugins.prepare
    }
  }

  return null
}

async function getSemanticConfig(
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
  srmOptions: SRMOptions,
) {
  try {
    // blackhole logger (don't output verbose messages).
    const blackhole = new signale.Signale({
      stream: new WritableStreamBuffer() as any,
    })

    const context = { cwd, env, stdout, stderr, logger: blackhole }
    const raw = await semanticGetConfig(context, options)
    const parsedOptions: semanticRelease.Options = raw.options
    const plugins: semanticRelease.PluginSpec[] = parsedOptions.plugins
      ? parsedOptions.plugins.slice()
      : []

    const gitPlugins = []
    if (srmOptions.combineCommits) {
      const gitPluginName = '@semantic-release/git'
      const index = plugins.findIndex((plugin) => {
        const name = Array.isArray(plugin) ? plugin[0] : plugin
        return name === gitPluginName
      })
      if (index >= 0) {
        // remove git plugin from plugins
        gitPlugins.push(...plugins.splice(index, 1))
      }
    }

    const options1 = _.cloneDeep({ ...parsedOptions, plugins })
    const options2 = _.cloneDeep({ ...parsedOptions, plugins })
    const options3 = _.cloneDeep({ ...parsedOptions, plugins: gitPlugins })

    const githubPluginName = '@semantic-release/github'

    options1.plugins = options1.plugins.map((plugin) => {
      if (Array.isArray(plugin)) {
        const pluginName = plugin[0]
        const pluginOptions = plugin[1] || {}
        if (pluginName === githubPluginName) {
          const failComment =
            pluginOptions.failComment ||
            getFailComment(srmOptions.commentFooter)

          return [
            pluginName,
            { ...pluginOptions, failComment, successComment: false },
          ]
        }
      }

      if (plugin === githubPluginName) {
        const failComment = getFailComment(srmOptions.commentFooter)
        return [plugin, { failComment, successComment: false }]
      }

      return plugin
    })

    options2.plugins = options2.plugins.map((plugin) => {
      if (Array.isArray(plugin)) {
        const pluginName = plugin[0]
        const pluginOptions = plugin[1] || {}
        if (pluginName === githubPluginName) {
          const successComment =
            pluginOptions.successComment ||
            getSuccessComment(srmOptions.commentFooter)
          const failComment =
            pluginOptions.failComment ||
            getFailComment(srmOptions.commentFooter)
          return [
            pluginName,
            {
              ...pluginOptions,
              successComment,
              failComment,
              addReleases: false,
            },
          ]
        }
      }

      if (plugin === githubPluginName) {
        const successComment = getSuccessComment(srmOptions.commentFooter)
        const failComment = getFailComment(srmOptions.commentFooter)
        return [plugin, { successComment, failComment, addReleases: false }]
      }

      return plugin
    })

    const ret1 = await semanticGetConfig(context, options1)
    const ret2 = await semanticGetConfig(context, options2)
    const ret3 = await semanticGetConfig(context, options3)
    const makePushToGit = srmOptions.combineCommits
      ? makePushToGitMethod(context, parsedOptions, gitPlugins[0], srmOptions)
      : null

    return {
      ...ret1,
      plugins: {
        ...ret1.plugins,
        makePushToGit,
        verifyConditionsGit: ret3.plugins.verifyConditions,
        successWithoutComment: ret1.plugins.success,
        successWithoutReleaseNote: ret2.plugins.success,
      },
    }
  } catch (error) {
    logger.error(`Error in semanticGetConfig(): %0`, error)
    throw error
  }
}
