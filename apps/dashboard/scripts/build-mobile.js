#!/usr/bin/env node
/**
 * Mobile build script for Devora
 *
 * Steps:
 *  1. Back up server-side incompatible files
 *  2. Swap next.config.js with next.config.mobile.js
 *  3. Build Next.js as static export (output: 'export')
 *  4. Restore all backed-up files
 *  5. Run `npx cap sync` to push assets to iOS/Android projects
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const BACKUP_DIR = path.resolve(ROOT, '..', '_mobile_build_backup')

const log = (msg) => console.log(`[Mobile Build] ${msg}`)
const err = (msg) => console.error(`[Mobile Build] ❌ ${msg}`)

// Files that use server-side APIs incompatible with static export
const SERVER_SIDE_FILES = [
  'app/api',         // Next.js API routes (not usable in static)
  'middleware.ts',   // Clerk middleware (server)
]

function backupFile(rel) {
  const src = path.join(ROOT, rel)
  const dst = path.join(BACKUP_DIR, rel)
  if (!fs.existsSync(src)) return false
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.renameSync(src, dst)
  log(`Backed up: ${rel}`)
  return true
}

function restoreFile(rel) {
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
        log(`Restored: ${rel}`)
      }
    }
  }

  walk(BACKUP_DIR)
  fs.rmSync(BACKUP_DIR, { recursive: true, force: true })
}

async function main() {
  log('Starting mobile build...')
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

    // 2. Backup middleware
    backupFile('middleware.ts')

    // 3. Backup app/api directory (API routes not supported in static export)
    backupFile('app/api')

    // 4. Backup Clerk auth pages (dynamic routes not supported in static export)
    backupFile('app/sign-in')
    backupFile('app/sign-up')

    // 5. Build
    log('Running Next.js static export...')
    execSync('npm run clean:next && next build --webpack', {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' },
    })

    log('✅ Next.js build completed!')

    // 4. Restore everything
    log('Restoring original config...')
    fs.copyFileSync(
      path.join(BACKUP_DIR, 'next.config.js'),
      path.join(ROOT, 'next.config.js')
    )
    restoreFile('middleware.ts')
    restoreFile('app/api')
    restoreFile('app/sign-in')
    restoreFile('app/sign-up')
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true })

    // 5. Sync to Capacitor
    log('Syncing to Capacitor platforms...')
    try {
      execSync('npx cap sync', { cwd: ROOT, stdio: 'inherit' })
      log('✅ Capacitor sync completed!')
    } catch {
      log('⚠️  Capacitor sync failed — run "npm run mobile:add:android" first if platforms not added')
    }

    log('')
    log('🎉 Mobile build completed successfully!')
    log('')
    log('Next steps:')
    log('  Android: npm run mobile:android  (opens Android Studio)')
    log('  iOS:     npm run mobile:ios      (opens Xcode — macOS only)')

  } catch (e) {
    err('Build failed! Restoring files...')
    // Always restore on error
    try {
      if (fs.existsSync(path.join(BACKUP_DIR, 'next.config.js'))) {
        fs.copyFileSync(
          path.join(BACKUP_DIR, 'next.config.js'),
          path.join(ROOT, 'next.config.js')
        )
      }
      restoreAll()
    } catch (restoreErr) {
      err(`Restore also failed: ${restoreErr.message}`)
    }
    process.exit(1)
  }
}

main().catch(e => {
  err(e.message)
  process.exit(1)
})
