import type { CapacitorConfig } from '@capacitor/cli'

// CapacitorConfig has no static orientation field. The native Android activity is
// sensorLandscape-locked in AndroidManifest.xml and ScreenOrientation.lock is
// called at runtime for native hosts.

const config: CapacitorConfig = {
  appId: 'com.ethionasa.orbitaldefense',
  appName: 'ETHIO-NASA',
  webDir: 'dist',
  android: { allowMixedContent: false, backgroundColor: '#020610' },
}

export default config
