import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS, RECOMMENDATIONS, parseServiceLink, inferProvider, getProviderSearchUrl, getSuggestions, getEmbedUrl } from '../src/providers.js';

test('Spotify share links canonicalise without tracking', () => {
  for (const type of ['track', 'album', 'playlist']) {
    const parsed = parseServiceLink(`https://open.spotify.com/intl-en/${type}/4uLU6hMCjMI75M1A2tKUQC?si=tracking`);
    assert.equal(parsed.source, 'spotify'); assert.equal(parsed.type, type);
    assert.equal(parsed.url, `https://open.spotify.com/${type}/4uLU6hMCjMI75M1A2tKUQC`);
    assert.equal(parsed.status, 'reference'); assert.equal(parsed.playable, false);
  }
});
test('YouTube references preserve the requested recording', () => {
  const short = parseServiceLink('https://youtu.be/dQw4w9WgXcQ?t=12');
  const music = parseServiceLink('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890');
  assert.equal(short.id, music.id);
  assert.equal(music.url, 'https://music.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(parseServiceLink('https://www.youtube.com/playlist?list=PL1234567890').type, 'playlist');
});
test('SoundCloud references do not claim metadata lookup', () => {
  const track = parseServiceLink('https://soundcloud.com/artist-name/track-name?utm_source=clipboard');
  assert.equal(track.type, 'track'); assert.equal(track.title, 'track name');
  assert.equal(parseServiceLink('https://soundcloud.com/artist/sets/collection').type, 'playlist');
  assert.equal(parseServiceLink('https://soundcloud.com/search?q=example'), null);
});
test('rejects unsupported, malicious and malformed links', () => {
  for (const url of ['javascript:alert(1)', 'http://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    'https://open.spotify.com.evil.test/track/4uLU6hMCjMI75M1A2tKUQC',
    'https://user:password@open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    'https://open.spotify.com:8443/track/4uLU6hMCjMI75M1A2tKUQC',
    'https://open.spotify.com/track/not-an-id', 'https://youtu.be/not-valid',
    'https://www.youtube.com/watch?v=<script>', 'https://soundcloud.com/artist/%3Cscript%3E']) assert.equal(parseServiceLink(url), null, url);
  assert.equal(inferProvider('https://music.youtube.com'), 'youtube');
});
test('search links escape text instead of fabricating recording IDs', () => {
  const query = 'Artist & song / # title?';
  assert.equal(new URL(getProviderSearchUrl('youtube', query)).searchParams.get('q'), query);
  assert.equal(decodeURIComponent(new URL(getProviderSearchUrl('spotify', query)).pathname.slice(8)), query);
  assert.equal(getProviderSearchUrl('unknown', query), null);
  assert.equal(getProviderSearchUrl('spotify', ''), null);
});
test('discovery filters constrain results without invented history', () => {
  assert.ok(RECOMMENDATIONS.length >= 40);
  const tracks = getSuggestions({ mood: 'focus', genre: 'electronic', energy: 'high', decade: '2010s' });
  assert.ok(tracks.length > 0);
  assert.ok(tracks.every(t => t.mood === 'focus' && t.genre === 'electronic' && t.energy >= .7 && t.year >= 2010 && t.year < 2020));
  assert.ok(getSuggestions({ query: 'khruangbin' }).every(t => t.artist === 'Khruangbin'));
  assert.deepEqual(getSuggestions({ genre: 'imaginary' }), []);
  assert.ok(getSuggestions({ energy: 0 }).every(t => t.energy <= .2));
  assert.ok(getSuggestions().every(t => !t.reason.includes('your listening')));
});
test('actual likes and listening history affect ranking with an honest reason', () => {
  const liked = getSuggestions({ likedArtists: ['Beach House'] });
  assert.equal(liked[0].artist, 'Beach House'); assert.equal(liked[0].reason, 'An artist you liked');
  const history = getSuggestions({ history: [{ artist: 'Cleo Sol', genre: 'soul' }] });
  assert.equal(history[0].artist, 'Cleo Sol'); assert.ok(history[0].reason.includes('listening history'));
  assert.equal(getSuggestions({ limit: 0 }).length, 0);
});
test('remote reference imports never advertise streaming or audio effects', () => {
  assert.equal(PROVIDERS.local.capabilities.effects, true);
  for (const source of ['spotify', 'youtube', 'soundcloud']) {
    assert.equal(PROVIDERS[source].capabilities.playback, false);
    assert.equal(PROVIDERS[source].capabilities.effects, false);
    assert.equal(PROVIDERS[source].capabilities.referenceImport, true);
  }
});
test('embed helper only accepts recognised references and never autoplays', () => {
  assert.equal(getEmbedUrl('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'), 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC');
  assert.equal(getEmbedUrl('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0');
  assert.equal(getEmbedUrl({ source: 'spotify', providerId: '<script>', url: 'https://evil.example/' }), null);
});

