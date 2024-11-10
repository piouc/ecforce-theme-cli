#! /usr/bin/env node

import { Command } from '@commander-js/extra-typings'
import { pull, sync, update, del, updateBinaries, getPreviewUrl, getSettingsSchema } from './lib/api.js'
import { WebSocketServer } from 'ws'
import chokidar from 'chokidar'
import fsp from 'fs/promises'
import path, { parse, resolve } from 'path'
import { config } from './lib/load-config.js'
import open from 'open'
import { lpPull, lpSync } from './lib/lp-api.js'
import { getCurrentBranchName, getLpProfile, getThemeProfile } from './lib/utils.js'
import pLimit from 'p-limit'
import pDebounce from 'p-debounce'

const program = new Command()
program
  .command('pull')
  .action(async () => {
    const profile = getThemeProfile(config, await getCurrentBranchName())
    if(!profile) throw new Error('')
    await pull(profile)
  })

program
  .command('sync')
  .option('-w, --watch', 'watch files')
  .action(async (options) => {
    const profile = getThemeProfile(config, await getCurrentBranchName())
    if(!profile) throw new Error('')

    console.log('sync: uploading zip')
    await sync(profile)
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
        await updateBinaries(profile, updateQueue.splice(0))
      }, 500)
      
      const watcher = chokidar.watch(profile.dir, {cwd: profile.dir, ignoreInitial: true})
      watcher.on('all', async (type, path) => limit(async () => {
        switch(type){
          case 'add':
          case 'change':
            if(['html', 'liquid', 'svg', 'js', 'json', 'css'].includes(parse(path).ext)){
              if(path === 'ec_force/config/settings_schema.json'){
                await update(profile, path, await getSettingsSchema(profile))
              } else {
                await update(profile, path, await fsp.readFile(resolve(profile.dir, path), 'utf8'))
              }
            } else {
              updateQueue.push(resolve(profile.dir, path))
              debouncedUpdateBinaries()
            }
            console.log(`${type} ${path}`)
            break
          case 'unlink':
            await del(profile, path)
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
    const url = await getPreviewUrl(profile)
    await open(url)
  })

program
  .command('lp-pull')
  .action(async () => {
    const profile = getLpProfile(config, await getCurrentBranchName())
    if(!profile) throw new Error('')
    await lpPull(profile)
  })

program
  .command('lp-sync')
  .option('-w, --watch', 'watch files')
  .action(async (options) => {
    const profile = getLpProfile(config, await getCurrentBranchName())
    if(!profile) throw new Error('')
      
    await lpSync(profile)
    
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
            lpSync(profile)
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