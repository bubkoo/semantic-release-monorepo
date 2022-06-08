import debug from 'debug'

export type DebugModule = 'commits' | 'deps' | 'plugins' | 'sync'

const prefix = 'msr'

export function getDebugger(module: DebugModule) {
  return debug(`${prefix}:${module}`)
}

export function enableDebugger(module?: string | boolean) {
  if (module) {
    if (typeof module === 'string') {
      module.split(/,\|/).forEach((ns) => debug.enable(`${prefix}:${ns}`))
    } else {
      debug.enable(`${prefix}:*`)
    }
  }
}
