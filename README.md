## Getting started

### Installation
```bash
npm i -D ecforce-theme-cli
```

### Configuration
Put `ecforce.config.json` to project root.
```json
{
  "basicAuthUsername": "BASIC_AUTH_USERNAME",
  "basicAuthPassword": "BASIC_AUTH_PASSWORD",
  "username": "USERNAME",
  "password": "PASSWORD",
  "baseUrl": "https://HOSTNAME/",
  "authType": "legacy",
  "profiles": [
    {
      "type": "theme",
      "name": "THEME_NAME",
      "branch": "BRANCH_NAME",
      "themeId": "THEME_ID",
      "dir": "DIRECTORY_PATH"
    },
    {
      "type": "lp",
      "lpId": "LP_ID",
      "branch": "BRANCH_NAME",
      "dir": "DIRECTORY_PATH"
    },
    {
      "type": "page",
      "branch": "BRANCH_NAME",
      "dir": "DIRECTORY_PATH",
      "pages": [
        { "pageId": "PAGE_ID", "name": "PAGE_NAME" },
        { "pageId": "PAGE_ID" }
      ]
    }
  ]
}
```

#### Authentication Types
- `authType`: (optional, default: `"legacy"`)
  - `"legacy"`: Traditional admin sign-in authentication
  - `"ecforceAccount"`: ecforce Account authentication (uses Puppeteer for login, credentials cached in `ecforce.credentials.json`)

## Commands

### Init
```bash
npx ecforce-theme-cli init
npx ecforce-theme-cli init theme
npx ecforce-theme-cli init lp
npx ecforce-theme-cli init page
```
- `init` — Create config file with authentication settings
- `init theme` — Add a theme profile to existing config
- `init lp` — Add an LP profile to existing config
- `init page` — Add a page profile to existing config

### Sync
```bash
npx ecforce-theme-cli sync
```
#### Options
- -w, --watch  
watch files

### Pull
```bash
npx ecforce-theme-cli pull
```

### Page Pull
```bash
npx ecforce-theme-cli page-pull <name|pageId>
npx ecforce-theme-cli page-pull -a
```
#### Options
- -a, --all
pull all pages

### Page Sync
```bash
npx ecforce-theme-cli page-sync <name|pageId>
npx ecforce-theme-cli page-sync -a
```
#### Options
- -a, --all
sync all pages
- -w, --watch
watch files

### Preview
```bash
npx ecforce-theme-cli
```

### Auto reload script
<details>
  <summary>Code</summary>

  For theme
  ```html
  {% if theme_preview_mode %}
    <script>
      const connectWSServer = () => {
        const ws = new WebSocket('ws://localhost:8080')
        ws.addEventListener('message', message => {
          const data = JSON.parse(message.data)
          if(data.type === 'update'){
            location.reload()
          }
        })
      }

      let localHosted = null
      new MutationObserver((mutations) => {
        for(const mutation of mutations){
          for(const node of mutation.addedNodes){
            if(node.nodeName !== 'SCRIPT') break
            if(node.src.includes('/ec_force/assets/')){
              if(localHosted === null){
                const xhr = new XMLHttpRequest()
                xhr.open('HEAD', 'http://localhost:8088/', false)
                try {
                  xhr.send()
                  if(xhr.readyState === 4){
                    localHosted = true
                    connectWSServer()
                  } else {
                    throw new Error()
                  }
                } catch(err) {
                  localHosted = false
                }
              }
              if(localHosted){
                node.src = node.src.replace(/.*\/ec_force\/assets\//, 'http://localhost:8088/')
              }
            }
            return
          }
        }
      }).observe(document, {childList: true, subtree: true})
      document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('link').forEach(link => {
          if(localHosted === true && link.rel === 'stylesheet' && link.href.includes('/ec_force/assets/')){
            if(localHosted){
              link.href = link.href.replace(/.*\/ec_force\/assets\//, 'http://localhost:8088/')
            }
          }
        })
      })
    </script>
  {% endif %}
  ```

  For LP
  ```html
  {%%}
  <script>
    const connectWSServer = () => {
      const ws = new WebSocket('ws://localhost:8080')
      ws.addEventListener('message', message => {
        const data = JSON.parse(message.data)
        if(data.type === 'update'){
          location.reload()
        }
      })
    }
  </script>
  ```
</details>