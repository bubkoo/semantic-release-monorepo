import * as core from '@actions/core'
import * as github from '@actions/github'
import release from '@semantic-release-monorepo/core'
import { getMSROptions } from './util.js'

try {
  console.warn(github, core)
  const msrOptions = getMSROptions()
  release(msrOptions, undefined, {
    cwd: github.workspace,
    env: process.env as { [name: string]: string },
    stdout: process.stdout,
    stderr: process.stderr,
  })
} catch (e) {
  core.error(e)
  core.setFailed(e.message)
}
