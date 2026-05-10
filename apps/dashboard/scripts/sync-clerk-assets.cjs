const fs = require("node:fs")
const path = require("node:path")

function resolveClerkDistDir() {
  const clerkPackageJson = require.resolve("@clerk/clerk-js/package.json", {
    paths: [process.cwd()],
  })
  return path.join(path.dirname(clerkPackageJson), "dist")
}

function syncClerkAssets() {
  const sourceDir = resolveClerkDistDir()
  const targetDir = path.join(process.cwd(), "public", "vendor", "clerk-js", "current")

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Missing Clerk dist directory: ${sourceDir}`)
  }

  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  fs.cpSync(sourceDir, targetDir, { recursive: true })

  console.log(`Synced Clerk assets to ${targetDir}`)
}

try {
  syncClerkAssets()
} catch (error) {
  console.error("Failed to sync Clerk assets.")
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
