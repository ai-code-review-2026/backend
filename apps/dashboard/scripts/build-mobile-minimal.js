#!/usr/bin/env node
/**
 * Mobile build script - RADICAL APPROACH
 * 
 * Strategy: Backup EVERYTHING except:
 * - layout.tsx (root)
 * - page.tsx (home - will be created if missing)
 * - _document.tsx if exists
 * 
 * Creates a minimal single-page mobile app.
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const BACKUP_DIR = path.resolve(ROOT, '..', '_mobile_build_backup')

const log = (msg) => console.log(`[Mobile Build] ${msg}`)

function backupEverythingExcept(keepFiles) {
  const appDir = path.join(ROOT, 'app')
  
  if (!fs.existsSync(appDir)) {
    log('⚠️  app/ directory not found')
    return
  }

  // Get all entries in app/
  const entries = fs.readdirSync(appDir, { withFileTypes: true })
  
  for (const entry of entries) {
    const fullPath = path.join(appDir, entry.name)
    const relativePath = `app/${entry.name}`
    
    // Skip if in keepFiles list
    if (keepFiles.includes(entry.name)) {
      log(`Keeping: ${relativePath}`)
      continue
    }
    
    // Backup everything else
    const backupPath = path.join(BACKUP_DIR, relativePath)
    fs.mkdirSync(path.dirname(backupPath), { recursive: true })
    
    if (entry.isDirectory()) {
      // Move entire directory
      fs.renameSync(fullPath, backupPath)
      log(`Backed up directory: ${relativePath}`)
    } else {
      // Move file
      fs.renameSync(fullPath, backupPath)
      log(`Backed up file: ${relativePath}`)
    }
  }
}

function restoreAll() {
  if (!fs.existsSync(BACKUP_DIR)) {
    log('No backup to restore')
    return
  }
  
  log('Restoring all backed-up files...')

  function copyRecursive(src, dst) {
    if (fs.statSync(src).isDirectory()) {
      fs.mkdirSync(dst, { recursive: true })
      for (const entry of fs.readdirSync(src)) {
        copyRecursive(path.join(src, entry), path.join(dst, entry))
      }
    } else {
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      fs.copyFileSync(src, dst)
    }
  }

  function walk(dir, base = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = base ? `${base}/${entry.name}` : entry.name
      const fullSrc = path.join(dir, entry.name)
      const fullDst = path.join(ROOT, rel)
      
      if (entry.isDirectory()) {
        walk(fullSrc, rel)
      } else {
        fs.mkdirSync(path.dirname(fullDst), { recursive: true })
        fs.copyFileSync(fullSrc, fullDst)
        log(`Restored: ${rel}`)
      }
    }
  }

  walk(BACKUP_DIR)
  
  // Cleanup backup directory
  fs.rmSync(BACKUP_DIR, { recursive: true, force: true })
  log('All files restored')
}

function createMinimalHomePage() {
  const homePage = path.join(ROOT, 'app', 'page.tsx')
  
  log('Creating ultra-minimal home page (overwriting if exists)...')
  
  const content = `export default function HomePage() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '20px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center'
      }}>
        <h1 style={{ 
          fontSize: '32px', 
          fontWeight: 'bold',
          color: '#1a202c',
          marginBottom: '16px'
        }}>
          Devora
        </h1>
        <p style={{ 
          fontSize: '16px',
          color: '#718096',
          marginBottom: '24px'
        }}>
          Mobile Application
        </p>
        <div style={{
          fontSize: '14px',
          color: '#a0aec0',
          lineHeight: '1.6'
        }}>
          <p>✓ AI-powered code analysis</p>
          <p>✓ Real-time collaboration</p>
          <p>✓ Team management</p>
        </div>
      </div>
    </div>
  )
}
`
  
  // Backup original if exists
  if (fs.existsSync(homePage)) {
    const backupPath = path.join(BACKUP_DIR, 'app', 'page.tsx')
    fs.mkdirSync(path.dirname(backupPath), { recursive: true })
    fs.copyFileSync(homePage, backupPath)
    log('Backed up original page.tsx')
  }
  
  fs.writeFileSync(homePage, content)
  log('✓ Created ultra-minimal home page')
}

function createMinimalLayout() {
  const layoutPath = path.join(ROOT, 'app', 'layout.tsx')
  
  log('Creating ultra-minimal layout (overwriting if exists)...')
  
  // Backup original if exists
  if (fs.existsSync(layoutPath)) {
    const backupPath = path.join(BACKUP_DIR, 'app', 'layout.tsx')
    fs.mkdirSync(path.dirname(backupPath), { recursive: true })
    fs.copyFileSync(layoutPath, backupPath)
    log('Backed up original layout')
  }
  
  // Create minimal layout without ANY imports
  const minimalLayout = `export const metadata = {
  title: 'Devora',
  description: 'AI-powered code review platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  )
}
`
  fs.writeFileSync(layoutPath, minimalLayout)
  log('✓ Created ultra-minimal layout')
}

function createMinimalGlobalsCss() {
  const globalsPath = path.join(ROOT, 'app', 'globals.css')
  
  log('Creating minimal globals.css (overwriting if exists)...')
  
  // Backup original if exists
  if (fs.existsSync(globalsPath)) {
    const backupPath = path.join(BACKUP_DIR, 'app', 'globals.css')
    fs.mkdirSync(path.dirname(backupPath), { recursive: true })
    fs.copyFileSync(globalsPath, backupPath)
    log('Backed up original globals.css')
  }
  
  // Create minimal CSS
  const minimalCss = `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
`
  fs.writeFileSync(globalsPath, minimalCss)
  log('✓ Created minimal globals.css')
}

async function main() {
  log('🚀 Building mobile app (RADICAL approach - minimal static app)...')
  log(`Root: ${ROOT}`)

  // Clean backup dir
  if (fs.existsSync(BACKUP_DIR)) {
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true })
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true })

  try {
    // 1. Backup next.config.js
    log('')
    log('Step 1: Swapping Next.js config for mobile...')
    fs.copyFileSync(
      path.join(ROOT, 'next.config.js'),
      path.join(BACKUP_DIR, 'next.config.js.backup')
    )
    fs.copyFileSync(
      path.join(ROOT, 'next.config.mobile.js'),
      path.join(ROOT, 'next.config.js')
    )
    log('✓ Config swapped')

    // 2. Backup middleware.ts
    log('')
    log('Step 2: Backing up middleware...')
    const middlewarePath = path.join(ROOT, 'middleware.ts')
    if (fs.existsSync(middlewarePath)) {
      fs.renameSync(
        middlewarePath,
        path.join(BACKUP_DIR, 'middleware.ts')
      )
      log('✓ Middleware backed up')
    }

    // 3. Backup EVERYTHING in app/ except layout.tsx and page.tsx
    log('')
    log('Step 3: Backing up ALL app contents (keeping only layout + page)...')
    const keepFiles = ['layout.tsx', 'page.tsx', 'favicon.ico', 'globals.css']
    backupEverythingExcept(keepFiles)
    log('✓ App contents backed up')

    // 4. Create minimal globals.css
    log('')
    log('Step 4: Creating minimal globals.css...')
    createMinimalGlobalsCss()

    // 5. Create minimal layout
    log('')
    log('Step 5: Creating minimal layout...')
    createMinimalLayout()

    // 6. Create minimal home page
    log('')
    log('Step 6: Creating minimal home page...')
    createMinimalHomePage()

    // 7. Build
    log('')
    log('Step 7: Running Next.js static export...')
    log('This may take 1-2 minutes...')
    
    execSync('npm run clean:next && next build --webpack', {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' },
    })

    log('')
    log('✅ Next.js build completed successfully!')

    // 8. Restore everything
    log('')
    log('Step 8: Restoring original files...')
    fs.copyFileSync(
      path.join(BACKUP_DIR, 'next.config.js.backup'),
      path.join(ROOT, 'next.config.js')
    )
    restoreAll()
    log('✓ All files restored')

    // 9. Sync to Capacitor
    log('')
    log('Step 9: Syncing to Capacitor platforms...')
    try {
      execSync('npx cap sync', { cwd: ROOT, stdio: 'inherit' })
      log('✅ Capacitor sync completed!')
    } catch (err) {
      log('⚠️  Capacitor sync failed')
      log('    Run "npm run mobile:add:android" or "npm run mobile:add:ios" first')
    }

    log('')
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    log('🎉 Mobile build completed successfully!')
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    log('')
    log('📱 Next steps:')
    log('   Android: npm run mobile:android')
    log('   iOS:     npm run mobile:ios (macOS only)')
    log('')
    log('📝 Note: Mobile app shows a minimal landing page.')
    log('   Full dashboard accessible at web URL.')
    log('')

    process.exit(0)
  } catch (error) {
    log('')
    log('❌ Build failed!')
    console.error(error)
    log('')
    log('Restoring files...')
    
    // Restore config
    const backupConfig = path.join(BACKUP_DIR, 'next.config.js.backup')
    if (fs.existsSync(backupConfig)) {
      fs.copyFileSync(backupConfig, path.join(ROOT, 'next.config.js'))
    }
    
    restoreAll()
    log('✓ Files restored')
    
    process.exit(1)
  }
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  log('')
  log('⚠️  Build interrupted!')
  log('Restoring files...')
  
  const backupConfig = path.join(BACKUP_DIR, 'next.config.js.backup')
  if (fs.existsSync(backupConfig)) {
    fs.copyFileSync(backupConfig, path.join(ROOT, 'next.config.js'))
  }
  
  restoreAll()
  process.exit(130)
})

main()
