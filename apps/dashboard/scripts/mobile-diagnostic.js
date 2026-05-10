#!/usr/bin/env node
/**
 * Mobile environment diagnostic.
 */

const { execSync } = require('child_process')
const fs = require('fs')
const net = require('net')
const path = require('path')

const PORT = 3001
let issues = 0

function log(message = '') {
  console.log(message)
}

function ok(message) {
  console.log(`[OK] ${message}`)
}

function warn(message) {
  console.log(`[WARN] ${message}`)
}

function bad(message) {
  issues += 1
  console.log(`[FAIL] ${message}`)
}

function canConnect(host, port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port, timeout: 1000 }, () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => resolve(false))
  })
}

async function main() {
  log('')
  log('Mobile App Diagnostic')
  log('='.repeat(60))

  log('')
  log('1. package.json')
  const pkgPath = path.join(process.cwd(), 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  if (pkg.scripts?.dev?.includes('-H 0.0.0.0')) {
    ok('dev script listens on all interfaces.')
  } else {
    bad('dev script must include "next dev -H 0.0.0.0 -p 3001".')
  }

  log('')
  log('2. Next.js dev server')
  if (await canConnect('127.0.0.1', PORT)) {
    ok(`localhost:${PORT} is reachable.`)
  } else {
    bad(`localhost:${PORT} is not reachable. Start it with "npm run dev" or "npm run mobile:dev".`)
  }

  try {
    const netstat = execSync('netstat -ano', { encoding: 'utf8' })
    const listening = netstat.split(/\r?\n/).find(line => line.includes(`:${PORT}`) && line.includes('LISTENING'))
    if (listening?.includes(`0.0.0.0:${PORT}`)) {
      ok(`port ${PORT} is listening on 0.0.0.0.`)
    } else if (listening) {
      warn(`port ${PORT} is listening, but not on 0.0.0.0: ${listening.trim()}`)
    }
  } catch {
    warn('could not run netstat.')
  }

  log('')
  log('3. Capacitor Android config')
  const capConfigPath = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'assets', 'capacitor.config.json')
  if (!fs.existsSync(capConfigPath)) {
    bad('android/app/src/main/assets/capacitor.config.json does not exist. Run "npx cap sync android".')
  } else {
    const capConfig = JSON.parse(fs.readFileSync(capConfigPath, 'utf8'))
    const serverUrl = capConfig.server?.url

    if (!serverUrl) {
      warn('No Capacitor server.url is configured. This is valid only for a production static webDir build.')
    } else if (!/^https?:\/\//.test(serverUrl)) {
      bad(`Capacitor server.url is relative (${serverUrl}). Run "npm run mobile:dev" to write an absolute URL.`)
    } else {
      ok(`Capacitor server.url is absolute: ${serverUrl}`)

      if (serverUrl.startsWith('http://10.0.2.2:')) {
        ok('URL targets the Android emulator host alias.')
      } else {
        warn('URL is not 10.0.2.2. That is fine for a physical device, but emulator testing usually needs 10.0.2.2.')
      }
    }

    if (serverUrl?.startsWith('http://') && capConfig.server?.cleartext !== true) {
      bad('Capacitor cleartext must be true when using an http:// dev URL.')
    }
  }

  log('')
  log('4. AndroidManifest.xml')
  const manifestPath = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'AndroidManifest.xml')
  if (!fs.existsSync(manifestPath)) {
    bad('AndroidManifest.xml is missing.')
  } else {
    const manifest = fs.readFileSync(manifestPath, 'utf8')
    if (manifest.includes('android.permission.INTERNET')) {
      ok('INTERNET permission is present.')
    } else {
      bad('INTERNET permission is missing.')
    }

    if (manifest.includes('android:usesCleartextTraffic="true"')) {
      ok('cleartext HTTP traffic is enabled for dev.')
    } else {
      bad('android:usesCleartextTraffic="true" is missing.')
    }
  }

  log('')
  log('='.repeat(60))
  if (issues === 0) {
    ok('No blocking mobile configuration issues found.')
  } else {
    bad(`${issues} blocking issue(s) found.`)
  }
}

main().catch(error => {
  bad(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
