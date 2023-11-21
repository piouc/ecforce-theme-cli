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
npx ecforce-theme-cli pull {THEME_ID}
```
