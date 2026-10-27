# Portable data formats

Exports are UTF-8 text. These files contain references and settings, not copies of audio. Local music remains on disk. Service references retain the original URL and do not grant download or streaming access.

## Velvet playlist JSON, version 1

```json
{
  "format": "velvet-playlist",
  "version": 1,
  "name": "Late evenings",
  "description": "A playlist stored locally in Velvet",
  "tracks": [
    {
      "id": "a-local-library-track-id",
      "title": "Blue Hour",
      "artist": "Velvet Sessions",
      "album": "After the noise",
      "source": "local",
      "duration": 48,
      "path": "C:\\Music\\blue-hour.wav"
    },
    {
      "title": "A saved Spotify reference",
      "artist": "Service reference",
      "source": "spotify",
      "externalUrl": "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"
    }
  ]
}
```

`format`, `version` and `tracks` are required. Track order follows the array. Optional `name` and `description` are preserved. An exported track can include metadata and artwork. Playback URLs internal to Velvet are omitted. Durations are seconds; zero means unknown.

On import, an existing local record is matched by ID or normalised file path. A supported service URL can create a reference record. A local file that has not been imported is listed as missing; import its folder first, then import the playlist. Duplicate playlist entries remain in order and are reported in the preview. Importing a playlist does not rewrite audio-file metadata or synchronise a service account.

Local paths make these exports useful on the same computer. For another computer, copy your music separately and import it there first. A library export is diagnostic/back-up data; its format differs from a playlist and it is not accepted as a playlist import.

## CSV

The exported header is:

```csv
title,artist,album,source,url,path,duration
```

Values use standard double-quoted CSV cells; embedded quotes are doubled. A CSV import requires a `title` header. Other columns are optional. `url` holds a supported service URL, and `path` holds a local file reference. As with JSON, local files must already be in the library. CSV does not preserve the playlist description or artwork as separate playlist fields.

## M3U / M3U8

```text
#EXTM3U
#PLAYLIST:Late evenings
#EXTINF:48,Velvet Sessions - Blue Hour
C:\Music\blue-hour.wav
```

Each non-comment line is a local path or supported HTTPS service URL. Relative local paths resolve from the playlist file’s directory. `#PLAYLIST` supplies the name; `#EXTINF` carries descriptive text and duration. UTF-8 is used for both export extensions. A service URL is retained as a reference even if another player cannot play it. Playlist description and artwork are not represented by this format.

## Settings JSON, version 1

```json
{
  "format": "velvet-settings",
  "version": 1,
  "settings": {}
}
```

The app exports its actual appearance, audio, layout and preferences inside `settings`. Their names are version-specific; prefer an app-generated file to editing this object manually. Imports validate the format/version and show a preview before replacing settings. They do not execute code. They do not contain provider access tokens.

The on-disk library state uses a separate `schemaVersion` field, revision and recovery backup. Do not substitute a playlist/settings document for that internal state file.
