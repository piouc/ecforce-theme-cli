import axios, { AxiosError, AxiosInstance, toFormData } from 'axios'
import { config } from './load-config.js'
import FormData from 'form-data'
import querystring from 'querystring'
import { CookieJar } from 'tough-cookie'

const jar = new CookieJar()

export const auth = async (client: AxiosInstance) => {
  await signIn(client)
  return client
}

const signIn = async (client: AxiosInstance) => {
  const signInPageHtml = await client<string>({
    method: 'get',
    url: '/admins/sign_in',
    auth: {
      username: config.basicAuthUsername,
      password: config.basicAuthPassword
    }
  }).then(res => res.data)
  const authenticityToken = signInPageHtml.match(/(?<=<input type="hidden" name="authenticity_token" value=").+?(?=")/)?.[0]
  if(!authenticityToken) throw new Error('Failed load sign in page.')

  await client({
    method: 'post',
    url: '/admins/sign_in',
    auth: {
      username: config.basicAuthUsername,
      password: config.basicAuthPassword
    },
    data: querystring.encode({
      'authenticity_token': authenticityToken,
      'admin[email]': config.username,
      'admin[password]': config.password,
      'admin[remember_me]': '1',
      'commit': 'Start'
    })
  })
  console.log('Signed in')
}