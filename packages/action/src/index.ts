import * as core from '@actions/core'
import * as github from '@actions/github'
import release from '@semantic-release-monorepo/core'
import { getMSROptions } from './util.js'

try {
  const { context } = github
  const msrOptions = getMSROptions()
  release(msrOptions, context as any)
} catch (e) {
  core.error(e)
  core.setFailed(e.message)
}
