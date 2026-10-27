# Velvet

**Your music, your atmosphere.**

An independent Windows desktop music player with a carefully designed interface, expressive themes, a local library and a real audio effects engine. Inspired by the ease of Spotify and the customisation of Spicetify, with its own design and implementation.

Velvet is a local player first. Spotify, YouTube Music and SoundCloud are labelled service references and official search links; this release does not provide account-connected streaming. Read [provider capabilities](docs/PROVIDERS.md) and the [feature status](docs/FEATURES.md) for the working features and remaining limitations.

## Download and use

The Windows download is **Velvet-1.0.0-Windows-x64.zip**, for 64-bit Windows 10/11. Extract **all** its contents into a folder, then open **Velvet.exe**. Keep the executable beside its included runtime files and resources. You do not need Node.js, a terminal, or administrator access.

Try the three original Velvet Sessions instrumentals, then choose **Add music** to import files or a music folder. Open **Appearance** to change themes, colours and layout, or choose your own image, animated GIF or video wallpaper. GIFs retain their animation; video wallpapers loop silently.

The executable is unsigned. Windows may identify it as an unrecognised app; check the source and supplied checksum before deciding whether to run it. Signing a future release requires the maintainer's signing certificate.

Your imported music stays in its original location. Keep those files accessible after importing. Library, playlists, queue, preferences and history are stored in your Windows app-data folder, normally %APPDATA%\Velvet. Back up that folder and your original music separately.

## What you can do

- Import local music with a preview, duplicate detection and metadata; create playlists and restore a queue between sessions.
- Shape local audio with tone controls, a 10-band parametric or 31-band graphic EQ, stereo controls, reverb, compression and a protective limiter.
- Change themes, colours, layout, fonts and your own image, GIF or video background.
- Explore 44 curated song suggestions by mood, genre, energy and decade; look them up on your preferred listening service.
- Search recording metadata through MusicBrainz when online, then choose a service to find a recording. Metadata results contain no audio.
- Export playlists as JSON, CSV or M3U/M3U8, and move your Velvet preferences with a settings export and confirmation preview.

Playlist edits are local. Service account synchronisation, provider audio downloads and protected-audio processing are not implemented. The feature matrix lists the remaining larger-brief work explicitly.

## Run the source

Use Node.js 24 and pnpm 11.25.0. From the source folder:

    pnpm install --frozen-lockfile
    pnpm start

Installation runs the included prepare script to generate the bundled icon, artwork and three original 48-second demo compositions. These assets need no separate download. The source archive may already include them; a fresh Git checkout can recreate them.

Dependencies download at installation time; local playback works offline afterwards. The lockfile is included. Electron supplies the native window and file bridge; the interface uses HTML/CSS/JavaScript, and local sound is processed with Web Audio. No hosted backend is required.

## Check and build

On a Windows desktop:

    pnpm test
    pnpm run test:backend
    pnpm run test:desktop
    pnpm run dist

The desktop test uses a separate test library. The default dist command builds a runnable Windows ZIP in release/. To build an optional single-file portable executable on a machine that can run the NSIS compiler:

    pnpm run dist:portable

To create just the application folder:

    pnpm run pack

The delivered Windows package is a ZIP. A local single-file EXE build was not completed because the build host could not launch the NSIS compiler. This does not affect the ZIP's included Velvet.exe. macOS and Linux require their own validation and are not supplied as tested binaries.

Regenerate the bundled assets independently with:

    node scripts/generate-assets.mjs

## Verification status

The core player and controls are implemented in the delivered source. Automated checks cover library imports, duplicate detection, persistent state, playlist formats, provider handling and audio parameter logic. The build host could not launch the native Electron test process, so live desktop playback, processed sound and visual behaviour remain unverified here. The included desktop test is intended to verify those behaviours on a Windows desktop that can run Electron.

## GitHub and release builds

The project repository is [TheBabyKingdom/velvet-music](https://github.com/TheBabyKingdom/velvet-music), created as a private repository. Your account must have access to view it. The delivery message identifies the source and downloads actually published.

The included Windows build workflow installs the locked dependencies, regenerates assets, runs the unit, backend and desktop checks, and builds a Windows ZIP with a SHA-256 checksum. A manual Actions run produces a downloadable build artifact; its optional input also builds a single-file portable EXE. Pushing a version tag such as v1.0.0 publishes the ZIP and checksum to a GitHub Release after checks succeed. The tagged-release step needs repository Contents write permission.

A workflow or source checkout is not itself a completed release. Use the supplied ZIP or a successful workflow artifact to run the app without developer tools.

## Configuration and privacy

No API keys are required for local playback, curated suggestions or public MusicBrainz search. MusicBrainz requests identify Velvet and its maintainer's public GitHub profile. Optional environment variables are documented in .env.example; the app does not automatically load .env files. Never put service secrets in the renderer or commit them to GitHub.

Velvet has no advertisements or telemetry of its own. MusicBrainz receives a catalogue query when you explicitly search; opening a listening service uses that service and its privacy/account rules. Local listening history is controlled in Settings. Universal ad blocking or ad-free service playback is not promised.

Gain above 100% increases the signal level and can distort audio. The limiter reduces peaks; it does not make high listening levels safe. Start at a comfortable volume.

## Documentation

- [Feature status and limitations](docs/FEATURES.md)
- [Provider capabilities and official references](docs/PROVIDERS.md)
- [Playlist and settings formats](docs/FORMAT.md)

MIT licensed. Original demo compositions and abstract artwork were created for this project. Your imported music and third-party dependencies retain their own rights and licences.


## Design reference

The brief also referenced [Riff](https://github.com/rootscripts/riff). Velvet takes inspiration from its emphasis on personalisation and an audio workspace; Velvet's implementation, abstract artwork, icons and demo compositions were created for this project.
