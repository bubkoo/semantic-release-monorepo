import signale from 'signale'
import SemanticRelease from 'semantic-release'
import semanticGetConfig from 'semantic-release/lib/get-config.js'
import { cosmiconfig } from 'cosmiconfig'
import { WritableStreamBuffer } from 'stream-buffers'
import { Logger } from './types.js'

const CONFIG_NAME = 'release'
const CONFIG_FILES = [
  'package.json',
  `.${CONFIG_NAME}rc`,
  `.${CONFIG_NAME}rc.json`,
  `.${CONFIG_NAME}rc.yaml`,
  `.${CONFIG_NAME}rc.yml`,
  `.${CONFIG_NAME}rc.js`,
  `.${CONFIG_NAME}rc.cjs`,
  `${CONFIG_NAME}.config.js`,
  `${CONFIG_NAME}.config.cjs`,
]

export async function getOptions(
  cwd: string,
): Promise<SemanticRelease.Options> {
  const res = await cosmiconfig(CONFIG_NAME, {
    searchPlaces: CONFIG_FILES,
  }).search(cwd)

  return res ? res.config : {}
}

export async function getSemanticConfig(
  {
    cwd,
    env,
    stdout,
    stderr,
    logger,
  }: {
    cwd: string
    env: { [name: string]: string }
    stdout: NodeJS.WriteStream
    stderr: NodeJS.WriteStream
    logger: Logger
  },
  options: SemanticRelease.Options,
) {
  try {
    // blackhole logger (don't output verbose messages).
    const blackhole = new signale.Signale({
      stream: new WritableStreamBuffer() as any,
    })

    return await semanticGetConfig(
      { cwd, env, stdout, stderr, logger: blackhole },
      options,
    )
  } catch (error) {
    logger.error(`Error in semanticGetConfig(): %0`, error)
    throw error
  }
}
