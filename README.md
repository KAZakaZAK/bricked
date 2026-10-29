# Brick web app

Installable web app (PWA) that mirrors the Figma design. Plain HTML, CSS and JS, no build step.

## Host it (free, pick one)

- **Netlify Drop:** go to app.netlify.com/drop, drag this whole folder in. You get an https URL in seconds.
- **Cloudflare Pages:** Workers & Pages, Create, Upload assets, drop the folder.
- **GitHub Pages:** push the folder to a repo, Settings, Pages, deploy from main.

It must be served over https for the service worker and install to work.

## Put it on your Home Screen

1. Open the URL in Safari on your iPhone.
2. Share, Add to Home Screen, name it Brick.
3. Launch from the icon. It runs full screen with no Safari bars.

## How it behaves

- UNLOCKED, ARMING and BRICKED states, a live countdown (or time bricked when no minimum lock is set), and the same panels and tokens as Figma.
- State is saved on the device, so it survives closing the app.
- The CTA is a manual toggle. The real lock is still your Focus mode and Shortcuts.
- The FIREWALL switch is a display of whether your app interceptor is on. It does not control iOS.
- Phone, Messages, Maps and Music chips open the native apps.
- Emergency unlock waits 60 seconds. Change `EMERGENCY_SECONDS` in `app.js`.

## Linking it to your NFC shortcut

Add an **Open URLs** action after Set Focus:

- Bricked: `https://YOUR-SITE/?state=bricked&min=90` (min is optional)
- Unlocked: `https://YOUR-SITE/?state=unlocked`

iOS opens these in Safari, not in the installed Home Screen app, and the two keep separate saved state. Two ways to handle it:

1. Allow Safari for this one link. Don't list Safari in your app guard, or the guard will lock the phone as soon as the link opens.
2. Skip the link. Open the Home Screen app by hand and use its toggle to mirror the state.

Test whether **Open App** in Shortcuts can list the Home Screen app on your iOS version. If it can, use that instead of Open URLs.

## Files

- `index.html`, `style.css`, `app.js`: the app
- `manifest.webmanifest`, `sw.js`: install and offline support
- `icons/`: Home Screen icons
