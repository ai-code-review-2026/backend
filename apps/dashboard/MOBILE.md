# Mobile App - AI Code Review Platform

This document describes how to build, run, and develop the mobile version of the AI Code Review Platform using Capacitor.

## Overview

The mobile app is built using **Capacitor**, which wraps the Next.js dashboard into native iOS and Android applications. The app uses:

- **Static Export**: Next.js builds to static HTML/CSS/JS
- **SPA Fallback**: Dynamic routes are handled client-side
- **Clerk React SDK**: Client-side authentication (replacing server-side `@clerk/nextjs`)
- **Capacitor Plugins**: Native features (StatusBar, SplashScreen, Keyboard, etc.)

## Prerequisites

### For iOS Development:
- macOS with Xcode 14+ installed
- CocoaPods installed (`sudo gem install cocoapods`)
- iOS Simulator or physical iOS device

### For Android Development:
- Android Studio installed
- Android SDK and tools configured
- Android Emulator or physical Android device

### Common:
- Node.js 18+ and npm
- All project dependencies installed (`npm install`)

## Project Structure

```
apps/dashboard/
├── ios/                          # iOS native project (generated)
│   └── App/
│       ├── App.xcodeproj        # Xcode project
│       └── App/                 # App source & assets
├── android/                      # Android native project (generated)
│   └── app/
│       └── src/main/
│           ├── assets/public/   # Web assets
│           └── java/            # Native code
├── capacitor.config.ts          # Capacitor configuration
├── scripts/
│   ├── build-mobile.js          # Mobile build automation
│   └── mobile-overrides/        # Mobile-specific file overrides
│       ├── root-layout.tsx      # Uses @clerk/clerk-react
│       ├── dashboard-layout.tsx
│       ├── admin-layout.tsx
│       └── ...
└── out/                         # Static export output (generated)
```

## Available Scripts

### Build Commands

```bash
# Build the app for mobile (static export + Capacitor sync)
npm run mobile:build

# Sync web assets to native projects (without rebuilding)
npm run mobile:sync
```

### Platform Management

```bash
# Add iOS platform (first time only)
npm run mobile:add:ios

# Add Android platform (first time only)
npm run mobile:add:android
```

### Development & Testing

```bash
# Open iOS project in Xcode
npm run mobile:ios

# Open Android project in Android Studio
npm run mobile:android

# Run on iOS simulator (requires Xcode)
npm run mobile:run:ios

# Run on Android emulator (requires Android Studio)
npm run mobile:run:android
```

## Building the Mobile App

### 1. Build for Mobile

The mobile build process:
1. Backs up server-side code (API routes, middleware, dynamic routes)
2. Replaces `@clerk/nextjs` imports with `@clerk/clerk-react`
3. Replaces server-side files with mobile-compatible versions
4. Runs Next.js static export
5. Sets up SPA fallback for dynamic routing
6. Syncs with Capacitor
7. Restores all original files

```bash
cd apps/dashboard
npm run mobile:build
```

Output:
- ✅ Static site built in `out/`
- ✅ SPA fallback configured (404.html → dynamic routes)
- ✅ Assets synced to `ios/App/App/public/` and `android/app/src/main/assets/public/`

### 2. Add Platforms (First Time Only)

```bash
# Add iOS
npm run mobile:add:ios

# Add Android
npm run mobile:add:android
```

## Running the App

### iOS (macOS only)

#### Option 1: Using Xcode
```bash
npm run mobile:ios
```

This opens the project in Xcode. Then:
1. Select a simulator or device
2. Click Run (▶️)
3. The app will build and launch

#### Option 2: Command Line
```bash
npm run mobile:run:ios
```

### Android

#### Option 1: Using Android Studio
```bash
npm run mobile:android
```

This opens the project in Android Studio. Then:
1. Wait for Gradle sync to complete
2. Select an emulator or device
3. Click Run (▶️)
4. The app will build and install

#### Option 2: Command Line
```bash
npm run mobile:run:android
```

## Development Workflow

### Making Changes

When you modify the web app:

1. **Rebuild for mobile:**
   ```bash
   npm run mobile:build
   ```

2. **Sync to native projects:**
   ```bash
   npm run mobile:sync
   ```

3. **Reload in simulator/emulator**

### Hot Reload (Alternative)

For faster development, you can use Capacitor's live reload:

```bash
# Terminal 1: Start Next.js dev server
npm run dev

# Terminal 2: Run mobile app with live reload
npx cap run ios --livereload --external
# or
npx cap run android --livereload --external
```

**Note:** Live reload uses the regular Next.js app (not static export), so some features may not work exactly as in production.

## Mobile-Specific Features

### 1. Capacitor Integration

The app includes mobile utilities:

**Utilities** (`lib/capacitor.ts`):
```typescript
import { isCapacitor, openBrowser, showToast, saveToStorage } from '@/lib/capacitor'

// Check if running in mobile app
if (isCapacitor()) {
  // Mobile-specific code
}

// Open external links
await openBrowser('https://example.com')

// Show native toast
await showToast('Success!')

// Use native storage
await saveToStorage('key', 'value')
const value = await getFromStorage('key')
```

**React Hooks** (`hooks/use-capacitor.ts`):
```typescript
import { useCapacitor, usePlatform, useSafeArea } from '@/hooks/use-capacitor'

function MyComponent() {
  const { isNative } = useCapacitor()
  const { platform, isIOS, isAndroid } = usePlatform()
  const { top, bottom } = useSafeArea()
  
  return (
    <div style={{ paddingTop: top, paddingBottom: bottom }}>
      {isIOS ? 'iOS UI' : 'Android UI'}
    </div>
  )
}
```

