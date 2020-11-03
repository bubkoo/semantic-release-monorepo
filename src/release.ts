import { dirname } from 'path'
import { Signale } from 'signale'
import { WritableStreamBuffer } from 'stream-buffers'
import SemanticRelease from 'semantic-release'
import semanticGetConfig from 'semantic-release/lib/get-config'
import { Util } from './util'
import { check } from './blork'
import { Logger } from './logger'
import { Manifest } from './manifest'
import { RescopedStream } from './stream'
import { Synchronizer } from './synchronizer'
import { Context, Options, Package } from './types'
import { InlinePlugin } from './plugin'

export namespace Release {
  export async function start(
    paths: string[],
    inputOptions: SemanticRelease.Options = {},
    {
      cwd = process.cwd(),
      env = process.env as { [name: string]: string },
      stdout = process.stdout,
      stderr = process.stderr,
    } = {},
    flags: Options = {},
  ) {
    check(paths, 'paths: string[]')
    check(cwd, 'cwd: directory')
    check(env, 'env: objectlike')
    check(stdout, 'stdout: stream')
    check(stderr, 'stderr: stream')

    cwd = Util.cleanPath(cwd) // tslint:disable-line

    const logger = Logger.get({ stdout, stderr })
    logger.complete(`Started release! Loading ${paths.length} packages...`)

    const globalOptions = await Util.getConfig(cwd)
    const options = Object.assign({}, globalOptions, inputOptions)
    const context: Context = { options, cwd, env, stdout, stderr }

    // Load packages
    const packages = await Promise.all(
      paths.map((path) => loadPackage(path, context)),
    )
    packages.forEach((p) => logger.success(`Loaded package ${p.name}`))
    logger.complete(`Queued ${packages.length} packages! Starting release...`)

    // Shared signal bus.
    const synchronizer = Synchronizer.create(packages)
    const { getLucky, waitFor } = synchronizer

    // Release all packages.
    const createInlinePlugin = InlinePlugin.get(
      packages,
      context,
      synchronizer,
      flags,
    )

    await Promise.all(
      packages.map(async (pkg) => {
        // Avoid hypothetical concurrent initialization collisions / throttling issues.
        // https://github.com/dhoulb/multi-semantic-release/issues/24
        if (flags.sequential) {
          getLucky('readyForRelease', pkg)
          await waitFor('readyForRelease', pkg)
        }

        return releasePackage(pkg, createInlinePlugin, context)
      }),
    )

    const released = packages.filter((pkg) => pkg.result).length
    logger.complete(
      `Released ${released} of ${packages.length} packages, semantically!`,
    )

    return packages
  }

  async function loadPackage(
    path: string,
    { options: globalOptions, env, cwd, stdout, stderr }: Context,
  ): Promise<Package> {
    path = Util.cleanPath(path, cwd) // tslint:disable-line
    const dir = dirname(path)
    const manifest = Manifest.get(path)
    const name = manifest.name
    const deps = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
      ...manifest.optionalDependencies,
    })

    const pkgOptions = await Util.getConfig(dir)
    const finalOptions = Object.assign({}, globalOptions, pkgOptions)
    const logger = { error() {}, log() {} }

    // Use semantic-release's internal config with the final options (now we
    // have the right `options.plugins` setting) to get the plugins object and
    // the options including defaults.
    // We need this so we can call e.g. plugins.analyzeCommit() to be able to
    // affect the input and output of the whole set of plugins.
    const { options, plugins } = await loadSemanticRelease(
      { env, stdout, stderr, logger: logger as any, cwd: dir },
      finalOptions,
    )

    return {
      path,
      dir,
      name,
      manifest,
      deps,
      options,
      plugins,
      logger,
      localDeps: [],
    }
  }

  async function releasePackage(
    pkg: Package,
    createInlinePlugin: (pkg: Package) => { [key: string]: any },
    context: Context,
  ) {
    const { options: pkgOptions, name, dir } = pkg
    const { env, stdout, stderr } = context

    // Make an 'inline plugin' for this package.
    // The inline plugin is the only plugin we call semanticRelease() with.
    // The inline plugin functions then call e.g. plugins.analyzeCommits()
    // manually and sometimes manipulate the responses.
    const inlinePlugin = createInlinePlugin(pkg)

    // Set the options that we call semanticRelease() with.
    const options = { ...pkgOptions, ...inlinePlugin }

    // Add the package name into tagFormat.
    if (options.tagFormat == null) {
      options.tagFormat = `${name}` + '@${version}'
    }

    options._pkgOptions = pkgOptions

    // Call semanticRelease() on the directory and save result to pkg.
    // Don't need to log out errors as semantic-release already does that.
    pkg.result = await SemanticRelease(options, {
      env,
      cwd: dir,
      stdout: RescopedStream.get(stdout, name),
      stderr: RescopedStream.get(stderr, name),
    })
  }

  async function loadSemanticRelease(
    {
      cwd,
      env,
      stdout,
      stderr,
      logger,
    }: {
      cwd: string
      env: NodeJS.ProcessEnv
      stdout: NodeJS.WriteStream
      stderr: NodeJS.WriteStream
      logger: Signale
    },
    options: SemanticRelease.Options,
  ) {
    try {
      // Blackhole logger (so we don't clutter output with "loaded plugin" messages).
      const blackhole = new Signale({
        stream: (new WritableStreamBuffer() as any) as NodeJS.WriteStream,
      })

      // Return semantic-release's getConfig script.
      return await semanticGetConfig(
        { cwd, env, stdout, stderr, logger: blackhole },
        options,
      )
    } catch (error) {
      logger.error(`Error in semantic-release getConfig(): %0`, error)
      throw error
    }
  }
}
