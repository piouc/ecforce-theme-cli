import axios, { AxiosInstance } from 'axios';
import { auth } from './auth.js';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import { Config } from './load-config.js'
import { errorLogger } from 'axios-logger'

export type Client = AxiosInstance & {jar: CookieJar}

export const createClient = async (config: Config): Promise<Client> => {
  const jar = new CookieJar()

  const client = axios.create({
    baseURL: config.baseUrl,
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${config.basicAuthUsername}:${config.basicAuthPassword}`).toString('base64')
    },
    jar: jar
  })
  
  client.interceptors.response.use(res => {
    return res
  }, errorLogger)
  
  wrapper(client)
  await auth(client, config)

  return Object.assign(client, {jar})
}

