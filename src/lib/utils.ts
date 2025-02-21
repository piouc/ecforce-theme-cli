import { Config, LpProfile, ThemeProfile } from './load-config'
import { exec } from 'child_process'

export const getThemeProfile = (config: Config, branch: string): ThemeProfile | undefined => {
  return config.profiles.filter(profile => profile.type === 'theme').find(profile => profile.branch === branch)
}

export const getLpProfile = (config: Config, branch: string): LpProfile | undefined => {
  return config.profiles.filter(profile => profile.type === 'lp').find(profile => profile.branch === branch)
}

export const getCurrentBranchName = () => {
  return new Promise<string>((resolve, reject) => {
    exec('git rev-parse --abbrev-ref HEAD', (err, stdout, stderr) => {
      if (err) {
        reject(err)
        return
      }
      if (stderr) {
        reject(new Error(`stderr: ${stderr}`))
        return
      }
      resolve(stdout.trim())
    })
  })
}