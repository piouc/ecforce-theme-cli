import archiver from 'archiver'
import { client, jar } from './client.js'
import { config, ThemeProfile } from './load-config.js'
import querystring from 'node:querystring'
import { RawData, WebSocket } from 'ws'
import unzipStream from 'unzip-stream'
import { IncomingMessage } from 'node:http'
import fsp from 'fs/promises'
import { join, relative } from 'node:path'
import FormData from 'form-data'

export const getSettingsSchema = async (profile: ThemeProfile) => {
  const schema = JSON.parse(await fsp.readFile(join(profile.dir, 'ec_force/config/settings_schema.json'), 'utf8'))
  schema.theme.name = profile.name
  return JSON.stringify(schema, null, '  ')
}

export const sync = async (profile: ThemeProfile) => {
  const archive = archiver('zip')
  const formData = new FormData()
  archive.directory(profile.dir, false)
  formData.append('file', archive, `${profile.themeId}.zip`)
  archive.finalize()

  await update(profile, 'ec_force/config/settings_schema.json', await getSettingsSchema(profile))
  await client({
    method: 'post',
    url: `/admin/themes/${profile.themeId}/theme_zip_upload`,
    data: formData
  })
}

const waitClose = (stream: NodeJS.ReadableStream | NodeJS.WritableStream) => {
  return new Promise<void>((resolve, reject) => {
    stream.on('close', () => resolve())
  })
}

const getThemeZipUrl = (profile: ThemeProfile) => new Promise<string>(async (resolve, reject) => {
  const {host} = new URL(config.baseUrl)
  const wsUrl = `wss://${host}/websocket`
  const ws = new WebSocket(wsUrl, {
    headers: {
      'cookie': await jar.getCookieString(wsUrl)
    }
  })
  let url:string | null = null
  ws.on('open', () => {
    ws.send(JSON.stringify({
      command: 'subscribe',
      identifier: `{"channel":"EcForce::NotificationChannel","hostname":"${host}"}`
    }), () => {
      client({
        method: 'post',
        url: `/admin/themes/${profile.themeId}/theme_download`
      })
    })
  })
  ws.on('message', async rawData => {
    const data = JSON.parse(rawData.toString())
    if(!url && data?.message?.msg?.match(/^テーマ ダウンロード\(.*\) を登録しました。$/)){
      url = data.message.url as string
    }
    if(url && data?.message?.msg?.match(/^テーマ ダウンロード\(.*\) が完了しました。$/) && data?.message?.url === url){
      const res = await client<string>({
        method: 'get',
        url: url,
        responseType: 'text'
      })
      const attachmentUrl = res.data.match(/(?<=<a href=')\/admin\/attachments\/\d+(?=' style=''>)/)?.[0]
      if(!attachmentUrl) throw new Error('Failed to get attachment url.')
      resolve(attachmentUrl)
      ws.close()
    }
  })
})

export const pull = async (profile: ThemeProfile) => {
  const url = await getThemeZipUrl(profile)
  const downloadRes = await client<IncomingMessage>({
    url: url,
    responseType: 'stream'
  })

  await fsp.rm(profile.dir, {recursive: true, force: true})
  await waitClose(downloadRes.data.pipe(unzipStream.Extract({path: profile.dir})))
  
  console.log('complete')
}

export const update = async (profile: ThemeProfile, path: string, code: string) => {
  await client({
    method: 'put',
    url: `/admin/themes/${profile.themeId}/file/${path.replace(/^\//, '')}`,
    data: querystring.encode({
      code: code,
      prev_code: ''
    })
  })
}

export const updateBinaries = async (profile: ThemeProfile, paths: string[]) => {
  const archive = archiver('zip')
  const formData = new FormData()
  paths.forEach(path => archive.file(path, {name: relative(profile.dir, path)}))

  formData.append('file', archive, `${profile.themeId}.zip`)
  archive.finalize()

  await client({
    method: 'post',
    url: `/admin/themes/${profile.themeId}/theme_zip_upload`,
    data: formData
  })
}

export const del = async (profile: ThemeProfile, path: string) => {
  await client({
    method: 'put',
    url: `/admin/themes/${profile.themeId}/delete_theme_file`,
    data: querystring.encode({
      'delete_filepath': `${path.replace(/^\//, '')}`
    })
  })
}

export const getPreviewUrl = async (profile: ThemeProfile) => {
  const res = await client<{'return_url': string}>({
    method: 'post',
    url: `/admin/previews`,
    data: querystring.encode({
      'source_id': profile.themeId,
      'source_type': 'Theme'
    })
  })
  return new URL(res.data.return_url, config.baseUrl).href
}