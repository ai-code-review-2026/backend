#!/usr/bin/env node
/**
 * Android mobile dev helper.
 *
 * Default target is the Android emulator. In the emulator, 10.0.2.2 points to
 * the host machine, so it is more reliable than trying to guess a LAN adapter.
 *
 * Usage:
 *   npm run mobile:dev                 # Android emulator
 *   npm run mobile:dev -- --device     # physical device on the same LAN
 *   npm run mobile:dev -- 192.168.1.10 # explicit physical-device IP
 *   npm run mobile:dev -- http://host:3001
 */

const { execSync, spawn } = require('child_process')
const net = require('net')
const os = require('os')

const PORT = 3001
const START_PATH = '/mobile/prs'
const EMULATOR_BASE_URL = `http://10.0.2.2:${PORT}`

const args = process.argv.slice(2)
const usePhysicalDevice = args.includes('--device') || args.includes('--physical')
const explicitTarget = args.find(arg => !arg.startsWith('--'))

let devServer = null

function log(message) {
  console.log(`[mobile:dev] ${message}`)
}

function fail(message) {
  console.error(`[mobile:dev] ERROR: ${message}`)
  process.exit(1)
}

function getLanIp() {
  const nets = os.networkInterfaces()
  const candidates = []

  for (const [name, entries] of Object.entries(nets)) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal) continue

      const isLan =
        entry.address.startsWith('192.168.') ||
        entry.address.startsWith('10.') ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(entry.address)

      candidates.push({ address: entry.address, name, isLan })
    }
  }

  return (candidates.find(candidate => candidate.isLan) || candidates[0])?.address
}

function normalizeTarget(target) {
  if (!target) {
    if (!usePhysicalDevice) return EMULATOR_BASE_URL

    const lanIp = getLanIp()
    if (!lanIp) {
      fail('No LAN IP detected. Pass one explicitly, for example: npm run mobile:dev -- 192.168.1.10')
    }
    return `http://${lanIp}:${PORT}`
  }

  if (target.startsWith('http://') || target.startsWith('https://')) {
    return target.replace(/\/+$/, '')
  }

  return `http://${target}:${PORT}`
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

async function waitForLocalDevServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await canConnect('127.0.0.1', PORT)) return true
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  return false
}

async function ensureDevServer() {
  if (await canConnect('127.0.0.1', PORT)) {
    log(`Next.js is already running on localhost:${PORT}; reusing it.`)
    return
  }

  log(`Starting Next.js on 0.0.0.0:${PORT}...`)
  devServer = spawn('npm', ['run', 'dev'], {
    cwd: process.cwd(),
    env: { ...process.env },
    shell: true,
    stdio: 'inherit',
  })

  if (!(await waitForLocalDevServer())) {
    if (devServer) devServer.kill()
    fail(`Next.js did not become reachable on localhost:${PORT}. Check the dev server logs above.`)
  }
}

async function main() {
  const baseUrl = normalizeTarget(explicitTarget)
  const launchUrl = new URL(START_PATH.slice(1), `${baseUrl}/`).toString()

  process.env.CAPACITOR_DEV_SERVER_URL = baseUrl
  process.env.CAPACITOR_START_PATH = START_PATH

  log(`Capacitor launch URL: ${launchUrl}`)
  if (baseUrl === EMULATOR_BASE_URL) {
    log('Target: Android emulator. Use "--device" or pass a LAN IP for a physical phone.')
  }

  await ensureDevServer()

  log('Syncing Capacitor Android project...')
  execSync('npx cap sync android', {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })

  log('Opening Android Studio...')
  execSync('npx cap open android', {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })

  log('Ready. In Android Studio, stop the old app if it is still open, then press Run.')

  if (!devServer) return

  process.on('SIGINT', () => {
    log('Stopping Next.js dev server...')
    devServer.kill()
    process.exit(0)
  })

  await new Promise(() => {})
}

main().catch(error => fail(error instanceof Error ? error.message : String(error)))
