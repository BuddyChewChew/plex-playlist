const axios = require('axios');
const fs = require('fs').promises;
const zlib = require('zlib');

async function fetchAndDecompress(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return JSON.parse(zlib.gunzipSync(Buffer.from(response.data)).toString('utf8'));
}

async function fetchM3U(url) {
  const response = await axios.get(url);
  return response.data.split('\n');
}

async function generatePlexPlaylist() {
  // Load channel metadata
  const channelsUrl = 'https://raw.githubusercontent.com/matthuisman/i.mjh.nz/refs/heads/master/Plex/.channels.json.gz';
  const channelsData = await fetchAndDecompress(channelsUrl);
  const channels = (channelsData.regions && channelsData.regions.us && channelsData.regions.us.channels) || channelsData.channels;
  console.log(`Found ${Object.keys(channels).length} channels from .channels.json.gz`);
  const sampleId = Object.keys(channels)[0];
  console.log(`Sample channel (${sampleId}): ${JSON.stringify(channels[sampleId], null, 2)}`);

  // Fetch Wurl playlist
  const wurlUrl = 'https://plex.wurl.tv/playlist.m3u8';
  const wurlLines = await fetchM3U(wurlUrl);
  const streamMap = {};
  let currentName = '';
  for (const line of wurlLines) {
    if (line.startsWith('#EXTINF')) {
      const nameMatch = line.match(/,(.+)$/);
      currentName = nameMatch ? nameMatch[1].trim() : '';
    } else if (line.startsWith('http')) {
      streamMap[currentName] = line.trim();
    }
  }
  console.log(`Found ${Object.keys(streamMap).length} streams from Wurl`);

  // Build M3U
  let m3u = '#EXTM3U\n';
  let channelCount = 0;
  for (const channelId in channels) {
    const channel = channels[channelId];
    const name = channel.name || `Plex Channel ${channelId}`;
    const logo = channel.logo || 'https://provider-static.plex.tv/static/images/plex-logo.png';
    const streamUrl = streamMap[name];

    if (streamUrl) {
      m3u += `#EXTINF:-1 tvg-id="${channelId}" tvg-name="${name}" tvg-logo="${logo}",${name}\n${streamUrl}\n`;
      channelCount++;
    }
  }

  console.log(`Matched ${channelCount} channels with streams`);
  if (channelCount === 0) {
    console.log('No matches; falling back to iptv-org');
    const fallback = await fetchM3U('https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us_plex.m3u');
    return fallback;
  }

  return m3u;
}

async function main() {
  const m3uContent = await generatePlexPlaylist();
  await fs.writeFile('plex.m3u', m3uContent);
  console.log('Playlist written to plex.m3u, channels:', (m3uContent.match(/#EXTINF:/g) || []).length);
}

main().catch(error => console.error('Main error:', error.message));
