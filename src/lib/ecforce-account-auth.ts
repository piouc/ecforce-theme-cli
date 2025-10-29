import puppeteer, { Browser } from 'puppeteer'
import { Config } from './load-config.js'
import { cookiesToCredentials, loadCredentials, saveCredentials } from './credentials.js'
import { Cookie } from 'tough-cookie'
import readline from 'readline'

const promptOTP = (): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise((resolve) => {
    rl.question('Enter your OTP code from Google Authenticator: ', (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

export const loginWithEcforceAccount = async (config: Config, configPath: string): Promise<Cookie[]> => {
  console.log('Starting ecforce Account login...')

  const browser = await puppeteer.launch({
    args: [
      `--auth-server-allowlist=*`,
      `--auth-negotiate-delegate-allowlist=*`
    ]
  })

  try {
    const page = await browser.newPage()
    await page.authenticate({
      username: config.basicAuthUsername,
      password: config.basicAuthPassword
    })

    console.log('Navigating to ecforce accounts...')
    await page.goto('https://accounts.ec-force.com/', { waitUntil: 'networkidle2' })

    console.log('Entering email...')
    await page.waitForSelector('input[type="email"], input[name="username"]', { timeout: 10000 })
    await page.type('input[type="email"], input[name="username"]', config.username)

    console.log('Submitting email...')
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.keyboard.press('Enter')
    ])

    console.log('Entering password...')
    await page.waitForSelector('input[type="password"]', { timeout: 10000 })
    await page.type('input[type="password"]', config.password)

    console.log('Submitting password...')
    await page.keyboard.press('Enter')

    await new Promise(resolve => setTimeout(resolve, 2000))

    const pageContent = await page.content()

    if (pageContent.includes('fingerprint') || pageContent.includes('face recognition')) {
      console.log('Handling biometric authentication screen...')

      const rememberCheckbox = await page.$('input[type="checkbox"]')
      if (rememberCheckbox) {
        await rememberCheckbox.click()
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      const buttons1 = await page.$$('button')
      for (const button of buttons1) {
        const text = await page.evaluate(el => el.textContent, button)
        if (text?.includes('Continue')) {
          await button.click()
          break
        }
      }
      await new Promise(resolve => setTimeout(resolve, 2000))

      const buttons2 = await page.$$('button')
      for (const button of buttons2) {
        const text = await page.evaluate(el => el.textContent, button)
        if (text?.includes('Try another method')) {
          await button.click()
          await new Promise(resolve => setTimeout(resolve, 1000))
          break
        }
      }

      const buttons3 = await page.$$('button')
      for (const button of buttons3) {
        const text = await page.evaluate(el => el.textContent, button)
        if (text?.includes('Google Authenticator') || text?.includes('Authenticator')) {
          await button.click()
          break
        }
      }
    }

    await new Promise(resolve => setTimeout(resolve, 2000))
    const currentContent = await page.content()

    if (currentContent.includes('one-time') || currentContent.includes('code')) {
      console.log('OTP required')

      const otp = await promptOTP()

      await page.waitForSelector('input[type="text"], input[name="otp"]', { timeout: 10000 })
      await page.type('input[type="text"], input[name="otp"]', otp)

      const rememberCheckboxes = await page.$$('input[type="checkbox"]')
      for (const checkbox of rememberCheckboxes) {
        const label = await page.evaluate(el => {
          const parent = el.parentElement
          return parent?.textContent || ''
        }, checkbox)
        if (label.includes('Remember')) {
          await checkbox.click()
          await new Promise(resolve => setTimeout(resolve, 500))
          break
        }
      }

      console.log('Submitting OTP...')
      await page.keyboard.press('Enter')
    }

    console.log('Waiting for login to complete...')
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })

    console.log('Waiting for div elements to click...')
    const divSelector = 'div:has(> svg):has(> h2)'

    await page.waitForSelector(divSelector, { timeout: 10000 })
    console.log('Found div elements, clicking all...')

    const divElements = await page.$$(divSelector)
    console.log(`Found ${divElements.length} div elements to click`)

    if (divElements.length === 0) {
      throw new Error('No div elements found matching selector: div:has(> svg):has(> h2)')
    }

    for (let i = 0; i < divElements.length; i++) {
      await divElements[i].click()
      console.log(`Clicked div element ${i + 1}/${divElements.length}`)
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    console.log('Waiting for site login button...')
    const baseUrlWithoutTrailingSlash = config.baseUrl.replace(/\/$/, '')
    const fullLoginUrl = `${baseUrlWithoutTrailingSlash}/ec_force/admins/auth/ecforce_id`
    const loginButtonSelector = `a[href="${fullLoginUrl}"]`

    await page.waitForSelector(loginButtonSelector, { timeout: 15000 })
    console.log('Login button found')

    const urlPromise = new Promise<string>((resolve) => {
      browser.once('targetcreated', async (target) => {
        const url = target.url()
        resolve(url)
      })
    })

    console.log('Clicking login button...')
    await page.click(loginButtonSelector)

    console.log('Waiting for new tab...')
    const actualUrl = await urlPromise
    console.log(`Initial URL (before redirect): ${actualUrl}`)

    await new Promise(resolve => setTimeout(resolve, 500))

    const pages = await browser.pages()
    const targetPage = pages[pages.length - 1]
    await targetPage.close()

    const authenticatedPage = await browser.newPage()

    await authenticatedPage.authenticate({
      username: config.basicAuthUsername,
      password: config.basicAuthPassword
    })

    console.log('Opening admin page with Basic Auth...')

    await authenticatedPage.goto(actualUrl, { waitUntil: 'networkidle2', timeout: 30000 })

    console.log('Admin page loaded')

    const currentUrl = authenticatedPage.url()
    console.log(`Current URL: ${currentUrl}`)

    if (currentUrl.includes('/admins/sign_in')) {
      throw new Error('Failed to login: Still on sign-in page')
    }

    console.log('Extracting cookies...')
    const puppeteerCookies = await authenticatedPage.cookies()

    const cookies: Cookie[] = puppeteerCookies.map((cookie: any) => {
      let sameSite = cookie.sameSite
      if (sameSite === 'None' || sameSite === 'none') {
        sameSite = undefined
      }

      let expiresDate: Date | undefined
      if (cookie.expires && cookie.expires > 0) {
        expiresDate = new Date(cookie.expires * 1000)
      }

      if (!expiresDate || expiresDate.getTime() < Date.now()) {
        expiresDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }

      return new Cookie({
        key: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: expiresDate,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: sameSite as any
      })
    })

    const credentials = cookiesToCredentials(cookies)
    await saveCredentials(configPath, credentials)

    console.log('Login successful!')
    return cookies

  } finally {
    await browser.close()
  }
}
