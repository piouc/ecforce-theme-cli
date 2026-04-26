import readline from 'readline'
import fsp from 'fs/promises'
import path from 'path'
import { packageDirectory } from 'package-directory'
import { Config, ThemeProfile, LpProfile, PageProfile } from './load-config.js'
import { getCurrentBranchName } from './utils.js'

const createRl = () => readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const prompt = (message: string, defaultValue?: string): Promise<string> => {
  const rl = createRl()
  const suffix = defaultValue ? ` [${defaultValue}]` : ''
  return new Promise((resolve) => {
    rl.question(`${message}${suffix}: `, (answer) => {
      rl.close()
      resolve(answer.trim() || defaultValue || '')
    })
  })
}

const promptPassword = (message: string): Promise<string> => {
  return new Promise((resolve) => {
    const rl = createRl()
    process.stdout.write(`${message}: `)
    const stdin = process.stdin
    const wasRaw = stdin.isRaw
    if(stdin.isTTY) stdin.setRawMode(true)

    let input = ''
    const onData = (char: Buffer) => {
      const c = char.toString()
      if(c === '\n' || c === '\r'){
        stdin.removeListener('data', onData)
        if(stdin.isTTY) stdin.setRawMode(wasRaw ?? false)
        process.stdout.write('\n')
        rl.close()
        resolve(input)
      } else if(c === '\u007f' || c === '\b'){
        if(input.length > 0){
          input = input.slice(0, -1)
          process.stdout.write('\b \b')
        }
      } else if(c === '\u0003'){
        process.exit(1)
      } else {
        input += c
        process.stdout.write('*')
      }
    }
    stdin.on('data', onData)
  })
}

const promptYesNo = async (message: string): Promise<boolean> => {
  const answer = await prompt(`${message} (y/n)`)
  return answer.toLowerCase() === 'y'
}

const resolveConfigPath = async (configPath: string) => {
  const rootDir = await packageDirectory()
  if(!rootDir) throw new Error('Couldn\'t find package root.')
  return path.resolve(rootDir, configPath)
}

const readExistingConfig = async (fullPath: string): Promise<Config | null> => {
  try {
    const content = await fsp.readFile(fullPath, 'utf8')
    return JSON.parse(content) as Config
  } catch {
    return null
  }
}

const saveConfig = async (fullPath: string, config: Config) => {
  await fsp.writeFile(fullPath, JSON.stringify(config, null, 2), 'utf8')
}

const initBase = async (configPath: string) => {
  const fullPath = await resolveConfigPath(configPath)

  const existing = await readExistingConfig(fullPath)
  if(existing){
    const overwrite = await promptYesNo(`${configPath} already exists. Overwrite?`)
    if(!overwrite){
      console.log('Aborted.')
      return
    }
  }

  const baseUrl = await prompt('Base URL')
  const basicAuthUsername = await prompt('Basic Auth Username')
  const basicAuthPassword = await promptPassword('Basic Auth Password')
  const authType = await prompt('Auth Type (legacy/ecforceAccount)', 'legacy') as 'legacy' | 'ecforceAccount'
  const username = await prompt('Username')
  const password = await promptPassword('Password')

  const config: Config = {
    basicAuthUsername,
    basicAuthPassword,
    username,
    password,
    baseUrl,
    authType,
    profiles: []
  }

  await saveConfig(fullPath, config)
  console.log(`Config saved to ${configPath}`)
}

const initTheme = async (configPath: string) => {
  const fullPath = await resolveConfigPath(configPath)
  const config = await readExistingConfig(fullPath)
  if(!config) throw new Error(`${configPath} not found. Run "init" first.`)

  const name = await prompt('Theme Name')
  const themeId = await prompt('Theme ID')
  const branch = await prompt('Branch', await getCurrentBranchName())
  const dir = await prompt('Directory')

  const profile: ThemeProfile = { type: 'theme', name, themeId, branch, dir }
  config.profiles.push(profile)
  await saveConfig(fullPath, config)
  console.log('Profile added.')
}

const initLp = async (configPath: string) => {
  const fullPath = await resolveConfigPath(configPath)
  const config = await readExistingConfig(fullPath)
  if(!config) throw new Error(`${configPath} not found. Run "init" first.`)

  const lpId = await prompt('LP ID')
  const branch = await prompt('Branch', await getCurrentBranchName())
  const dir = await prompt('Directory')

  const profile: LpProfile = { type: 'lp', lpId, branch, dir }
  config.profiles.push(profile)
  await saveConfig(fullPath, config)
  console.log('Profile added.')
}

const initPage = async (configPath: string) => {
  const fullPath = await resolveConfigPath(configPath)
  const config = await readExistingConfig(fullPath)
  if(!config) throw new Error(`${configPath} not found. Run "init" first.`)

  const branch = await prompt('Branch', await getCurrentBranchName())
  const dir = await prompt('Directory')

  const pages: { pageId: string, name?: string }[] = []
  let addMore = true
  while(addMore){
    const pageId = await prompt('Page ID')
    const name = await prompt('Name (optional)')
    pages.push(name ? { pageId, name } : { pageId })
    addMore = await promptYesNo('Add another page?')
  }

  const profile: PageProfile = { type: 'page', branch, dir, pages }
  config.profiles.push(profile)
  await saveConfig(fullPath, config)
  console.log('Profile added.')
}

export const handleInit = async (subArgs: string[], configPath: string) => {
  const subCommand = subArgs[0]

  switch(subCommand){
    case undefined:
      await initBase(configPath)
      break
    case 'theme':
      await initTheme(configPath)
      break
    case 'lp':
      await initLp(configPath)
      break
    case 'page':
      await initPage(configPath)
      break
    default:
      console.error(`Unknown init subcommand: ${subCommand}`)
      console.log('Usage: init [theme|lp|page]')
      process.exit(1)
  }
}
