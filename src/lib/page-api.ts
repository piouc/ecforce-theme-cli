import { Client } from './create-client.js'
import { PageProfile } from './load-config.js'
import { decode } from 'html-entities'
import fsp from 'fs/promises'
import { join } from 'path'

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

const getInputValue = (html: string, name: string) => {
  const regex = new RegExp(`<input[^>]+name="${escapeRegExp(name)}"[^>]*>`)
  const tag = html.match(regex)?.[0]
  if(!tag) return ''
  return decode(tag.match(/value="([^"]*)"/)?.[1] ?? '')
}

const getSelectValue = (html: string, name: string) => {
  const blockRegex = new RegExp(`<select[^>]+name="${escapeRegExp(name)}"[^>]*>[\\s\\S]*?<\\/select>`)
  const block = html.match(blockRegex)?.[0] ?? ''
  return block.match(/<option[^>]*selected[^>]*value="([^"]*)"/)?.[1] ?? ''
}

const metaFields = ['page[state]', 'page[slug]', 'page[name]', 'page[title]', 'page[meta_description]', 'page[meta_keywords]']

const getMetaValues = (html: string) => {
  const values: Record<string, string> = {}
  for(const name of metaFields){
    if(name === 'page[state]'){
      values[name] = getSelectValue(html, name)
    } else {
      values[name] = getInputValue(html, name)
    }
  }
  return values
}

const getFilename = (page: { pageId: string, name?: string }) => {
  return `${page.name || page.pageId}.html`
}

export const findPage = (profile: PageProfile, identifier: string) => {
  return profile.pages.find(p => p.name === identifier || p.pageId === identifier)
}

export const pagePull = async (client: Client, profile: PageProfile, pages: PageProfile['pages']) => {
  await fsp.mkdir(profile.dir, {recursive: true})
  for(const page of pages){
    const res = await client<string>({
      method: 'get',
      url: `/admin/pages/${page.pageId}/edit`,
      responseType: 'text'
    })
    const content = getValue(res.data, 'page[content]') ?? ''
    await fsp.writeFile(join(profile.dir, getFilename(page)), content)
    console.log(`pull ${getFilename(page)}`)
  }
}

export const pageSyncOne = async (client: Client, profile: PageProfile, page: PageProfile['pages'][number]) => {
  const res = await client<string>({
    method: 'get',
    url: `/admin/pages/${page.pageId}/edit`,
    responseType: 'text'
  })
  const token = getToken(res.data)
  if(!token) throw new Error('Can not get authenticity token.')

  const meta = getMetaValues(res.data)
  const content = await fsp.readFile(join(profile.dir, getFilename(page)), 'utf8')

  await client({
    method: 'post',
    url: `/admin/pages/${page.pageId}`,
    data: new URLSearchParams({
      utf8: '✓',
      _method: 'put',
      authenticity_token: token,
      ...meta,
      'page[content]': content,
      'page[content_mobile]': content,
    }).toString()
  })
  console.log(`sync ${getFilename(page)}`)
}

export const pageSync = async (client: Client, profile: PageProfile, pages: PageProfile['pages']) => {
  for(const page of pages){
    await pageSyncOne(client, profile, page)
  }
}
