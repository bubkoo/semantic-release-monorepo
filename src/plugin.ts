import { writeFileSync } from 'fs'
import getDebugger from 'debug'
import detectIndent from 'detect-indent'
import detectNewline from 'detect-newline'
import SemanticRelease from 'semantic-release'
import { Commits } from './commits'
import { Manifest } from './manifest'
import { Synchronizer } from './synchronizer'
import { Package, Context, PluginOptions, Options } from './types'

export namespace InlinePlugin {
  const debug = getDebugger('msr:inlinePlugin')

  function updateManifestDeps(pkg: Package, path: string) {
    // Get and parse manifest file contents.
    const manifest = Manifest.get(path)
    const content = manifest.__contents__ as string
    const indent = detectIndent(content).indent
    const trailingWhitespace = detectNewline(content) || ''

    const updateDependency = (scope: string, name: string, version: string) => {
      if (manifest[scope] && manifest[scope][name]) {
        manifest[scope][name] = version
      }
    }

    pkg.localDeps &&
      pkg.localDeps.forEach((p) => {
        // Get version of dependency.
        const release = p.nextRelease || p.lastRelease
        // Cannot establish version.
        if (!release || !release.version) {
          throw Error(
            `Cannot release because dependency ${p.name} has not been released`,
          )
        }

        // Update version of dependency in manifest.
        updateDependency('dependencies', p.name, release.version)
        updateDependency('devDependencies', p.name, release.version)
        updateDependency('peerDependencies', p.name, release.version)
        updateDependency('optionalDependencies', p.name, release.version)
      })

    // Write package.json back out.
    writeFileSync(
      path,
      JSON.stringify(manifest, null, indent) + trailingWhitespace,
    )
  }

  function hasChangedDeep(packages: Package[], ignore: Package[] = []) {
    return packages
      .filter((p) => ignore.indexOf(p) === -1)
      .some((p) => {
        // 1. Any local dep package itself has changed
        if (p.nextType) {
          return true
        }

        // 2. Any local dep package has local deps that have changed.
        if (hasChangedDeep(p.localDeps, [...ignore, ...packages])) {
          return true
        }

        // Nope.
        return false
      })
  }

  export function get(
    packages: Package[],
    multiContext: Context,
    synchronizer: ReturnType<typeof Synchronizer.create>,
    flags: Options,
  ) {
    const { cwd } = multiContext
    const { emit, todo, waitFor, waitForAll, getLucky } = synchronizer

    return function create(pkg: Package) {
      const { deps, plugins, dir, path, name } = pkg
      let commits: Commits.Commit[]

      const verifyConditions = async (
        pluginOptions: PluginOptions,
        context: SemanticRelease.Context,
      ) => {
        // Restore context for plugins that does not rely on parsed opts.
        Object.assign(context.options, (context.options as any)._pkgOptions)

        // And bind actual logger.
        Object.assign(pkg.logger, context.logger)

        pkg.ready = true
        emit(
          'readyForRelease',
          todo().find((p) => !p.ready),
        )

        const res = await plugins.verifyConditions(context)
        debug('verified conditions: %s', pkg.name)
        return res
      }

      const analyzeCommits = async (
        pluginOptions: PluginOptions,
        context: SemanticRelease.Context,
      ) => {
        const firstParentBranch: string | undefined = flags.firstParent
          ? (context as any).branch.name
          : undefined

        // Filter commits by directory.
        commits = await Commits.filter(
          cwd,
          dir,
          context.lastRelease ? context.lastRelease.gitHead : undefined,
          firstParentBranch,
        )

        // Set context.commits so analyzeCommits does correct analysis.
        const ctx = context as any
        ctx.commits = commits

        // Set lastRelease for package from context.
        pkg.lastRelease = context.lastRelease

        // Make a list of local dependencies.
        pkg.localDeps = deps
          .map((d) => packages.find((p) => d === p.name))
          .filter((p) => p != null) as Package[]

        // Set nextType for package from plugins.
        pkg.nextType = await plugins.analyzeCommits(context)

        // Wait until all todo packages have been analyzed.
        pkg.analyzed = true
        await waitForAll('analyzed')

        // Make sure type is "patch" if the package has any deps that have changed.
        if (!pkg.nextType && hasChangedDeep(pkg.localDeps)) {
          pkg.nextType = 'patch'
        }

        debug('commits analyzed: %s', pkg.name)
        debug('release type: %s', pkg.nextType)

        // Return type.
        return pkg.nextType
      }

      const generateNotes = async (
        pluginOptions: PluginOptions,
        context: SemanticRelease.Context,
      ) => {
        // Set nextRelease for package.
        pkg.nextRelease = context.nextRelease

        // Wait until all packages are ready to generate notes.
        await waitForAll('nextRelease', (p) => p.nextType != null)

        // Wait until the current pkg is ready to generate notes
        getLucky('readyToGenerateNotes', pkg)
        await waitFor('readyToGenerateNotes', pkg)

        // Update pkg deps.
        updateManifestDeps(pkg, path)
        pkg.depsUpdated = true

        const notes: string[] = []

        // Set context.commits so analyzeCommits does correct analysis.
        // We need to redo this because context is a different instance each time.
        const ctx = context as any
        ctx.commits = commits

        // Get subnotes and add to list.
        // Inject pkg name into title if it matches e.g. `# 1.0.0` or `## [1.0.1]` (as generate-release-notes does).
        const subs = await plugins.generateNotes(context)
        // istanbul ignore else (unnecessary to test)
        if (subs) {
          notes.push(
            subs.replace(/^(#+) (\[?\d+\.\d+\.\d+\]?)/, `$1 ${name} $2`),
          )
        }

        // If it has upgrades add an upgrades section.
        const upgrades = pkg.localDeps!.filter((p) => p.nextRelease != null)
        if (upgrades.length) {
          notes.push(`### Dependencies`)
          const bullets = upgrades.map(
            (p) => `* **${p.name}:** upgraded to ${p.nextRelease!.version}`,
          )
          notes.push(bullets.join('\n'))
        }

        debug('notes generated: %s', pkg.name)

        // Return the notes.
        return notes.join('\n\n')
      }

      const publish = async (
        pluginOptions: PluginOptions,
        context: SemanticRelease.Context,
      ) => {
        pkg.prepared = true
        emit(
          'readyToGenerateNotes',
          todo().find((p) => p.nextType && !p.prepared),
        )

        // Wait for all packages to be `prepare`d and tagged by `semantic-release`
        await waitForAll('prepared', (p) => p.nextType != null)
        const res = await plugins.publish(context)
        debug('published: %s', pkg.name)
        return res.length ? res[0] : {}
      }

      const success = async (
        pluginOptions: PluginOptions,
        context: SemanticRelease.Context,
      ) => {
        pkg.published = true
        await waitForAll('published', (p) => p.nextType != null)
        debug('success: %s', pkg.name)
      }

      const inlinePlugin: { [key: string]: any } = {
        verifyConditions,
        analyzeCommits,
        generateNotes,
        publish,
        success,
      }

      Object.keys(inlinePlugin).forEach((type) =>
        Reflect.defineProperty(inlinePlugin[type], 'pluginName', {
          value: 'Inline plugin',
          writable: false,
          enumerable: true,
        }),
      )

      debug('inlinePlugin created: %s', pkg.name)

      return inlinePlugin
    }
  }
}