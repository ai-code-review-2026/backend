#!/usr/bin/env node
/**
 * Mobile Landing Page Build Script
 * 
 * Creates a simple static mobile app with:
 * - Landing page
 * - Login redirect to web app
 * - No dynamic routes (fully static)
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const BACKUP_DIR = path.resolve(ROOT, '..', '_mobile_build_backup')

const log = (msg) => console.log(`[Mobile Build] ${msg}`)

function backupDirectory(rel) {
  const src = path.join(ROOT, rel)
  const dst = path.join(BACKUP_DIR, rel)
  if (!fs.existsSync(src)) return false
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.renameSync(src, dst)
  log(`Backed up: ${rel}`)
  return true
}

function restoreDirectory(rel) {
  const src = path.join(BACKUP_DIR, rel)
  const dst = path.join(ROOT, rel)
  if (!fs.existsSync(src)) return false
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.renameSync(src, dst)
  log(`Restored: ${rel}`)
  return true
}

function restoreAll() {
  if (!fs.existsSync(BACKUP_DIR)) return
  log('Restoring all backed-up files...')

  function walk(dir, base = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = base ? `${base}/${entry.name}` : entry.name
      const fullSrc = path.join(dir, entry.name)
      const fullDst = path.join(ROOT, rel)
      if (entry.isDirectory()) {
        walk(fullSrc, rel)
      } else {
        fs.mkdirSync(path.dirname(fullDst), { recursive: true })
        fs.renameSync(fullSrc, fullDst)
      }
    }
  }

  walk(BACKUP_DIR)
  fs.rmSync(BACKUP_DIR, { recursive: true, force: true })
  log('All files restored')
}

async function main() {
  log('🚀 Building mobile landing page (static export)...')
  log(`Root: ${ROOT}`)

  // Clean backup dir
  if (fs.existsSync(BACKUP_DIR)) {
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true })
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true })

  try {
    // 1. Backup next.config.js
    log('Swapping Next.js config for mobile...')
    fs.copyFileSync(
      path.join(ROOT, 'next.config.js'),
      path.join(BACKUP_DIR, 'next.config.js')
    )
    fs.copyFileSync(
      path.join(ROOT, 'next.config.mobile.js'),
      path.join(ROOT, 'next.config.js')
    )

    // 2. Backup entire app/ directory except home page
    log('Backing up dashboard app (keeping only landing page)...')
    backupDirectory('app/dashboard')
    backupDirectory('app/mobile')
    backupDirectory('app/api')
    backupDirectory('app/sign-in')
    backupDirectory('app/sign-up')
    backupDirectory('app/auth')
    backupDirectory('app/(protected)')
    backupDirectory('middleware.ts')

    // 3. Create simple mobile landing page if not exists
    const landingPagePath = path.join(ROOT, 'app', 'page.tsx')
    if (!fs.existsSync(landingPagePath)) {
      log('Creating mobile landing page...')
      const landingPageContent = `
export default function MobileLandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Devora
        </h1>
        <p className="text-gray-600 mb-8">
          Professional AI-powered code review for your team
        </p>
        
        <div className="space-y-4">
          <a 
            href="/dashboard" 
            className="block w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            Open Dashboard
          </a>
          
          <p className="text-sm text-gray-500">
            For the best experience, access the full dashboard at:
            <br />
            <a href="https://yourdomain.com" className="text-blue-600 underline">
              https://yourdomain.com
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
`.trim()
      fs.writeFileSync(landingPagePath, landingPageContent)
    }

    // 4. Build
    log('Running Next.js static export...')
    execSync('npm run clean:next && next build --webpack', {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' },
    })

    log('✅ Next.js build completed!')

    // 5. Restore everything
    log('Restoring original files...')
    fs.copyFileSync(
      path.join(BACKUP_DIR, 'next.config.js'),
      path.join(ROOT, 'next.config.js')
    )
    restoreAll()

    // 6. Sync to Capacitor
    log('Syncing to Capacitor platforms...')
    try {
      execSync('npx cap sync', { cwd: ROOT, stdio: 'inherit' })
      log('✅ Capacitor sync completed!')
    } catch {
      log('⚠️  Capacitor sync failed — run "npm run mobile:add:android" first')
    }

    log('')
    log('🎉 Mobile landing page build completed!')
    log('')
    log('Next steps:')
    log('  Android: npm run mobile:android')
    log('  iOS:     npm run mobile:ios (macOS only)')
    log('')
    log('Note: This mobile app shows a landing page that redirects to web dashboard.')
    log('      For full dashboard in mobile, use web browser or implement SPA mode.')

    process.exit(0)
  } catch (error) {
    log(`❌ Build failed!`)
    console.error(error)
    log('Restoring files...')
    restoreAll()
    process.exit(1)
  }
}

process.on('SIGINT', () => {
  log('\n\nReceived SIGINT, restoring files...')
  restoreAll()
  process.exit(130)
})

main()
