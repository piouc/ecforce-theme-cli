import { AxiosInstance, AxiosError } from 'axios'
import { config } from './load-config.js'
import querystring from 'querystring'

export const auth = async (client: AxiosInstance) => {
  await signIn(client)
  return client
}

const signIn = async (client: AxiosInstance) => {
  const signInPageHtml = await client<string>({
    method: 'get',
    url: '/admins/sign_in'
  }).then(res => res.data)
  const authenticityToken = signInPageHtml.match(/(?<=<input type="hidden" name="authenticity_token" value=").+?(?=")/)?.[0]
  if(!authenticityToken) throw new Error('Failed load sign in page.')

  try {
    await client({
      method: 'post',
      url: '/admins/sign_in',
      data: querystring.encode({
        'authenticity_token': authenticityToken,
        'admin[email]': config.username,
        'admin[password]': config.password,
        'admin[remember_me]': '1',
        'commit': 'Start'
      })
    })
  } catch(err){
    if(err instanceof AxiosError){
      console.error(err.code)
    } else {
      console.error(err)
    }
  }
  console.log('Signed in')
}