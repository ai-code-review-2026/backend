#!/usr/bin/env node
/**
 * Mobile dev helper — starts Next.js dev server and opens Android Studio
 * 
 * Usage:
 *   node scripts/mobile-dev.js <your-local-ip>
 *   
 * Example:
 *   node scripts/mobile-dev.js 192.168.1.10
 */

const { execSync, spawn } = require('child_process')
const os = require('os')

const args = process.argv.slice(2)
const localIP = args[0]

const log = (msg) => console.log(`[Mobile Dev] ${msg}`)
const err = (msg) => console.error(`[Mobile Dev] ❌ ${msg}`)

function getLocalIP() {
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return null
}

async function main() {
  let ip = localIP
  
  if (!ip) {
    ip = getLocalIP()
    if (!ip) {
      err('Could not auto-detect local IP address.')
      err('Please provide it manually: node scripts/mobile-dev.js <your-ip>')
      err('Example: node scripts/mobile-dev.js 192.168.1.10')
      process.exit(1)
    }
    log(`Auto-detected local IP: ${ip}`)
  }

  const devServerURL = `http://${ip}:3001`
  
  log(`Setting CAPACITOR_DEV_SERVER_URL=${devServerURL}`)
  process.env.CAPACITOR_DEV_SERVER_URL = devServerURL

  // 1. Start Next.js dev server in background
  log('Starting Next.js dev server...')
  const devServer = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env }
  })

  // Wait 5 seconds for dev server to start
  await new Promise(resolve => setTimeout(resolve, 5000))

  // 2. Sync Capacitor
  log('Syncing Capacitor with dev server URL...')
  try {
    execSync('npx cap sync', { stdio: 'inherit', env: process.env })
  } catch (e) {
    err('Capacitor sync failed')
    devServer.kill()
    process.exit(1)
  }

  // 3. Open Android Studio
  log('Opening Android Studio...')
  try {
    execSync('npx cap open android', { stdio: 'inherit' })
  } catch (e) {
    err('Failed to open Android Studio')
    devServer.kill()
    process.exit(1)
  }

  log('')
  log('✅ Setup complete!')
  log('')
  log(`📱 Dev server running at: ${devServerURL}`)
  log('🔄 Live-reload is ACTIVE')
  log('🚀 Android Studio is open — press ▶️ Run to launch the app')
  log('')
  log('The app will open directly to: /mobile/prs')
  log('')
  log('Press Ctrl+C to stop the dev server and exit')

  // Keep script alive
  process.on('SIGINT', () => {
    log('Stopping dev server...')
    devServer.kill()
    process.exit(0)
  })
}

main().catch(e => {
  err(e.message)
  process.exit(1)
})
