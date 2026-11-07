import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ethioorb.game',
  appName: 'ETHIO-NASA: Orbital Defense',
  webDir: 'dist',
  android: {
    backgroundColor: '#080b18',
    allowMixedContent: false,
  },
};

export default config;
