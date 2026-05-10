#!/usr/bin/env node
/**
 * Force mobile APK build to use VPS endpoints instead of localhost/emulator hosts.
 */

const { execSync } = require("child_process")

const VPS_IP = process.env.MOBILE_VPS_IP || "135.125.100.150"
const APP_PORT = process.env.MOBILE_APP_PORT || "3001"
const API_PORT = process.env.MOBILE_API_PORT || "8000"
const YJS_PORT = process.env.MOBILE_YJS_PORT || "1234"

const env = {
  ...process.env,
  MOBILE_API_BASE: `http://${VPS_IP}:${API_PORT}`,
  NEXT_PUBLIC_API_URL: `http://${VPS_IP}:${APP_PORT}`,
  NEXT_PUBLIC_APP_URL: `http://${VPS_IP}:${APP_PORT}`,
  NEXT_PUBLIC_BACKEND_URL: `http://${VPS_IP}:${API_PORT}`,
  NEXT_PUBLIC_Y_WEBSOCKET_URL: `ws://${VPS_IP}:${YJS_PORT}`,
}

delete env.CAPACITOR_DEV_SERVER_URL
delete env.CAPACITOR_START_PATH

console.log("[mobile:vps] Building APK assets against VPS endpoints:")
console.log(`[mobile:vps] NEXT_PUBLIC_APP_URL=${env.NEXT_PUBLIC_APP_URL}`)
console.log(`[mobile:vps] NEXT_PUBLIC_BACKEND_URL=${env.NEXT_PUBLIC_BACKEND_URL}`)
console.log(`[mobile:vps] NEXT_PUBLIC_Y_WEBSOCKET_URL=${env.NEXT_PUBLIC_Y_WEBSOCKET_URL}`)

execSync("node ./scripts/build-mobile-apk.js", {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
})

