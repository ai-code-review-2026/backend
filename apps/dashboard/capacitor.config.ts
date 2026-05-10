import { CapacitorConfig } from '@capacitor/cli'

// Set CAPACITOR_DEV_SERVER_URL to an absolute URL to enable live-reload.
// Android emulator default: http://10.0.2.2:3001
// Physical device example: http://192.168.1.x:3001
// Leave unset for production/local assets. Do not set a relative server.url:
// Capacitor treats server.url as a remote origin and a relative value leaves the
// WebView stuck on the native splash screen.
const DEV_SERVER_URL = process.env.CAPACITOR_DEV_SERVER_URL
const START_PATH = process.env.CAPACITOR_START_PATH || '/mobile/prs'

function buildServerUrl(baseUrl: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const normalizedPath = START_PATH.startsWith('/') ? START_PATH.slice(1) : START_PATH
  return new URL(normalizedPath, normalizedBase).toString()
}

const config: CapacitorConfig = {
  appId: 'com.devora.app',
  appName: 'Devora',
  webDir: 'out',
  server: DEV_SERVER_URL
    ? {
        url: buildServerUrl(DEV_SERVER_URL),
        cleartext: DEV_SERVER_URL.startsWith('http://'),
      }
    : {
        androidScheme: 'http',
      },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0a0a0b',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0a0a0b',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
