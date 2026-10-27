# Velvet

**Your music, your atmosphere.**

A Windows desktop music player with live song search, full-length streaming inside the app, a local library, expressive themes and a real audio effects engine.

## Downloads

- [Velvet 1.0](https://github.com/TheBabyKingdom/velvet-music/releases/tag/v1.0.0): local music, themes, playlists and the audio suite.
- [Velvet 1.1](https://github.com/TheBabyKingdom/velvet-music/releases/tag/v1.1.0): adds live song search and in-app full-song playback from Audius.

Download the Windows ZIP, extract **every file**, then open **Velvet.exe**. No Node.js, terminal or administrator access is needed to run the packaged app. The build is unsigned; compare the download with its release checksum.

## Search and play

Type a song or artist in the search box and press Enter. Playable public tracks from Audius appear with a **Play** button. They play in Velvet with the same pause, seek, volume, queue, favourites, playlists and audio controls as local songs. Nothing opens in a browser when you press Play.

The available catalogue belongs to Audius. It does not contain every recording released on other services. Gated, private and subscription-only tracks are excluded. A saved Spotify, YouTube or SoundCloud reference searches for matching playable versions inside Velvet; choose the recording you want rather than receiving an automatic substitution. Those service accounts are not connected.

The app sends searches and streaming requests to Audius when used. Its Discover page loads public trending tracks and artwork. Your local library and preferences stay on your computer. Streaming needs an internet connection; local files remain usable offline.

## Make it yours

Upload an image, animated GIF or looping video in **Appearance**. Adjust background blur and dimming, colours, fonts, corner radius, spacing and sidebar width. Themes and layout persist between sessions.

Import local files or folders with a preview and duplicate detection. Create standard or smart playlists, keep a mixed local/streaming queue, export playlists, use the sleep timer, and control listening-history collection and retention. Imported files remain in their original location.

**Audio Lab** processes actual accessible audio with tone controls, 10-band parametric or 31-band graphic EQ, reverb, compression, balance, mono, stereo width and gain up to 200%. A protective limiter is enabled by default. Boosted gain can distort audio and increase hearing risk; limiting does not make high listening levels safe.

## Run or build the source

Use Node.js 24 and pnpm 11:

```sh
pnpm install --frozen-lockfile
pnpm start
pnpm test
pnpm run test:backend
pnpm run test:desktop
pnpm run dist:zip
```

Installation regenerates the original demo tracks, artwork and icons. The desktop test uses an isolated library and includes live streaming checks. The Windows workflow runs the checks, packages a ZIP and publishes the versioned release after they pass. macOS and Linux builds need separate validation.

## Documentation

- [Feature status](docs/FEATURES.md)
- [Provider capabilities](docs/PROVIDERS.md)
- [Playlist formats](docs/FORMAT.md)
- [Validation](docs/VALIDATION.md)

MIT licensed. Bundled original compositions and artwork belong to this project. Your music and third-party dependencies retain their own rights and licences. No provider passwords or API keys are required for public Audius search and playback.
