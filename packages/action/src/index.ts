import * as core from '@actions/core'
import * as github from '@actions/github'
import release from '@semantic-release-monorepo/core'
import { getMSROptions } from './util.js'

try {
  console.warn(github, core, process.cwd())
  const msrOptions = getMSROptions()
  release(msrOptions)
} catch (e) {
  core.error(e)
  core.setFailed(e.message)
}
