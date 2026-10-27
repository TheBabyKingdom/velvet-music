# Feature status

This release delivers a usable local-player foundation with real audio processing. It does not claim the entire larger product brief is complete. UI labels and provider diagnostics should take priority when the current track cannot support a control.

| Area | Status | Scope |
| --- | --- | --- |
| Local library | Working | Native file/folder selection, common-format metadata, import preview, cancellation, results and content duplicate detection. Files remain in their original location. |
| Storage | Working | Versioned local JSON, validated updates, atomic writes and backup recovery; queue, settings, playlists and history persist. This is a local database, not a cloud service. |
| Playlists and queue | Working | Local playlist and queue management, favourites, repeat/shuffle and playlist exchange. Saved service references do not become local audio. |
| Themes | Working | Appearance presets and live customisation. Settings are stored locally and can be exported/imported. |
| Tone and EQ | Working for local audio | Six tone filters, 10 adjustable parametric bands or optional 31-band graphic EQ, smooth parameter changes, resets and A/B bypass. |
| Stereo and gain | Working for local audio | Balance, mono, mid/side width and software gain up to 200%; protective limiter stays after processing and gain. |
| Dynamics and ambience | Working for local audio | Compressor, generated-impulse reverb and per-effect bypass/order. |
| Audio analysis | Working for local audio | Real processed-signal spectrum and peak/clipping metering; no fabricated streaming visualisation. |
| Speed | Working where runtime supports it | Playback speed and preserve-pitch option through the media element. Independent pitch shifting is planned. |
| Discovery | Working | 44 curated song references with mood/genre/energy/decade filters; ranking can use actual supplied likes/history. Rankings use the available track metadata. |
| Recording search | Working when online | MusicBrainz metadata search with rate limiting, caching and a meaningful User-Agent. It does not stream songs or establish provider availability. |
| Service links | Working | Spotify tracks/albums/playlists, YouTube/YouTube Music videos/playlists and SoundCloud tracks/sets saved as references and opened in the original service. |
| Service authentication | Planned / Needs credentials | No Spotify, Google or SoundCloud account connection is implemented; no service credentials are requested or stored. |
| Streaming effects | Unavailable for these providers | Remote references and protected/embedded players cannot use this local audio graph. |
| Service migration and sync | Planned | Matching previews, service writes, album/playlist expansion and account-library synchronisation are not implemented. |
| Lyrics | Planned | No licensed or authorised lyric provider has been connected. |
| Seamless/gapless and crossfade | Planned | A single local media element is used; transitions are not guaranteed gapless. |
| Measured loudness normalisation | Planned | No replay-gain scan or integrated LUFS measurement; compression and limiting are separate working controls. |
| Independent pitch control | Planned | Pitch-preserving speed does not provide independent pitch shifting. |
| Third-party extensions | Planned | No arbitrary downloaded plugin code runs. A future plugin host needs isolation, explicit permissions, compatibility checks and recovery. |
| Spicetify integration | Planned and separate | Velvet does not modify or patch the Spotify desktop client. |
| Provider ad/tracker blocking | Planned / provider-limited | The app adds no ads. It does not bypass provider ads, DRM, subscriptions or access restrictions. |
| Signing and automatic updates | Planned | The current Windows build is unsigned and has no automatic updater. |

## Practical limits

Codec support follows the bundled Electron/Chromium runtime. MP3, WAV, FLAC, AAC/M4A, Ogg/Opus and WebM files are accepted for import; an unsupported codec or damaged file can still fail with a playback message. A filename extension alone does not guarantee successful decoding.

Imported artwork is bounded in size and supported formats. Library metadata edits do not rewrite audio-file tags. Playlist imports match already imported local files; import a missing folder first. Duplicate playlist entries preserve order, while duplicate file imports avoid adding another copy.

Effects run on the audio the app can actually access. A limiter can reduce boosted peaks but is not a guarantee against all inter-sample overs or listening damage. The meters are sample-based diagnostics, not calibrated loudness measurements. Audio-device profiles and every advanced layout/extension feature in the original brief require additional development unless explicitly exposed as working in this release.

Bundled demo music is originally generated instrumental material for testing the player. Discovery-song suggestions contain only descriptive metadata and service search links; they are not supplied recordings.

The Windows build and supplied automated checks are the supported delivery target. Release documentation must report any checks that could not be completed; no test suite proves every audio device, codec or remote provider works.
