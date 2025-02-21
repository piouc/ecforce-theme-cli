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
import { getCurrentBranchName, getLpProfile, getThemeProfile } from './lib/utils.js'
import pLimit from 'p-limit'
import pDebounce from 'p-debounce'
import { createClient } from './lib/create-client.js'

type GlobalOptions = {
  config: string
}

const program = new Command()
  .option('-c, --config <path>', 'config file', 'ecforce.config.json')

const config = await loadConfig(program.opts().config)
const client = await createClient(config)

program
  .command('pull')
  .action(async () => {
    const profile = getThemeProfile(config, await getCurrentBranchName())
    if(!profile) throw new Error('')
    await pull(client, profile, config.baseUrl)
  })

program
  .command('sync')
  .option('-w, --watch', 'watch files')
  .action(async (options) => {
    const profile = getThemeProfile(config, await getCurrentBranchName())
    if(!profile) throw new Error('')

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
      }))
    }
  })

program
  .command('preview')
  .action(async () => {
    const profile = getThemeProfile(config, await getCurrentBranchName())
    if(!profile) throw new Error('')
    const url = await getPreviewUrl(client, profile, config.baseUrl)
    await open(url)
  })

program
  .command('lp-pull')
  .action(async () => {
    const profile = getLpProfile(config, await getCurrentBranchName())
    if(!profile) throw new Error('')
    await lpPull(client, profile)
  })

program
  .command('lp-sync')
  .option('-w, --watch', 'watch files')
  .action(async (options) => {
    const profile = getLpProfile(config, await getCurrentBranchName())
    if(!profile) throw new Error('')
      
    await lpSync(client, profile)
    
    if(options.watch){
      const wss = new WebSocketServer({
        port: 8080
      })
      wss.on('connection', (ws, req) => {
        console.log(`connected ${req.socket.remoteAddress}`)
      })
      
      const watcher = chokidar.watch(profile.dir, {cwd: profile.dir, ignoreInitial: true})
      watcher.on('all', async (type, path, status) => {
        switch(type){
          case 'change':
            lpSync(client, profile)
            console.log(`sync`)
            break
        }
        wss.clients.forEach(ws => {
          ws.send(JSON.stringify({type: 'update'}))
        })
      })
    }
  })

program.parse()