# Rebuild implementation reference notes

## Capacitor landscape orientation

Capacitor's official guide recommends a static Android global orientation through `android:screenOrientation` on the main activity in `AndroidManifest.xml`. Its dynamic Screen Orientation API is provided by `@capacitor/screen-orientation`, whose `lock({ orientation: 'landscape' })` and `unlock()` methods can be invoked from the native app. The Android 16 / target SDK 36 large-screen restriction applies to runtime orientation locks; the project also uses the manifest lock and must retain adaptive browser layout. The official Capacitor configuration reference does not define an Android orientation property for `capacitor.config.ts`, so the project records the relationship there in a comment rather than adding an unsupported field.

Sources:
- https://capacitorjs.com/docs/guides/screen-orientation
- https://capacitorjs.com/docs/apis/screen-orientation
- https://capacitorjs.com/docs/config
