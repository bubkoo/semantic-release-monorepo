import _ from 'lodash'
import {
  Flags,
  Package,
  PluginOptions,
  MSRContext,
  PrepareContext,
  PublishContext,
  VerifyReleaseContext,
  GenerateNotesContext,
  AnalyzeCommitsContext,
} from './types.js'
import { getTagHead } from './git.js'
import { getDebugger } from './debugger.js'
import { getRootPkgs } from './npm-pkg-root.js'
import { Synchronizer } from './synchronizer.js'
import { getFilteredCommits } from './commits.js'
import { updateManifestDeps, updateNextReleaseType } from './local-deps.js'

const debug = getDebugger('plugins')

export type CreateInlinePlugins = ReturnType<typeof makeInlinePluginsCreator>

export function makeInlinePluginsCreator(
  packages: Package[],
  context: MSRContext,
  synchronizer: Synchronizer,
  flags: Flags,
) {
  const { cwd } = context

  const createInlinePlugins = (pkg: Package) => {
    const { plugins, dir, name } = pkg

    const next = () => {
      pkg.status.tagged = true
      synchronizer.emit(
        'readyForTagging',
        synchronizer.find((pkg) => pkg.nextType != null && !pkg.status.tagged),
      )
    }

    const verifyConditions = async (
      pluginOptions: PluginOptions,
      context: VerifyReleaseContext,
    ) => {
      // Restore context for plugins that does not rely on parsed opts.
      Object.assign(context.options, context.options.pkgOptions)
      // Bind actual logger.
      Object.assign(pkg.logger, context.logger)

      pkg.status.ready = true
      synchronizer.emit(
        'readyForRelease',
        synchronizer.find((pkg) => !pkg.status.ready),
      )

      const res = await plugins.verifyConditions(context)
      debug('verified conditions: %s', pkg.name)
      return res
    }

    /**
     * Responsible for determining the type of the next release (major, minor
     * or patch). If multiple plugins with a analyzeCommits step are defined,
     * the release type will be the highest one among plugins output.
     *
     * Returns "patch" if the package contains references to other local
     * packages that have changed, or null if this package references no
     * local packages or they have not changed.
     *
     * Also updates the `context.commits` setting with one returned from
     * `getCommitsFiltered()` (which is filtered by package directory).
     */
    const analyzeCommits = async (
      pluginOptions: PluginOptions,
      context: AnalyzeCommitsContext,
    ) => {
      pkg.branchName = context.branch.name
      pkg.preRelease = context.branch.prerelease as string

      // Filter commits by directory.
      const firstParentBranch = flags.firstParent
        ? context.branch.name
        : undefined
      const commits = await getFilteredCommits(
        cwd,
        dir,
        context.lastRelease ? context.lastRelease.gitHead : undefined,
        context.nextRelease ? context.nextRelease.gitHead : undefined,
        firstParentBranch,
      )

      // Update context.commits with fitered commits
      context.commits = commits

      pkg.lastRelease = context.lastRelease
      pkg.nextType = await plugins.analyzeCommits(context)
      pkg.rawNextType = pkg.nextType

      // Wait until all packages have been analyzed.
      pkg.status.analyzed = true
      await synchronizer.waitForAll(
        'analyzed',
        (pkg) => pkg.status.analyzed === true,
      )

      await updateNextReleaseType(pkg, packages, synchronizer, flags)

      debug('commits analyzed: %s', pkg.name)
      debug('release type (semrel): %s', pkg.rawNextType)
      debug('release type (msr): %s', pkg.nextType)

      return pkg.nextType
    }

    /**
     * Responsible for generating the content of the release note. If
     * multiple plugins with a generateNotes step are defined, the release
     * notes will be the result of the concatenation of each plugin output.
     */
    const generateNotes = async (
      pluginOptions: PluginOptions,
      context: GenerateNotesContext,
    ) => {
      pkg.nextRelease = context.nextRelease
      // wait until `nextRelease` prop was set in all packages
      await synchronizer.waitForAll(
        'nextRelease',
        (pkg) => pkg.nextRelease != null,
        (pkg) => pkg.nextType != null,
      )

      const notes = []
      const { lastRelease, nextRelease } = context

      if (lastRelease && lastRelease.gitTag) {
        if (
          !lastRelease.gitHead ||
          lastRelease.gitHead === lastRelease.gitTag
        ) {
          lastRelease.gitHead = await getTagHead(lastRelease.gitTag, {
            cwd: context.cwd,
            env: context.env,
          })
        }
      }

      // Filter commits by directory (and release range)
      const firstParentBranch = flags.firstParent
        ? context.branch.name
        : undefined
      const commits = await getFilteredCommits(
        cwd,
        dir,
        lastRelease ? lastRelease.gitHead : undefined,
        nextRelease ? nextRelease.gitHead : undefined,
        firstParentBranch,
      )

      context.commits = commits

      // Get subnotes and add to list.
      const subs = await plugins.generateNotes(context)
      if (subs) {
        // Inject pkg name into title if it matches e.g. `# 1.0.0` or
        // `## [1.0.1]` (as generate-release-notes does).
        notes.push(subs.replace(/^(#+) (\[?\d+\.\d+\.\d+\]?)/, `$1 ${name} $2`))
      }

      // If it has upgrades add an upgrades section.
      const upgrades = pkg.localDepsChanged.filter(
        (d) => d.nextRelease && d.nextRelease.version,
      )

      if (upgrades && upgrades.length > 0) {
        notes.push(`### Dependencies`)
        const bullets = upgrades.map(
          (d) => `* **${d.name}:** upgraded to ${d.nextRelease!.version}`,
        )
        notes.push(bullets.join('\n'))
      }

      debug('notes generated: %s', pkg.name)

      if (pkg.options.dryRun) {
        next()
      }

      return notes.join('\n\n')
    }

    const prepare = async (
      pluginOptions: PluginOptions,
      context: PrepareContext,
    ) => {
      // Wait until the current pkg is ready to be tagged
      synchronizer.getLucky('readyForTagging', pkg)
      await synchronizer.waitFor('readyForTagging', pkg)

      // Get all packages that potentially need to be updated
      const pkgs = _.uniqBy(
        [
          pkg,
          ...getRootPkgs(context, { localDepsChanged: pkg.localDepsChanged }),
        ],
        'path',
      )

      // Loop through each manifest and update its dependencies if needed
      pkgs.forEach((item) =>
        updateManifestDeps(
          item,
          true,
          flags.deps ? flags.deps.bump : undefined,
          flags.deps ? flags.deps.prefix : undefined,
        ),
      )

      pkg.status.depsUpdated = true

      const res = await plugins.prepare(context)
      pkg.status.prepared = true

      debug('prepared: %s', pkg.name)

      return res
    }

    const publish = async (
      pluginOptions: PluginOptions,
      context: PublishContext,
    ) => {
      next()
      const res = await plugins.publish(context)
      pkg.status.published = true

      debug('published: %s', pkg.name)

      return res.length ? res[0] : {}
    }

    const inlinePlugin = {
      verifyConditions,
      analyzeCommits,
      generateNotes,
      prepare,
      publish,
    } as const

    // Add labels for logs.
    Object.keys(inlinePlugin).forEach((type: keyof typeof inlinePlugin) =>
      Reflect.defineProperty(inlinePlugin[type], 'pluginName', {
        value: 'msr inline plugin',
        writable: false,
        enumerable: true,
      }),
    )

    debug('inlinePlugin created: %s', pkg.name)

    return inlinePlugin
  }

  return createInlinePlugins
}
