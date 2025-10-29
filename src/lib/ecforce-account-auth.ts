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
    headless: false, // Show browser for debugging
    args: [
      `--auth-server-allowlist=*`,
      `--auth-negotiate-delegate-allowlist=*`
    ]
  })

  try {
    const page = await browser.newPage()

    // Set Basic Auth for the target domain
    await page.authenticate({
      username: config.basicAuthUsername,
      password: config.basicAuthPassword
    })

    // Step 1: Navigate to ecforce accounts login
    console.log('Navigating to ecforce accounts...')
    await page.goto('https://accounts.ec-force.com/', { waitUntil: 'networkidle2' })

    // Step 2: Enter email
    console.log('Entering email...')
    await page.waitForSelector('input[type="email"], input[name="username"]', { timeout: 10000 })
    await page.type('input[type="email"], input[name="username"]', config.username)

    // Press Enter or click Continue to submit
    console.log('Submitting email...')
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.keyboard.press('Enter')
    ])

    // Step 3: Enter password
    console.log('Entering password...')
    await page.waitForSelector('input[type="password"]', { timeout: 10000 })
    await page.type('input[type="password"]', config.password)

    // Submit password
    console.log('Submitting password...')
    await page.keyboard.press('Enter')

    // Step 4: Handle MFA (if required)
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Check if we're on the MFA page
    const pageContent = await page.content()

    if (pageContent.includes('fingerprint') || pageContent.includes('face recognition')) {
      console.log('Handling biometric authentication screen...')

      // Click "Remember this device" checkbox
      const rememberCheckbox = await page.$('input[type="checkbox"]')
      if (rememberCheckbox) {
        await rememberCheckbox.click()
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      // Click Continue
      const buttons1 = await page.$$('button')
      for (const button of buttons1) {
        const text = await page.evaluate(el => el.textContent, button)
        if (text?.includes('Continue')) {
          await button.click()
          break
        }
      }
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Click "Try another method"
      const buttons2 = await page.$$('button')
      for (const button of buttons2) {
        const text = await page.evaluate(el => el.textContent, button)
        if (text?.includes('Try another method')) {
          await button.click()
          await new Promise(resolve => setTimeout(resolve, 1000))
          break
        }
      }

      // Select Google Authenticator
      const buttons3 = await page.$$('button')
      for (const button of buttons3) {
        const text = await page.evaluate(el => el.textContent, button)
        if (text?.includes('Google Authenticator') || text?.includes('Authenticator')) {
          await button.click()
          break
        }
      }
    }

    // Check if OTP is required
    await new Promise(resolve => setTimeout(resolve, 2000))
    const currentContent = await page.content()

    if (currentContent.includes('one-time') || currentContent.includes('code')) {
      console.log('OTP required')

      // Prompt user for OTP
      const otp = await promptOTP()

      // Enter OTP
      await page.waitForSelector('input[type="text"], input[name="otp"]', { timeout: 10000 })
      await page.type('input[type="text"], input[name="otp"]', otp)

      // Click "Remember this device" checkbox
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

      // Submit OTP
      console.log('Submitting OTP...')
      await page.keyboard.press('Enter')
    }

    // Step 5: Wait for successful login to accounts portal
    console.log('Waiting for login to complete...')
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })

    // Step 6: Wait for and click div elements with svg and h2
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
      // Wait a bit between clicks
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // Step 7: Wait for the login button to appear and click it
    console.log('Waiting for site login button...')
    // Build the full URL, avoiding double slashes
    const baseUrlWithoutTrailingSlash = config.baseUrl.replace(/\/$/, '')
    const fullLoginUrl = `${baseUrlWithoutTrailingSlash}/ec_force/admins/auth/ecforce_id`
    const loginButtonSelector = `a[href="${fullLoginUrl}"]`

    await page.waitForSelector(loginButtonSelector, { timeout: 15000 })
    console.log('Login button found')

    // Listen for new target (tab) creation and get the initial URL
    const urlPromise = new Promise<string>((resolve) => {
      browser.once('targetcreated', async (target) => {
        // Get the URL from the target before any redirect
        const url = target.url()
        resolve(url)
      })
    })

    // Click the login button
    console.log('Clicking login button...')
    await page.click(loginButtonSelector)

    // Wait for the new tab to be created and get its initial URL
    console.log('Waiting for new tab...')
    const actualUrl = await urlPromise
    console.log(`Initial URL (before redirect): ${actualUrl}`)

    // Wait a moment for the tab to be created
    await new Promise(resolve => setTimeout(resolve, 500))

    // Close the new tab
    const pages = await browser.pages()
    const targetPage = pages[pages.length - 1]
    await targetPage.close()

    // Create a new page with Basic Auth credentials
    const authenticatedPage = await browser.newPage()

    // Set up Basic Auth before navigating
    await authenticatedPage.authenticate({
      username: config.basicAuthUsername,
      password: config.basicAuthPassword
    })

    console.log('Opening admin page with Basic Auth...')

    // Navigate directly to the actual URL
    await authenticatedPage.goto(actualUrl, { waitUntil: 'networkidle2', timeout: 30000 })

    console.log('Admin page loaded')

    // Verify we're on the admin page
    const currentUrl = authenticatedPage.url()
    console.log(`Current URL: ${currentUrl}`)

    if (currentUrl.includes('/admins/sign_in')) {
      throw new Error('Failed to login: Still on sign-in page')
    }

    // Step 7: Get cookies after successful login
    console.log('Extracting cookies...')
    const puppeteerCookies = await authenticatedPage.cookies()

    // Convert Puppeteer cookies to tough-cookie format
    const cookies: Cookie[] = puppeteerCookies.map((cookie: any) => {
      // tough-cookie has issues with sameSite=None, so we convert it to undefined
      let sameSite = cookie.sameSite
      if (sameSite === 'None' || sameSite === 'none') {
        sameSite = undefined
      }

      // Calculate expiration date
      let expiresDate: Date | undefined
      if (cookie.expires && cookie.expires > 0) {
        expiresDate = new Date(cookie.expires * 1000)
      }

      // If no expiration or expired (session cookie), set to 7 days from now
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

    // Save credentials
    const credentials = cookiesToCredentials(cookies)
    await saveCredentials(configPath, credentials)

    console.log('Login successful!')
    return cookies

  } finally {
    await browser.close()
  }
}
