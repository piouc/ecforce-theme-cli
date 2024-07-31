import fsp from 'fs/promises'
import Joi from 'joi'
import path from 'path'
import { packageDirectory } from 'pkg-dir'

export type ThemeProfile = {
  type: 'theme'
  name: string
  branch: string
  themeId: string
  dir: string
}
const themeProfileSchema = Joi.object<ThemeProfile>({
  type: Joi.string().valid('theme').required(),
  name: Joi.string().required(),
  branch: Joi.string().required(),
  themeId: Joi.string().required(),
  dir: Joi.string().required(),
});

export type LpProfile = {
  type: 'lp'
  lpId: string
  branch: string
  dir: string
}
const lpProfileSchema = Joi.object<LpProfile>({
  type: Joi.string().valid('lp').required(),
  lpId: Joi.string().required(),
  branch: Joi.string().required(),
  dir: Joi.string().required(),
});

export type Config = {
  basicAuthUsername: string
  basicAuthPassword: string
  username: string
  password: string
  baseUrl: string
  profiles: (ThemeProfile | LpProfile)[]
}
const configSchema = Joi.object<Config>({
  basicAuthUsername: Joi.string().required(),
  basicAuthPassword: Joi.string().required(),
  username: Joi.string().required(),
  password: Joi.string().required(),
  baseUrl: Joi.string().uri().required(),
  profiles: Joi.array().items(Joi.alternatives().try(themeProfileSchema, lpProfileSchema)).required(),
});

const rootDir = await packageDirectory()
if(!rootDir) throw new Error('Couldn\'t find ecforce.config.json')

const configPath = path.join(rootDir, 'ecforce.config.json')

const configJson = await fsp.readFile(configPath, 'utf8')

const validated = configSchema.validate(JSON.parse(configJson))

if(validated.error){
  throw validated.error
}
if(validated.warning){
  console.warn(validated.warning)
}

const config: Config = validated.value
config.profiles = config.profiles.map(profile => ({...profile, dir: path.resolve(rootDir, profile.dir)}))


export {config}