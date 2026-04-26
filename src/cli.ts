#! /usr/bin/env node

import { Command } from '@commander-js/extra-typings'
import { pull, sync, update, del, updateBinaries, getPreviewUrl, getSettingsSchema } from './lib/api.js'
import { WebSocketServer } from 'ws'
import chokidar from 'chokidar'
import fsp from 'fs/promises'
import { parse, resolve } from 'path'
import { loadConfig } from './lib/load-config.js'
import open from 'open'
import { lpPull, lpSync } from './lib/lp-api.js'
import { pagePull, pageSync, pageSyncOne, findPage } from './lib/page-api.js'
import { getCurrentBranchName, getLpProfile, getPageProfile, getThemeProfile, formatAxiosError } from './lib/utils.js'
import pLimit from 'p-limit'
import pDebounce from 'p-debounce'
import { createClient } from './lib/create-client.js'
import { handleInit } from './lib/init.js'

const program = new Command()
  .option('-c, --config <path>', 'config file', 'ecforce.config.json')

const opts = new Command()
  .helpOption(false)
  .allowUnknownOption()
  .arguments('[args...]')
  .option('-c, --config <path>', 'config file', 'ecforce.config.json')
  .parse(process.argv)
  .opts()

const initIndex = process.argv.indexOf('init')
if(initIndex !== -1){
  const initArgs = process.argv.slice(initIndex + 1).filter(a => !a.startsWith('-'))
  await handleInit(initArgs, opts.config)
  process.exit(0)
}

const config = await loadConfig(opts.config)
const client = await createClient(config, opts.config)
const currentBranchName = await getCurrentBranchName()

program
  .command('pull')
  .action(async () => {
    const profile = getThemeProfile(config, currentBranchName)
    if(!profile) throw new Error(`No matching profile was found for ${currentBranchName} branch`)
    await pull(client, profile, config.baseUrl)
  })

program
  .command('sync')
  .option('-w, --watch', 'watch files')
  .action(async (options) => {
    const profile = getThemeProfile(config, currentBranchName)
    if(!profile) throw new Error(`No matching profile was found for ${currentBranchName} branch`)

    console.log('sync: uploading zip')
    await sync(client, profile)
    console.log('sync: complete')

    if(options.watch){
      const limit = pLimit(1)
      const wss = new WebSocketServer({
        port: 8080
      })
      wss.on('connection', (ws, req) => {
        console.log(`connected ${req.socket.remoteAddress}`)
      })

      const updateQueue: string[] = []
      const debouncedUpdateBinaries = pDebounce(async () => {
        await updateBinaries(client, profile, updateQueue.splice(0))
      }, 500)
      
      const watcher = chokidar.watch(profile.dir, {cwd: profile.dir, ignoreInitial: true})
      watcher.on('all', async (type, path) => limit(async () => {
        try {
          switch(type){
            case 'add':
            case 'change':
              if(['html', 'liquid', 'svg', 'js', 'json', 'css'].includes(parse(path).ext)){
                if(path === 'ec_force/config/settings_schema.json'){
                  await update(client, profile, path, await getSettingsSchema(profile))
                } else {
                  await update(client, profile, path, await fsp.readFile(resolve(profile.dir, path), 'utf8'))
                }
              } else {
                updateQueue.push(resolve(profile.dir, path))
                debouncedUpdateBinaries()
              }
              console.log(`${type} ${path}`)
              break
            case 'unlink':
              await del(client, profile, path)
              console.log(`delete ${path}`)
              break
          }
          wss.clients.forEach(ws => {
            ws.send(JSON.stringify({type: 'update'}))
          })
        } catch (err) {
          console.error(formatAxiosError(err))
        }
      }))
    }
  })

program
  .command('preview')
  .action(async () => {
    const profile = getThemeProfile(config, currentBranchName)
    if(!profile) throw new Error(`No matching profile was found for ${currentBranchName} branch`)
    const url = await getPreviewUrl(client, profile, config.baseUrl)
    await open(url)
  })

program
  .command('lp-pull')
  .action(async () => {
    const profile = getLpProfile(config, currentBranchName)
    if(!profile) throw new Error(`No matching profile was found for ${currentBranchName} branch`)
    await lpPull(client, profile)
  })

