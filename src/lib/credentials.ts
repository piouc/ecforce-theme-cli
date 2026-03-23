import fsp from 'fs/promises'
import { join, dirname, resolve } from 'path'
import { Cookie } from 'tough-cookie'

export type Credentials = {
  cookies: {
    key: string
    value: string
    domain: string
    path: string
    expires?: string
    httpOnly?: boolean
    secure?: boolean
    sameSite?: string
  }[]
  expiresAt: string
}

export const loadCredentials = async (configPath: string): Promise<Credentials | null> => {
  try {
    const credentialsPath = getCredentialsPath(configPath)
    const content = await fsp.readFile(credentialsPath, 'utf8')
    const credentials: Credentials = JSON.parse(content)

    if (new Date(credentials.expiresAt) < new Date()) {
      console.log('Credentials expired')
      return null
    }

    return credentials
  } catch (err) {
    return null
  }
}

export const saveCredentials = async (configPath: string, credentials: Credentials): Promise<void> => {
  const credentialsPath = getCredentialsPath(configPath)
  await fsp.writeFile(credentialsPath, JSON.stringify(credentials, null, 2), 'utf8')
  console.log('Credentials saved')
}

export const getCredentialsPath = (configPath: string): string => {
  const absoluteConfigPath = resolve(configPath)
  const dir = dirname(absoluteConfigPath)
  return join(dir, 'ecforce.credentials.json')
}

export const cookiesToCredentials = (cookies: Cookie[]): Credentials => {
  return {
    cookies: cookies.map(cookie => {
      let expiresStr: string | undefined = undefined
      if (cookie.expires && cookie.expires !== 'Infinity') {
        const expiresDate = typeof cookie.expires === 'string' ? new Date(cookie.expires) : cookie.expires
        if (expiresDate.getTime() > Date.now()) {
          expiresStr = expiresDate.toISOString()
        }
      }

      return {
        key: cookie.key,
        value: cookie.value,
        domain: cookie.domain || '',
        path: cookie.path || '/',
        expires: expiresStr,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite
      }
    }),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  }
}

export const credentialsToCookies = (credentials: Credentials): Cookie[] => {
  return credentials.cookies.map(cookie => {
    let expiresDate = cookie.expires ? new Date(cookie.expires) : undefined
    const isSessionCookie = expiresDate && expiresDate.getTime() < Date.now()

    if (!expiresDate || isSessionCookie) {
      expiresDate = new Date(credentials.expiresAt)
    }

    let sameSite = cookie.sameSite
    if (sameSite === 'None' || sameSite === 'none') {
      sameSite = undefined
    }

    return new Cookie({
      key: cookie.key,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: expiresDate,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: sameSite as any
    })
  })
}
