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
