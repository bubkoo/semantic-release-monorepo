import { Writable } from 'stream'
import { WritableStreamBuffer } from 'stream-buffers'
import { existsSync, lstatSync } from 'fs'
import { checker, check, add, ValueError } from 'blork'

const isAbsolute = checker('absolute')

// Add a directory checker.
add(
  'directory',
  (v) => isAbsolute(v) && existsSync(v) && lstatSync(v).isDirectory(),
  'directory that exists in the filesystem',
)

// Add a writable stream checker.
add(
  'stream',
  (v) => v instanceof Writable || v instanceof WritableStreamBuffer,
  'instance of stream.Writable or WritableStreamBuffer',
)

export { checker, check, ValueError }
