# Brick

Installable web app (PWA) that mirrors the BRICK Figma design (Airy palette, Ubuntu type, 8-point spacing). Plain HTML, CSS and JS, no build step.

## Home Screen install

1. Open the GitHub Pages URL in Safari on your iPhone.
2. Share, Add to Home Screen, name it Brick.
3. Launch from the icon for the full screen view.

After an update, open the app twice, or delete the icon and add it again, to refresh the cache.

## How it behaves

- First screen: state deck, essentials, grabber. Tap the grabber or scroll to reach NFC configuration.
- UNLOCKED, ARMING and BRICKED states with a live countdown, or time bricked when no minimum lock is set.
- Tap the **lock timer** while unlocked to cycle the minimum lock: none, 30 min, 1 h, 2 h, 4 h, 8 h.
- Tap the **tag ID** to replace the placeholder with your tag's real UID. Display only.
- State is saved on the device.
- The button is a manual toggle. The real lock is your Focus mode and Shortcuts.
- The FIREWALL switch shows whether your app interceptor is on. It does not control iOS.
- Phone, Messages, Maps and Music open the native apps.
- Emergency unlock waits 60 seconds. Change `EMERGENCY_SECONDS` in `app.js`.

## Linking it to your NFC shortcut

Add an **Open URLs** action after Set Focus:

- Bricked: `?state=bricked&min=90` (min is optional)
- Unlocked: `?state=unlocked`

Append these to your site URL. iOS opens links in Safari, not the installed Home Screen app, and the two keep separate saved state. Either allow Safari for this one link or toggle the Home Screen app by hand.

## Files

- `index.html`, `style.css`, `app.js`: the app
- `shaders.js`: the moving gradient and Moire fills
- `manifest.webmanifest`, `sw.js`: install and offline support
- `icons/`: Home Screen icons
- `.nojekyll`: serve files as is on GitHub Pages

Ubuntu is loaded from Google Fonts, with a system font fallback when offline.

## Shader fills

`shaders.js` is a WebGL2 port of the two Figma shader fills on the state deck: the moving gradient (24% opacity, animated, capped at about 30 fps and paused when the app is hidden) and the Moire pattern (4% opacity, static). Settings are copied from the Figma file. If WebGL2 is unavailable, or the viewer prefers reduced motion, it falls back to a static gradient.
