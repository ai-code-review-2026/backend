const fs = require("node:fs/promises")
const path = require("node:path")

const ROOT_DIR = process.cwd()
const TARGETS = [".next", "tsconfig.tsbuildinfo"]
const MAX_RETRIES = 8
const RETRY_DELAY_MS = 200

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function removeTarget(targetPath) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true, maxRetries: 0 })
      return
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        throw error
      }
      await sleep(RETRY_DELAY_MS)
    }
  }
}

async function main() {
  for (const relativeTarget of TARGETS) {
    const absoluteTarget = path.join(ROOT_DIR, relativeTarget)
    await removeTarget(absoluteTarget)
  }
}

main().catch((error) => {
  console.error("Failed to reset Next.js cache files before start/build.")
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
