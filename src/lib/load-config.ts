import fsp from 'fs/promises'
import path from 'path'
import { packageDirectory } from 'pkg-dir'

type Config = {
  basicAuthUsername: string
  basicAuthPassword: string
  username: string
  password: string
  baseUrl: string
  themeId: string
}

const rootDir = await packageDirectory()
if(!rootDir) throw new Error('Couldn\'t find ecforce.config.json')

const configPath = path.join(rootDir, 'ecforce.config.json')

const configJson = await fsp.readFile(configPath, 'utf8')

export const config: Config = JSON.parse(configJson)