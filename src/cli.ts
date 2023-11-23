#! /usr/bin/env node

import { Command } from '@commander-js/extra-typings'
import { pull, sync, update, del, updateBinaryies, getPreviewUrl } from './lib/api.js'
import { WebSocketServer } from 'ws'
import chokidar from 'chokidar'
import fsp from 'fs/promises'
import { parse, resolve } from 'path'
import { config } from './lib/load-config.js'
import open from 'open'

const program = new Command()
program
  .command('pull')
  .argument('[themeid]', 'Theme ID', config.themeId)
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
  

program.parse()