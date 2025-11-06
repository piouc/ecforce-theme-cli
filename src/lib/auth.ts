import { AxiosInstance, AxiosError } from 'axios'
import querystring from 'querystring'
import { Config } from './load-config.js'
import { loadCredentials, credentialsToCookies, cookiesToCredentials, saveCredentials } from './credentials.js'
import { loginWithEcforceAccount } from './ecforce-account-auth.js'
import { Client } from './create-client.js'

export const auth = async (client: Client, config: Config, configPath: string) => {
  if (config.authType === 'ecforceAccount') {
    await signInWithEcforceAccount(client, config, configPath)
  } else {
    await signInLegacy(client, config, configPath)
  }
  return client
}

const signInWithEcforceAccount = async (client: Client, config: Config, configPath: string) => {
  // Try to load existing credentials
  const credentials = await loadCredentials(configPath)

  if (credentials) {
    console.log('Using cached credentials...')
    const cookies = credentialsToCookies(credentials)

    // Set cookies in the jar
    // Use the same protocol as baseUrl for all cookies
    const baseProtocol = new URL(config.baseUrl).protocol.replace(':', '')

    for (const cookie of cookies) {
      // Build URL from cookie domain and path, using baseUrl's protocol
      const domain = cookie.domain?.startsWith('.') ? cookie.domain.slice(1) : cookie.domain
      const cookieUrl = `${baseProtocol}://${domain}${cookie.path || '/'}`
      await client.jar.setCookie(cookie, cookieUrl)
    }

    // Verify the credentials are still valid
    try {
      const verifyResponse = await client.get('/admin', {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400
      })

      // Check if redirected to login page
      if (verifyResponse.status >= 300 && verifyResponse.status < 400) {
        const redirectLocation = verifyResponse.headers['location']
        if (redirectLocation && redirectLocation.includes('/admins/sign_in')) {
          console.log('Cached credentials expired, re-authenticating...')
          throw new Error('Credentials expired')
        }
      }

      console.log('Cached credentials are valid')
      return
    } catch (err) {
      console.log('Cached credentials expired, re-authenticating...')
    }
  }

  // Perform fresh login with Puppeteer
  const cookies = await loginWithEcforceAccount(config, configPath)

  // Set cookies in the jar
  // Use the same protocol as baseUrl for all cookies
  const baseProtocol = new URL(config.baseUrl).protocol.replace(':', '')

  for (const cookie of cookies) {
    // Build URL from cookie domain and path, using baseUrl's protocol
    const domain = cookie.domain?.startsWith('.') ? cookie.domain.slice(1) : cookie.domain
    const cookieUrl = `${baseProtocol}://${domain}${cookie.path || '/'}`
    await client.jar.setCookie(cookie, cookieUrl)
  }
}

const signInLegacy = async (client: Client, config: Config, configPath: string) => {
  // Try to load existing credentials
  const credentials = await loadCredentials(configPath)

  if (credentials) {
    console.log('Using cached credentials...')
    const cookies = credentialsToCookies(credentials)

    // Set cookies in the jar
    // Use the same protocol as baseUrl for all cookies
    const baseProtocol = new URL(config.baseUrl).protocol.replace(':', '')

    for (const cookie of cookies) {
      // Build URL from cookie domain and path, using baseUrl's protocol
      const domain = cookie.domain?.startsWith('.') ? cookie.domain.slice(1) : cookie.domain
      const cookieUrl = `${baseProtocol}://${domain}${cookie.path || '/'}`
      await client.jar.setCookie(cookie, cookieUrl)
    }

    // Verify the credentials are still valid
    try {
      const verifyResponse = await client.get('/admin', {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400
      })

      // Check if redirected to login page
      if (verifyResponse.status >= 300 && verifyResponse.status < 400) {
        const redirectLocation = verifyResponse.headers['location']
        if (redirectLocation && redirectLocation.includes('/admins/sign_in')) {
          console.log('Cached credentials expired, re-authenticating...')
          throw new Error('Credentials expired')
        }
      }

      console.log('Cached credentials are valid')
      return
    } catch (err) {
      console.log('Cached credentials expired, re-authenticating...')
    }
  }

  // Perform fresh login
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

  // Save credentials after successful login
  const cookies = await client.jar.getCookies(config.baseUrl)
  const savedCredentials = cookiesToCredentials(cookies)
  await saveCredentials(configPath, savedCredentials)
}