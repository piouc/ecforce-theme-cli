import { Client, createClient } from './create-client.js'
import { LpProfile } from './load-config.js'
import { decode } from 'html-entities'
import fsp from 'fs/promises'
import { join } from 'path'

const fileMap = [
  {
    name: 'template[header_content]',
    filename: 'header.html'
  },
  {
    name: 'template[content]',
    filename: 'body.html'
  },
  {
    name: 'template[footer_content]',
    filename: 'footer.html'
  },
  {
    name: 'template[css]',
    filename: 'style.css'
  },
  {
    name: 'template[javascript]',
    filename: 'script.js'
  }
]

const escapeRegExp = (str: string) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const getValue = (html: string, name: string) => {
  const regex = new RegExp(`(?<=<textarea [^>]*name="${escapeRegExp(name)}"[^>]*>)[\\s\\S]*?(?=</textarea>)`)
  const match = html.match(regex)?.[0]
  if(match){
    return decode(match.replace(/^(\n|\r\n)+|(\n|\r\n)+$/g, ''))
  }
}

const getToken = (html: string) => {
  return html.match(/(?<=<input type="hidden" name="authenticity_token" value=")[^"]*?(?=" \/>)/)?.[0]
}

export const lpPull = async (client: Client, profile: LpProfile) => {
  const res = await client<string>({
    method: 'get',
    url: `/admin/templates/${profile.lpId}/edit`,
    responseType: 'text'
  })
  getValue(res.data, 'template[content]')
  await fsp.mkdir(profile.dir, {recursive: true})
  for(const {name, filename} of fileMap){
    await fsp.writeFile(join(profile.dir, filename), getValue(res.data, name) ?? '')
  }
}

export const lpSync = async (client: Client, profile: LpProfile) => {
  const res = await client<string>({
    method: 'get',
    url: `/admin/templates/${profile.lpId}/edit`,
    responseType: 'text'
  })

  const data = Object.fromEntries(await Promise.all(fileMap.map(async ({name, filename}) => {
    return [name, await fsp.readFile(join(profile.dir, filename), 'utf8')]
  })))
  const token = getToken(res.data)
  if(!token) throw new Error('Can not get authenticity token.')
  console.log('upload')
  await client({
    method: 'post',
    url: `/admin/templates/${profile.lpId}`,
    data: new URLSearchParams({
      ...data,
      utf8: '✓',
      _method: 'patch',
      authenticity_token: token,
    }).toString()
  })
  console.log(profile.lpId)
  console.log('complete')
}