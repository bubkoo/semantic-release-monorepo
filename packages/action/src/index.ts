import * as core from '@actions/core'
import * as github from '@actions/github'
import msr from '@semantic-release-monorepo/core'

try {
  const { context } = github
  msr(context as any)
} catch (e) {
  core.error(e)
  core.setFailed(e.message)
}
