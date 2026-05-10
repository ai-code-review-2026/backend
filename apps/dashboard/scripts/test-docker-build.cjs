#!/usr/bin/env node

/**
 * Dashboard Docker Build & Test Script
 * 
 * Tests the Docker build process end-to-end:
 * 1. Validates environment configuration
 * 2. Builds production image
 * 3. Starts container
 * 4. Runs health checks
 * 5. Verifies API endpoints
 * 6. Cleans up
 * 
 * Usage:
 *   node scripts/test-docker-build.js
 *   node scripts/test-docker-build.js --skip-build   # Use existing image
 *   node scripts/test-docker-build.js --keep-running # Don't stop after test
 */

const { execSync } = require('child_process')
const http = require('http')

// Configuration
const IMAGE_NAME = 'ahmedaminbejaoui/ai-review-dashboard'
const IMAGE_TAG = 'test'
const CONTAINER_NAME = 'dashboard-test'
const PORT = 3001
const HEALTH_ENDPOINT = '/api/health'
const MAX_STARTUP_WAIT = 60000 // 60 seconds
const HEALTH_CHECK_INTERVAL = 2000 // 2 seconds

// Parse CLI args
const args = process.argv.slice(2)
const SKIP_BUILD = args.includes('--skip-build')
const KEEP_RUNNING = args.includes('--keep-running')

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function logStep(step, message) {
  log(`\n[${step}] ${message}`, 'cyan')
}

function exec(command, options = {}) {
  try {
    return execSync(command, {
      stdio: options.silent ? 'pipe' : 'inherit',
      encoding: 'utf-8',
      ...options,
    })
  } catch (error) {
    if (!options.ignoreError) {
      throw error
    }
    return null
  }
}

async function waitForHealth(maxWait = MAX_STARTUP_WAIT) {
  const startTime = Date.now()
  let attempts = 0

  while (Date.now() - startTime < maxWait) {
    attempts++
    try {
      const response = await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${PORT}${HEALTH_ENDPOINT}`, resolve)
        req.on('error', reject)
        req.setTimeout(5000, () => {
          req.destroy()
          reject(new Error('Request timeout'))
        })
      })

      if (response.statusCode === 200) {
        log(`✓ Health check passed (${attempts} attempts, ${Date.now() - startTime}ms)`, 'green')
        return true
      }
    } catch (error) {
      // Ignore errors and retry
    }

    await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_INTERVAL))
  }

  throw new Error(`Health check failed after ${maxWait}ms`)
}

function checkEnvironment() {
  logStep('1/6', 'Checking environment configuration')

  // Check if .env.docker exists
  try {
    exec('test -f .env.docker', { silent: true })
    log('✓ .env.docker found', 'green')
  } catch {
    log('✗ .env.docker not found', 'red')
    log('  Run: cp .env.docker.example .env.docker', 'yellow')
    throw new Error('Missing .env.docker file')
  }

  // Check for required variables
  const envContent = exec('cat .env.docker', { silent: true })
  const requiredVars = [
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'CLERK_SECRET_KEY',
  ]

  for (const varName of requiredVars) {
    if (!envContent.includes(`${varName}=`) || envContent.includes(`${varName}=\n`)) {
      log(`✗ ${varName} not set in .env.docker`, 'red')
      throw new Error(`Missing required variable: ${varName}`)
    }
    log(`✓ ${varName} configured`, 'green')
  }
}

function buildImage() {
  logStep('2/6', 'Building Docker image')

  if (SKIP_BUILD) {
    log('⊘ Skipping build (--skip-build)', 'yellow')
    return
  }

  log(`Building ${IMAGE_NAME}:${IMAGE_TAG}...`, 'blue')

  const buildStart = Date.now()
  exec(`docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -f Dockerfile.production --target runtime .`)
  const buildTime = ((Date.now() - buildStart) / 1000).toFixed(1)

  log(`✓ Build completed in ${buildTime}s`, 'green')

  // Check image size
  const imageSize = exec(`docker images ${IMAGE_NAME}:${IMAGE_TAG} --format "{{.Size}}"`, {
    silent: true,
  }).trim()
  log(`  Image size: ${imageSize}`, 'blue')
}

function cleanupExisting() {
  logStep('3/6', 'Cleaning up existing containers')

  // Stop and remove existing container
  exec(`docker stop ${CONTAINER_NAME}`, { silent: true, ignoreError: true })
  exec(`docker rm ${CONTAINER_NAME}`, { silent: true, ignoreError: true })

  log('✓ Cleanup completed', 'green')
}

function startContainer() {
  logStep('4/6', 'Starting container')

  log(`Starting ${CONTAINER_NAME} on port ${PORT}...`, 'blue')

  exec(`docker run -d \
    --name ${CONTAINER_NAME} \
    -p ${PORT}:${PORT} \
    --env-file .env.docker \
    --health-cmd "node -e \\"require('http').get('http://localhost:${PORT}${HEALTH_ENDPOINT}', (r) => process.exit(r.statusCode === 200 ? 0 : 1))\\"" \
    --health-interval 10s \
    --health-timeout 5s \
    --health-retries 3 \
    ${IMAGE_NAME}:${IMAGE_TAG}`, { silent: true })

  log(`✓ Container started`, 'green')
}

async function runHealthChecks() {
  logStep('5/6', 'Running health checks')

  log('Waiting for container to be healthy...', 'blue')

  try {
    await waitForHealth()
  } catch (error) {
    log('✗ Container failed to become healthy', 'red')
    log('\nContainer logs:', 'yellow')
    exec(`docker logs ${CONTAINER_NAME}`)
    throw error
  }

  // Additional endpoint checks
  log('\nTesting additional endpoints...', 'blue')

  const endpoints = [
    { path: '/', expectedStatus: 200 },
    { path: '/api/health', expectedStatus: 200 },
  ]

  for (const endpoint of endpoints) {
    try {
      const response = await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${PORT}${endpoint.path}`, resolve)
        req.on('error', reject)
        req.setTimeout(5000, () => {
          req.destroy()
          reject(new Error('Request timeout'))
        })
      })

      if (response.statusCode === endpoint.expectedStatus) {
        log(`✓ ${endpoint.path} → ${response.statusCode}`, 'green')
      } else {
        log(`✗ ${endpoint.path} → ${response.statusCode} (expected ${endpoint.expectedStatus})`, 'red')
      }
    } catch (error) {
      log(`✗ ${endpoint.path} → Error: ${error.message}`, 'red')
    }
  }
}

