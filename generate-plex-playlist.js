const axios = require('axios');
const fs = require('fs').promises;
const zlib = require('zlib');

async function fetchAndDecompress(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return JSON.parse(zlib.gunzipSync(Buffer.from(response.data)).toString('utf8'));
}

async function testStreamUrl(url) {
  try {
    const response = await axios.head(url, { timeout: 5000 });
    console.log(`Tested ${url}: ${response.status}`);
    return response.status === 200;
  } catch (error) {
    console.log(`Tested ${url}: ${error.response ? error.response.status : error.message}`);
    return false;
  }
}

async function generatePlexPlaylist() {
  const channelsUrl = 'https://raw.githubusercontent.com/matthuisman/i.mjh.nz/refs/heads/master/Plex/.channels.json.gz';
  const channelsData = await fetchAndDecompress(channelsUrl);
  const channels = (channelsData.regions && channelsData.regions.us && channelsData.regions.us.channels) || channelsData.channels;
  console.log(`Found ${Object.keys(channels).length} channels from .channels.json.gz`);

  // Base URL from earlier sniff—swap this if you find a new one
  const baseCdnUrl = 'https://plex-freqlive-plex-akamai.akamaized.net/channels/';
  const streamMap = {};
  const channelIds = Object.keys(channels).slice(0, 5); // Test 5 to keep it quick
  for (const channelId of channelIds) {
    const streamUrl = `${baseCdnUrl}${channelId}/master.m3u8`;
    if (await testStreamUrl(streamUrl)) {
      streamMap[channelId] = streamUrl;
    }
  }
  console.log(`Found ${Object.keys(streamMap).length} valid stream URLs out of 5 tested`);

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
    const fallback = await axios.get('https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us_plex.m3u');
    return fallback.data;
  }

  return m3u;
}

async function main() {
  const m3uContent = await generatePlexPlaylist();
  await fs.writeFile('plex.m3u', m3uContent);
  console.log('Playlist written to plex.m3u, channels:', (m3uContent.match(/#EXTINF:/g) || []).length);
}

main().catch(error => console.error('Main error:', error.message));
