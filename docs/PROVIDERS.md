# Providers and discovery

Velvet is an independent local music app. It is not affiliated with Spotify, YouTube, SoundCloud or Spicetify. Capability labels describe this release; a link saved in a playlist is not a downloaded recording.

| Source | Working now | Account requirements and limits | Remaining work |
| --- | --- | --- | --- |
| Local files | File imports, library search, playback, queue, playlists, audio processing and analysis | You supply the files. Supported formats depend on Electron codecs. Missing files remain unavailable. | See release limitations for advanced desktop features. |
| Spotify | Recognise track, album and playlist links; save references; open official pages/search | Spotify determines availability. No Spotify credentials are requested or stored. | Authenticated catalogue search, metadata expansion, library sync and in-app streaming are **Planned**. |
| YouTube / YouTube Music | Recognise video and playlist links; save references; open official pages/search | Provider pages retain their account, territory and advertising requirements. | Official visible-player playback and catalogue integration are **Planned**. |
| SoundCloud | Recognise track and set links; save references; open official pages/search | Creator, region or subscription restrictions may apply. | Registered API integration, metadata resolution, widget playback and sync are **Planned**. |

Remote-provider effects, gain, visualisation, crossfade and analysis are **Unavailable for this provider** in this release. Velvet only applies Web Audio processing to imported local files. References are not silently substituted: use alternative search and choose a recording yourself. Album and playlist references preserve the link but do not enumerate their contents.

## Official integration requirements

Spotify’s [Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk) is a separate authorised playback route. Its [getting-started guide](https://developer.spotify.com/documentation/web-playback-sdk/tutorials/getting-started) requires a Premium account and access token, and describes platform restrictions, including keeping Spotify audio unaltered. Velvet does not initialise this SDK. The official [Embed documentation](https://developer.spotify.com/documentation/embeds) explains provider-controlled players; constructing an embed URL alone is not an implemented integration.

The [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference) provides visible embedded video playback. An implementation must respect its player requirements and cannot extract the protected player audio into Velvet’s effects graph. This release opens the original service instead of hiding or stripping its player. Saving a YouTube link does not provide a YouTube Music catalogue API.

The [SoundCloud API guide](https://developers.soundcloud.com/docs) documents registered-app authentication, OAuth 2.1 with PKCE, playback attribution, widgets and restricted tracks. Public API requests still require authorisation; native desktop clients must not bundle a confidential client secret. Future authenticated providers need a reviewed OAuth design and OS-backed credential storage before they are enabled.

Verified against these official pages on 25 October 2026. Provider rules can change; recheck them before adding an integration.

## Song suggestions

Discovery contains 44 curated song references. No copyrighted audio or album covers are bundled with these suggestions. Their abstract artwork is generated locally. Mood, genre and energy are editorial labels, not acoustic measurements; year describes the listed single or album release.

Filters constrain the collection. Artist and genre rankings can use explicit liked artists and actual listening-history records passed to the module. Without those records, Velvet makes no claim of personalisation. This is not a live catalogue, recommendation API or popularity chart. A suggestion opens an encoded artist/title search on the selected provider, so the user chooses the available recording. Availability and explicit-content versions may vary.

No provider is contacted merely by importing this module or rendering a suggestion. Provider pages are opened only after an explicit user action. Velvet has no advertisements of its own and does not promise to remove provider advertisements, subscriptions or regional restrictions.

## Adapter contract

The provider module exports capability records, strict share-link parsers, official search-URL builders and deterministic discovery scoring. The embed URL helper is for a possible later authorised integration; it does not create a player or establish playback support. Never infer playback capability from an embed URL.

Adapters declare playback, catalogue search, reference import, audio import, effects, analysis and sync. Never return a fabricated stream URL or treat references as playable local files. Keep credentials out of exported playlists and settings.

## MusicBrainz recording search

The app’s catalogue search uses MusicBrainz metadata, not provider streaming. The [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API) permits public searches without an API key. Its [rate-limit rules](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting) require at most one request per second and an identifying User-Agent with real contact information. Velvet caches searches and identifies its maintainer as [TheBabyKingdom](https://github.com/TheBabyKingdom). Forks should configure their own real contact.

Search text is sent only when you request a catalogue search. Results can be incomplete or describe alternate releases; choose the desired recording yourself. MusicBrainz supplies no audio. [Core metadata is CC0](https://musicbrainz.org/doc/About/Data_License); supplementary data has separate terms. Commercial public-API use needs the service’s commercial-use review. No MusicBrainz account writes are performed.

## Audius streaming in 1.1

Audius is a working in-app provider. Public search and streaming use its official read-only API without a key. Results must be explicitly streamable and available for public access; private, deleted, unlisted and gated tracks are excluded. Streams stay in the desktop player and support seeking, volume, queueing and the accessible audio pipeline. Provider availability can change; there is no promise that another service's recording is present.

The native bridge handles provider requests. It does not expose arbitrary remote URLs to the renderer. Redirects must use HTTPS and resolve to public network addresses; private/local network targets are rejected. Artwork is bounded and cached. There is no download/export of streamed recordings.

Official API reference: https://docs.audius.co/api/
