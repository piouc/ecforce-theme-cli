#! /usr/bin/env node

import { Command } from 'commander'
import { pull, sync, update, del } from './lib/api.js'
import appRootPath from 'app-root-path'
import { WebSocketServer } from 'ws'
import chokidar from 'chokidar'
import fsp from 'fs/promises'
import { resolve } from 'path'

const rootPath = appRootPath.resolve('/theme')

const program = new Command()
program
  .command('pull')
  .argument('<theme id>')
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

      const watcher = chokidar.watch(appRootPath.resolve('/theme'), {cwd: rootPath, ignoreInitial: true})
      watcher.on('all', async (type, path, status) => {
        switch(type){
          case 'add':
            await update(path, await fsp.readFile(resolve(rootPath, path), 'utf8'))
            console.log(`add ${path}`)
            break
          case 'change':
            await update(path, await fsp.readFile(resolve(rootPath, path), 'utf8'))
            console.log(`update ${path}`)
            break
          case 'unlink':
            await del(path)
            console.log(`delete ${path}`)
            break
        }
        wss.clients.forEach(ws => {
          ws.send('update')
        })
      })
    }
  })

program.parse()