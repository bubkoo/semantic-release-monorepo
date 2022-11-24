import detectIndent from 'detect-indent'
import { detectNewline } from 'detect-newline'
import { normalize, isAbsolute, join } from 'path'
import { check } from './blork.js'

export function toAbsolutePath(path: string, cwd = process.cwd()) {
  check(path, 'path: path')
  check(cwd, 'cwd: absolute')

  return normalize(isAbsolute(path) ? path : join(cwd, path)).replace(
    /[/\\]+$/,
    '',
  )
}

export function detectFormat(contents: string) {
  return {
    indent: detectIndent(contents).indent,
    trailingWhitespace: detectNewline(contents) || '',
  }
}

export function normalizeRepoUrl(repositoryUrl: string) {
  const { owner, repo } = parseGithubUrl(repositoryUrl)
  return `https://github.com/${owner}/${repo}`
}

export function parseGithubUrl(repositoryUrl: string): {
  repo?: string
  owner?: string
} {
  const [match, auth, host, path] =
    /^(?!.+:\/\/)(?:(?<auth>.*)@)?(?<host>.*?):(?<path>.*)$/.exec(
      repositoryUrl,
    ) || []
  try {
    const [, owner, repo] =
      /^\/(?<owner>[^/]+)?\/?(?<repo>.+?)(?:\.git)?$/.exec(
        new URL(
          match
            ? `ssh://${auth ? `${auth}@` : ''}${host}/${path}`
            : repositoryUrl,
        ).pathname,
      )!
    return { owner, repo }
  } catch {
    return {}
  }
}