### 2. Safe Areas

CSS utilities for safe areas (notch, home indicator):

```css
/* Apply safe area insets */
.safe-top { padding-top: env(safe-area-inset-top); }
.safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
.safe-left { padding-left: env(safe-area-inset-left); }
.safe-right { padding-right: env(safe-area-inset-right); }
```

### 3. Mobile Authentication

OAuth flows are handled via `lib/mobile-auth.ts`:

```typescript
import { handleMobileOAuth } from '@/lib/mobile-auth'

// Handle OAuth redirect in mobile
await handleMobileOAuth(url)
```

## Configuration

### Capacitor Config (`capacitor.config.ts`)

```typescript
{
  appId: 'com.aicodereview.app',
  appName: 'AI Code Review',
  webDir: 'out',
  server: {
    androidScheme: 'https', // Use HTTPS for Android
    iosScheme: 'capacitor', // Use capacitor:// for iOS
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0a0a0a',
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0a0a0a',
    },
  }
}
```

### App IDs and Names

To customize:
- **App ID**: Edit `capacitor.config.ts` → `appId`
- **App Name**: Edit `capacitor.config.ts` → `appName`
- **iOS Display Name**: Edit `ios/App/App/Info.plist` → `CFBundleDisplayName`
- **Android Display Name**: Edit `android/app/src/main/res/values/strings.xml` → `app_name`

## App Icons & Splash Screens

### Generate Assets

1. Create source images in `resources/`:
   - `icon.png` (1024x1024, with transparency)
   - `splash.png` (2732x2732, centered content)

2. Generate all sizes:
   ```bash
   npx capacitor-assets generate
   ```

### Manual Setup

Alternatively, place assets manually:
- **iOS**: `ios/App/App/Assets.xcassets/`
- **Android**: `android/app/src/main/res/drawable-*/` and `mipmap-*/`

## Troubleshooting

### Build Fails with "Server Actions not supported"

This error means some server-side code wasn't properly replaced. Check:
- All `@clerk/nextjs` imports are replaced with `@clerk/clerk-react`
- No `"use server"` directives in code
- API routes and middleware are backed up
- Dynamic routes requiring `generateStaticParams` are backed up

### App Crashes on Launch

1. Check native logs:
   - **iOS**: Xcode → Window → Devices and Simulators → Open Console
   - **Android**: Android Studio → Logcat

2. Common issues:
   - Missing environment variables (`.env.local`)
   - Invalid Clerk publishable key
   - Network errors (check API endpoints)

### Assets Not Updating

After changing code, always:
```bash
npm run mobile:build  # Rebuild
npm run mobile:sync   # Sync to native
```

Then clean build in IDE:
- **Xcode**: Product → Clean Build Folder
- **Android Studio**: Build → Clean Project

### OAuth Not Working

Mobile OAuth requires proper URL schemes:
- iOS: Configured in `Info.plist`
- Android: Configured in `AndroidManifest.xml`

Check Clerk dashboard for correct redirect URLs:
- `capacitor://localhost/auth/callback` (iOS)
- `https://localhost/auth/callback` (Android)

## Production Build

### iOS

1. Archive in Xcode:
   - Product → Archive
   - Validate & distribute to App Store

2. Configure signing:
   - Xcode → Signing & Capabilities
   - Select your team and provisioning profile

### Android

1. Generate signed APK/Bundle:
   - Android Studio → Build → Generate Signed Bundle/APK
   - Create/use keystore
   - Select release variant

2. Upload to Play Console

## Environment Variables

The mobile app uses the same `.env.local` as the web app:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_API_URL=https://your-backend.com
```

**Important:** Only `NEXT_PUBLIC_*` variables are available in the mobile app (client-side only).

## Known Limitations

1. **No API Routes**: API routes don't work in static export. All API calls must go to external backend.
2. **No Server-Side Rendering**: Everything is client-side rendered.
3. **No Middleware**: Clerk middleware doesn't run. Use client-side guards.
4. **Dynamic Routes**: Handled via SPA fallback (client-side routing).
5. **Large Bundle Size**: Entire app is included (no server-side code splitting).

## Architecture Notes

### Why Static Export?

Capacitor requires static files (HTML/CSS/JS). Next.js Server Components, API routes, and middleware don't work in native apps.

### Why Clerk React SDK?

`@clerk/nextjs` has server-side dependencies. `@clerk/clerk-react` is client-only and works with static export.

### How Dynamic Routes Work

1. Next.js generates `404.html` (custom not-found page)
2. Build script creates `_fallback.html` (copy of 404.html)
3. Not-found page detects Capacitor and route
4. Client-side router loads the correct component

Example: `/dashboard/projects/123`
1. Capacitor serves `404.html` (no static file)
2. Not-found page detects `/projects/[projectId]` pattern
3. Loads `ProjectDetailPage` client-side with `id=123`

## Support

For issues:
1. Check logs (Xcode Console / Android Logcat)
2. Review Capacitor docs: https://capacitorjs.com/docs
3. Check Next.js static export docs: https://nextjs.org/docs/app/building-your-application/deploying/static-exports

## Resources

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Next.js Static Export](https://nextjs.org/docs/app/building-your-application/deploying/static-exports)
- [Clerk React SDK](https://clerk.com/docs/references/react/overview)
- [iOS Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [Android Material Design](https://m3.material.io/)
