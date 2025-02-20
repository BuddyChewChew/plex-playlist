const axios = require('axios');
const fs = require('fs').promises;
const zlib = require('zlib');

async function fetchAndDecompress(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return JSON.parse(zlib.gunzipSync(Buffer.from(response.data)).toString('utf8'));
}

async function fetchPlexChannels() {
  // Plex API requires a token, but free channels might not—testing a guess
  const apiUrl = 'https://plex.tv/api/v2/watch/channels?X-Plex-Platform=web&X-Plex-Client-Identifier=dummy';
  try {
    const response = await axios.get(apiUrl);
    return response.data.channels || [];
  } catch (error) {
    console.error('Plex API fetch failed:', error.message);
    return [];
  }
}

async function generatePlexPlaylist() {
  // Load metadata
  const channelsUrl = 'https://raw.githubusercontent.com/matthuisman/i.mjh.nz/refs/heads/master/Plex/.channels.json.gz';
  const channelsData = await fetchAndDecompress(channelsUrl);
  const channels = (channelsData.regions && channelsData.regions.us && channelsData.regions.us.channels) || channelsData.channels;
  console.log(`Found ${Object.keys(channels).length} channels from .channels.json.gz`);
  console.log(`Sample channel: ${JSON.stringify(channels[Object.keys(channels)[0]], null, 2)}`);

  // Try to get Plex streams (API might need auth—testing a CDN guess instead)
  const streamMap = {};
  // Hypothetical CDN base—needs real endpoint
  const baseCdnUrl = 'https://freq.live/plex/channel/';
  for (const channelId in channels) {
    const channel = channels[channelId];
    const guessedUrl = `${baseCdnUrl}${channelId}/master.m3u8`;
    try {
      const response = await axios.head(guessedUrl);
      if (response.status === 200) {
        streamMap[channelId] = guessedUrl;
      }
    } catch (e) {
      // Silent fail—most will 404
    }
  }
  console.log(`Found ${Object.keys(streamMap).length} valid stream URLs`);

  // Build M3U
  let m3u = '#EXTM3U\n';
  let channelCount = 0;
  for (const channelId in channels) {
    const channel = channels[channelId];
    const name = channel.name || `Plex Channel ${channelId}`;
    const logo = channel.logo || 'https://provider-static.plex.tv/static/images/plex-logo.png';
    const streamUrl = streamMap[channelId];

    if (streamUrl) {
      m3u += `#EXTINF:-1 tvg-id="${channelId}" tvg-name="${name}" tvg-logo="${logo}",${name}\n${streamUrl}\n`;
      channelCount++;
    }
  }

  console.log(`Wrote ${channelCount} channels to M3U`);
  if (channelCount === 0) {
    console.log('No Plex streams found; falling back to iptv-org');
    const fallback = await fetchM3U('https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us_plex.m3u');
    return fallback;
  }

  return m3u;
}

async function fetchM3U(url) {
  const response = await axios.get(url);
  return response.data;
}

async function main() {
  const m3uContent = await generatePlexPlaylist();
  await fs.writeFile('plex.m3u', m3uContent);
  console.log('Playlist written to plex.m3u, channels:', (m3uContent.match(/#EXTINF:/g) || []).length);
}

main().catch(error => console.error('Main error:', error.message));
