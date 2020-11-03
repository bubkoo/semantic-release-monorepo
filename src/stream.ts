import { Writable } from 'stream'
import { check } from './blork'

export class RescopedStream extends Writable {
  constructor(public stream: NodeJS.WriteStream, public scope: string) {
    super()
    check(scope, 'scope: string')
    check(stream, 'stream: stream')
  }

  write(msg: string) {
    check(msg, 'msg: string')
    return this.stream.write(
      msg.replace('[semantic-release]', `[${this.scope}]`),
    )
  }
}
