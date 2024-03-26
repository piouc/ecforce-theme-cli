#! /usr/bin/env node

import { Command } from '@commander-js/extra-typings'
import { pull, sync, update, del, updateBinaryies, getPreviewUrl } from './lib/api.js'
import { WebSocketServer } from 'ws'
import chokidar from 'chokidar'
import fsp from 'fs/promises'
import { parse, resolve } from 'path'
import { config } from './lib/load-config.js'
import open from 'open'
import { lpPull, lpSync } from './lib/lp-api.js'

const program = new Command()
program
  .command('pull')
  .argument('[theme-id]', 'Theme ID', config.themeId)
  .action(async (themeId) => {
    await pull(config.themeDir, themeId)
  })

program
  .command('sync')
  .option('-w, --watch', 'watch files')
  .action(async (options) => {
    console.log('sync: uploading zip')
    await sync(config.themeDir)
    console.log('sync: complete')

    if(options.watch){
      const wss = new WebSocketServer({
        port: 8080
      })
      wss.on('connection', (ws, req) => {
        console.log(`connected ${req.socket.remoteAddress}`)
      })
      
      const watcher = chokidar.watch(config.themeDir, {cwd: config.themeDir, ignoreInitial: true})
      watcher.on('all', async (type, path, status) => {
        switch(type){
          case 'add':
          case 'change':
            if(['html', 'liquid', 'svg', 'js', 'json', 'css',].includes(parse(path).ext)){
              await update(path, await fsp.readFile(resolve(config.themeDir, path), 'utf8'))
            } else {
              await updateBinaryies(config.themeDir, [resolve(config.themeDir, path)])
            }
            console.log(`${type} ${path}`)
            break
          case 'unlink':
            await del(path)
            console.log(`delete ${path}`)
            break
        }
        wss.clients.forEach(ws => {
          ws.send(JSON.stringify({type: 'update'}))
        })
      })
    }
  })

program
  .command('preview')
  .argument('[themeid]', 'Theme ID', config.themeId)
  .action(async (themeId) => {
    const url = await getPreviewUrl(themeId)
    await open(url)
  })

program
  .command('lp-pull')
  .argument('[lp-id]', 'LP ID', config.lpId)
  .action(async (lpId) => {
    if(!config.lpDir || !lpId) throw new Error('Usin lp command requied lpId and lpDir config.')
    await lpPull(config.lpDir, lpId)
  })

program
  .command('lp-sync')
  .argument('[lp-id]', 'LP ID', config.lpId)
  .option('-w, --watch', 'watch files')
  .action(async (lpId, options) => {
    const lpDir = config.lpDir
    if(!lpDir || !lpId) throw new Error('Usin lp command requied lpId and lpDir config.')
    await lpSync(lpDir, lpId)
    
    if(options.watch){
      const wss = new WebSocketServer({
        port: 8080
      })
      wss.on('connection', (ws, req) => {
        console.log(`connected ${req.socket.remoteAddress}`)
      })
      
      const watcher = chokidar.watch(lpDir, {cwd: lpDir, ignoreInitial: true})
      watcher.on('all', async (type, path, status) => {
        switch(type){
          case 'change':
            lpSync(lpDir, lpId)
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