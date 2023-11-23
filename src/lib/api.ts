import archiver from 'archiver';
import { client, jar } from './client.js';
import { config } from './load-config.js';
import querystring from 'node:querystring';
import { RawData, WebSocket } from 'ws'
import unzipStream from 'unzip-stream'
import { IncomingMessage } from 'node:http'
import fsp from 'fs/promises'
import { relative } from 'node:path'
import FormData from 'form-data';

export const sync = async (rootPath: string) => {
  const archive = archiver('zip')
  const formData = new FormData()
  archive.directory(rootPath, false)
  formData.append('file', archive, `${config.themeId}.zip`)
  archive.finalize()

  await client({
    method: 'post',
    url: `/admin/themes/${config.themeId}/theme_zip_upload`,
    data: formData
  })
}
 
const waitOpen = (ws: WebSocket) => {
  return new Promise((resolve, reject) => {
    if(ws.readyState >= WebSocket.OPEN){
      resolve(ws)
    } else {
      ws.on('open', () => resolve(ws))
    }
  })
}

type Message<T extends string = string, K extends Record<string, any> = Record<string, any>> = [
  T,
  K,
  any
]
type NewNotificationMessage = Message<'new_notification', {
  msg: string,
  url: string
}>
const waitForMessage = <T extends Message>(ws: WebSocket, predicate: (data: T) => unknown): Promise<T> => {
  return new Promise<T>((resolve) => {
    const listener = (message: RawData) => {
      const data = JSON.parse(message.toString()) as T
      if(predicate(data)){
        resolve(data)
      }
    }
    ws.on('message', listener)
  })
}
const waitForNotification = async (ws: WebSocket, predicate: (data: NewNotificationMessage[1]) => unknown) => {
  const message = await waitForMessage<NewNotificationMessage>(ws, (data => {
    const [type, payload] = data
    return type === 'new_notification' && predicate(payload)
  }))
  return message[1]
}

const waitClose = (stream: NodeJS.ReadableStream | NodeJS.WritableStream) => {
  return new Promise<void>((resolve, reject) => {
    stream.on('close', () => resolve())
  })
}

export const pull = async (rootPath: string, themeId: string) => {
  const websocketUrl = `wss://${new URL(config.baseUrl).host}/websocket`
  const ws = new WebSocket(websocketUrl, {
    headers: {
      'cookie': await jar.getCookieString(websocketUrl),
    }
  })
  await waitOpen(ws)
  ws.send(JSON.stringify(["websocket_rails.subscribe",{"channel":"global"},{"id":65536 * (1 + Math.random()) | 0}]))

  client({
    method: 'post',
    url: `/admin/themes/${themeId}/theme_download`
  })
  const {url} = await waitForNotification(ws, data => {
    return /^テーマ ダウンロード\(.*\) を登録しました。$/.test(data.msg)
  })
  await waitForNotification(ws, data => {
    return /^テーマ ダウンロード\(.*\) が完了しました。$/.test(data.msg) && data.url === url
  })
  ws.close()

  const res = await client<string>({
    method: 'get',
    url: url,
    responseType: 'text'
  })
  const attachmentUrl = res.data.match(/(?<=<a href=')\/admin\/attachments\/\d+(?=' style=''>)/)?.[0]
  if(!attachmentUrl) throw new Error('Failed to get attachment url.')

  const downloadRes = await client<IncomingMessage>({
    url: attachmentUrl,
    responseType: 'stream'
  })

  await fsp.rm(rootPath, {recursive: true, force: true})
  await waitClose(downloadRes.data.pipe(unzipStream.Extract({path: rootPath})))
  
  console.log('complete')
}

export const update = async (path: string, code: string) => {
  await client({
    method: 'put',
    url: `/admin/themes/${config.themeId}/file/${path.replace(/^\//, '')}`,
    data: querystring.encode({
      code: code,
      prev_code: ''
    })
  })
}

export const updateBinaryies = async (rootPath: string, paths: string[]) => {
  const archive = archiver('zip')
  const formData = new FormData()
  paths.forEach(path => archive.file(path, {name: relative(rootPath, path)}))

  formData.append('file', archive, `${config.themeId}.zip`)
  archive.finalize()

  await client({
    method: 'post',
    url: `/admin/themes/${config.themeId}/theme_zip_upload`,
    data: formData
  })
}

export const del = async (path: string) => {
  await client({
    method: 'put',
    url: `/admin/themes/${config.themeId}/delete_theme_file`,
    data: querystring.encode({
      'delete_filepath': `${path.replace(/^\//, '')}`
    })
  })
}

export const getPreviewUrl = async (themeId: string) => {
  const res = await client<{'return_url': string}>({
    method: 'post',
    url: `/admin/previews`,
    data: querystring.encode({
      'source_id': themeId,
      'source_type': 'Theme'
    })
  })
  return new URL(res.data.return_url, config.baseUrl).href
}