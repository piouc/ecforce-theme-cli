import axios, { AxiosError } from 'axios';
import { config } from './load-config.js';
import { auth } from './auth.js';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';

export const jar = new CookieJar()

export const client = axios.create({
  baseURL: config.baseUrl,
  headers: {
    Authorization: 'Basic ' + Buffer.from(`${config.basicAuthUsername}:${config.basicAuthPassword}`).toString('base64')
  },
  jar
})

wrapper(client)
await auth(client)

client.interceptors.response.use(null, err => {
  if(err instanceof AxiosError){
    console.error(err)
  }
})