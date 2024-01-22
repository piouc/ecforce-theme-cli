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
  "themeId": "THEME_ID"
}
```

## Commands

### Sync
```bash
npx ecforce-theme-cli sync
```
#### Options
- -w, --watch  
watch files

### Pull
```bash
npx ecforce-theme-cli pull [theme id]
```

### Preview
```bash
npx ecforce-theme-cli preview [theme id]
```

### Auto reload script
<details>
  <summary>Code</summary>

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
</details>