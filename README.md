# StreamDesk — HLS Player Starter

A static, GitHub Pages-ready HLS player built with plain HTML/CSS/JavaScript and [hls.js](https://github.com/video-dev/hls.js/).

## Features

- Paste an HLS `.m3u8` URL and play it in the browser.
- Choose from quality levels exposed by the master playlist.
- Show playback engine, resolution, duration, current time, and buffered position.
- Display HLS/network/media diagnostics in an on-page log.
- Download the playlist text for inspection when the server permits cross-origin access.

## Important limitations

- Use only streams you own or are authorized to access.
- This app does not extract media from third-party pages, bypass login or access controls, or defeat DRM.
- A `blob:` URL is generated inside a browser context and is not a portable stream URL.
- HLS playback requires the playlist **and all referenced segments/keys** to be reachable. Many sources restrict requests using CORS, expiring tokens, cookies, or referrer checks.
- The download button saves the `.m3u8` playlist text only. It does not merge HLS segments into an MP4. The browser's same-origin/CORS rules may prevent playlist downloads.
- GitHub Pages is static hosting. It cannot securely proxy authenticated requests or hide server secrets. Do not put private tokens or credentials in client-side code.
- DRM-protected streams are not supported by this starter.

## Run locally

Because browsers may restrict media/network requests from `file://`, serve the directory over HTTP:

```bash
python -m http.server 8000
```

Open <http://localhost:8000> and enter a playlist URL you are authorized to use.

## Deploy to GitHub Pages

1. Create a new GitHub repository, for example `streamdesk-hls`.
2. Add `index.html`, `README.md`, and `.nojekyll` from this starter.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Choose branch `main` and folder `/(root)`, then save.
6. Wait for GitHub Pages to publish. The URL will look like `https://YOUR-USERNAME.github.io/streamdesk-hls/`.

Alternatively, this repository includes a GitHub Actions workflow at `.github/workflows/pages.yml` for artifact-based deployment. To use it, open **Settings → Pages** and set **Source** to **GitHub Actions**.

## Debugging

1. Open browser Developer Tools → **Network**.
2. Reload the stream and inspect the `.m3u8` request and its segment requests.
3. A `403` can indicate access restrictions; `404` indicates a missing resource; CORS errors mean the source does not permit the browser origin. These clues are not definitive on their own.
4. Confirm the playlist response starts with `#EXTM3U`.
5. Confirm the playlist's relative segment URLs resolve and can be requested by the player.
6. Test a known-good, non-DRM HLS stream that you control to separate app issues from source restrictions.

## Dependencies

The page loads hls.js 1.5.20 from jsDelivr. For production, review and pin dependency versions according to your maintenance policy.
