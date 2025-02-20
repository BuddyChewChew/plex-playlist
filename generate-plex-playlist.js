const axios = require('axios');
const fs = require('fs').promises;
const zlib = require('zlib');

async function fetchAndDecompress(url) {
  console.log(`Fetching: ${url}`);
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    console.log(`Fetch status: ${response.status}, size: ${response.data.length} bytes`);
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }

    const buffer = Buffer.from(response.data);
    console.log(`Buffer length: ${buffer.length} bytes`);
    const decompressed = zlib.gunzipSync(buffer).toString('utf8');
    console.log(`Decompressed length: ${decompressed.length} chars`);

    const jsonData = JSON.parse(decompressed);
    console.log(`JSON keys: ${Object.keys(jsonData)}`);
    return jsonData;
  } catch (error) {
    console.error(`Error in fetch/decompress: ${error.message}`);
    return null;
  }
}

async function generatePlexPlaylist() {
  const channelsUrl = 'https://raw.githubusercontent.com/matthuisman/i.mjh.nz/refs/heads/master/Plex/.channels.json.gz';
  const channelsData = await fetchAndDecompress(channelsUrl);

  if (!channelsData || !channelsData.channels) {
    console.log('No valid channels data; falling back to iptv-org');
    return await generateFallbackPlaylist();
  }

  const channels = channelsData.channels;
  console.log(`Found ${Object.keys(channels).length} channels`);

  let m3u = '#EXTM3U\n';
  let channelCount = 0;
  for (const channelId in channels) {
    const channel = channels[channelId];
    const name = channel.name || `Plex Channel ${channelId}`;
    const tvgId = channelId;
    const logo = channel.logo || 'https://provider-static.plex.tv/static/images/plex-logo.png';
    // Try multiple possible URL fields
    const streamUrl = channel.url || channel.streamUrl || (channel.media && channel.media[0] && channel.media[0].url) || null;

    console.log(`Channel: ${name}, Stream URL: ${streamUrl || 'Not found'}`);
    if (streamUrl) {
      m3u += `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${name}" tvg-logo="${logo}",${name}\n${streamUrl}\n`;
      channelCount++;
    }
  }

  console.log(`Wrote ${channelCount} channels to M3U`);
  if (m3u === '#EXTM3U\n') {
    console.log('No valid streams; falling back to iptv-org');
    return await generateFallbackPlaylist();
  }

  return m3u;
}

async function generateFallbackPlaylist() {
  console.log('Fetching fallback from iptv-org');
  try {
    const response = await axios.get('https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us_plex.m3u');
    if (response.status === 200) {
      const m3u = response.data;
      console.log('Fallback M3U fetched, channels found:', (m3u.match(/#EXTINF:/g) || []).length);
      return m3u;
