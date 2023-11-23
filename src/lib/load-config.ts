import fsp from 'fs/promises'
import Joi from 'joi'
import path from 'path'
import { packageDirectory } from 'pkg-dir'

type Config = {
  basicAuthUsername: string
  basicAuthPassword: string
  username: string
  password: string
  baseUrl: string
  themeId: string
  themeDir: string
}

const rootDir = await packageDirectory()
if(!rootDir) throw new Error('Couldn\'t find ecforce.config.json')

const configPath = path.join(rootDir, 'ecforce.config.json')

const configJson = await fsp.readFile(configPath, 'utf8')

const schema = Joi.object<Config>({
  basicAuthUsername: Joi.string().required(),
  basicAuthPassword: Joi.string().required(),
  username: Joi.string().required(),
  password: Joi.string().required(),
  baseUrl: Joi.string().required(),
  themeId: Joi.string().required(),
  themeDir: Joi.string().required()
})

const validated = schema.validate(JSON.parse(configJson))

if(validated.error){
  throw validated.error
}
if(validated.warning){
  console.warn(validated.warning)
}

const config: Config = validated.value
config.themeDir = path.resolve(rootDir, config.themeDir)

export {config}