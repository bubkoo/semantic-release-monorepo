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

export function normalizeRepoUrl(url: string) {
  const index = url.indexOf('github.com')
  let ret = index >= 0 ? `https://${url.substring(index)}` : url
  if (ret.endsWith('.git')) {
    ret = ret.substring(0, ret.length - 4)
  }
  return ret
}