program
  .command('lp-sync')
  .option('-w, --watch', 'watch files')
  .action(async (options) => {
    const profile = getLpProfile(config, currentBranchName)
    if(!profile) throw new Error(`No matching profile was found for ${currentBranchName} branch`)

    await lpSync(client, profile)

    if(options.watch){
      const wss = new WebSocketServer({
        port: 8080
      })
      wss.on('connection', (ws, req) => {
        console.log(`connected ${req.socket.remoteAddress}`)
      })

      const watcher = chokidar.watch(profile.dir, {cwd: profile.dir, ignoreInitial: true})
      watcher.on('all', async (type) => {
        try {
          switch(type){
            case 'change':
              await lpSync(client, profile)
              console.log(`sync`)
              break
          }
          wss.clients.forEach(ws => {
            ws.send(JSON.stringify({type: 'update'}))
          })
        } catch (err) {
          console.error(formatAxiosError(err))
        }
      })
    }
  })

program
  .command('page-pull')
  .argument('[identifier]', 'page name or pageId')
  .option('-a, --all', 'pull all pages')
  .action(async (identifier, options) => {
    const profile = getPageProfile(config, currentBranchName)
    if(!profile) throw new Error(`No matching profile was found for ${currentBranchName} branch`)

    if(options.all){
      await pagePull(client, profile, profile.pages)
    } else {
      if(!identifier) throw new Error('Please specify a page name/id or use --all')
      const page = findPage(profile, identifier)
      if(!page) throw new Error(`No page found matching "${identifier}"`)
      await pagePull(client, profile, [page])
    }
  })

program
  .command('page-sync')
  .argument('[identifier]', 'page name or pageId')
  .option('-a, --all', 'sync all pages')
  .option('-w, --watch', 'watch files')
  .action(async (identifier, options) => {
    const profile = getPageProfile(config, currentBranchName)
    if(!profile) throw new Error(`No matching profile was found for ${currentBranchName} branch`)

    let targetPages = profile.pages
    if(!options.all){
      if(!identifier) throw new Error('Please specify a page name/id or use --all')
      const page = findPage(profile, identifier)
      if(!page) throw new Error(`No page found matching "${identifier}"`)
      targetPages = [page]
    }

    await pageSync(client, profile, targetPages)

    if(options.watch){
      const wss = new WebSocketServer({
        port: 8080
      })
      wss.on('connection', (ws, req) => {
        console.log(`connected ${req.socket.remoteAddress}`)
      })

      const watcher = chokidar.watch(profile.dir, {cwd: profile.dir, ignoreInitial: true})
      watcher.on('all', async (type, path) => {
        try {
          switch(type){
            case 'change':
              const changedPage = profile.pages.find(p => {
                const filename = `${p.name || p.pageId}.html`
                return path === filename
              })
              if(changedPage){
                await pageSyncOne(client, profile, changedPage)
              }
              break
          }
          wss.clients.forEach(ws => {
            ws.send(JSON.stringify({type: 'update'}))
          })
        } catch (err) {
          console.error(formatAxiosError(err))
        }
      })
    }
  })

program
  .command('auth')
  .description('Authenticate and verify admin access')
  .action(async () => {
    console.log('Authentication process...')
    console.log(`Auth type: ${config.authType || 'legacy'}`)

    console.log('Verifying admin access...')
    try {
      const response = await client.get('/admin', {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400
      })

      if (response.status >= 300 && response.status < 400) {
        const redirectLocation = response.headers['location']
        if (redirectLocation && redirectLocation.includes('/admins/sign_in')) {
          console.error('Authentication failed: Redirected to login page')
          throw new Error('Authentication failed: Session is invalid or expired')
        }
      }

      if (response.status >= 200 && response.status < 300) {
        console.log('Successfully authenticated and verified admin access')
        console.log(`Status: ${response.status} ${response.statusText}`)
        console.log(`Admin page URL: ${config.baseUrl}admin`)

        if (typeof response.data === 'string' && response.data.includes('admin')) {
          console.log('Admin page content verified')
        }
      } else {
        console.error('Unexpected response status:', response.status)
        throw new Error(`Unexpected status: ${response.status}`)
      }
    } catch (err) {
      console.error('Failed to verify admin access')
      if (err instanceof Error) {
        console.error('Error:', err.message)
      }
      throw err
    }
  })

program.parse()