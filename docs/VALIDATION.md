# Validation for Velvet 1.0.0

The Windows desktop, real audio-rendering and persistence checks passed on 27 October 2026 for commit `bea776444c56de8356e5aa98a2225e154787ce6d`.

- [Successful Windows build and release](https://github.com/TheBabyKingdom/velvet-music/actions/runs/40504471427)
- [Published Windows download](https://github.com/TheBabyKingdom/velvet-music/releases/tag/v1.0.0)

The automated run completed all 16 desktop checks with no renderer console errors. It verified real local playback, initial DSP activation, the processed audio meter, Audio Lab changes and persistence, queue occurrences, themes, playlists, favourites, and restored image, GIF and looping video wallpapers. The live MusicBrainz catalogue request succeeded.

Actual OfflineAudioContext rendering verified gain, tone, parametric and graphic EQ, A/B bypass, mono, compression, convolution reverb, the protective limiter and smooth parameter changes. Measured gain doubled RMS amplitude; the test loud/quiet ratio fell from 10.00 to 1.51 with compression; the boosted test signal's peak fell from 1.80 to 0.974 with protection enabled. These figures describe those synthetic test signals, not every possible recording or listening device.

Unit and backend tests also passed for imports, duplicate detection, playlist formats, validated storage and backup recovery. The first CI attempt stopped at an invalid absolute compressor-output assertion. That assertion was replaced with a dynamic-range comparison; the production audio pipeline was unchanged.

The app remains unsigned. Physical listening across audio devices, every codec, and provider account streaming are not covered by these checks. Service streaming, synchronised lyrics and other items marked Planned in FEATURES.md remain unfinished.