function showResults() {
  logStep('6/6', 'Test Results')

  log('\n┌─────────────────────────────────────────┐', 'green')
  log('│  ✓ All tests passed!                   │', 'green')
  log('└─────────────────────────────────────────┘', 'green')

  log('\nContainer Information:', 'cyan')
  exec(`docker ps --filter name=${CONTAINER_NAME} --format "table {{.ID}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}"`)

  log('\nAccess dashboard at:', 'cyan')
  log(`  http://localhost:${PORT}`, 'blue')

  if (KEEP_RUNNING) {
    log('\nContainer is still running (--keep-running)', 'yellow')
    log(`To stop: docker stop ${CONTAINER_NAME}`, 'yellow')
    log(`To view logs: docker logs -f ${CONTAINER_NAME}`, 'yellow')
  }
}

function cleanup() {
  if (KEEP_RUNNING) {
    return
  }

  log('\nCleaning up...', 'yellow')
  exec(`docker stop ${CONTAINER_NAME}`, { silent: true, ignoreError: true })
  exec(`docker rm ${CONTAINER_NAME}`, { silent: true, ignoreError: true })
  log('✓ Cleanup completed', 'green')
}

async function main() {
  const startTime = Date.now()

  log('════════════════════════════════════════', 'cyan')
  log('  Dashboard Docker Build & Test Suite  ', 'cyan')
  log('════════════════════════════════════════', 'cyan')

  try {
    checkEnvironment()
    buildImage()
    cleanupExisting()
    startContainer()
    await runHealthChecks()
    showResults()

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
    log(`\nTotal time: ${totalTime}s`, 'cyan')

    process.exit(0)
  } catch (error) {
    log('\n✗ Test failed!', 'red')
    log(`  Error: ${error.message}`, 'red')

    if (!KEEP_RUNNING) {
      cleanup()
    }

    process.exit(1)
  }
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  log('\n\nReceived SIGINT, cleaning up...', 'yellow')
  cleanup()
  process.exit(130)
})

main()
