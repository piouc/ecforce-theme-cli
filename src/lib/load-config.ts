import fsp from 'fs/promises'
import path from 'path'

type Config = {
  basicAuthUsername: string
  basicAuthPassword: string
  username: string
  password: string
  baseUrl: string
  themeId: string
}

const configPath = path.join(process.cwd(), 'ecforce.config.json')

const configJson = await fsp.readFile(configPath, 'utf8')

export const config: Config = JSON.parse(configJson)