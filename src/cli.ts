#! /usr/bin/env node

import { Command } from 'commander'
import { pull, sync, update, del, updateBinaryies } from './lib/api.js'
import { WebSocketServer } from 'ws'
import chokidar from 'chokidar'
import fsp from 'fs/promises'
import path, { parse, resolve } from 'path'
import { config } from './lib/load-config.js'

const rootPath = path.join(process.cwd(), 'theme')

const program = new Command()
program
  .command('pull')
  .argument('[themeid]', 'Theme ID', config.themeId)
  .action(async (themeId) => {
    await pull(rootPath, themeId)
  })

program
  .command('sync')
  .option('-w, --watch', 'watch files')
  .action(async (options) => {
    console.log('sync: uploading zip')
    await sync(rootPath)
    console.log('sync: complete')

    if(options.watch){
      const wss = new WebSocketServer({
        port: 8080
      })
      wss.on('connection', (ws, req) => {
        console.log(`connected ${req.socket.remoteAddress}`)
      })
      
      const watcher = chokidar.watch(rootPath, {cwd: rootPath, ignoreInitial: true})
      watcher.on('all', async (type, path, status) => {
        switch(type){
          case 'add':
          case 'change':
            if(['html', 'liquid', 'svg', 'js', 'json', 'css',].includes(parse(path).ext)){
              await update(path, await fsp.readFile(resolve(rootPath, path), 'utf8'))
            } else {
              await updateBinaryies(rootPath, [resolve(rootPath, path)])
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

program.parse()