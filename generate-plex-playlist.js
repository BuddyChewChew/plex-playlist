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

    try {
      const jsonData = JSON.parse(decompressed);
      console.log(`JSON keys: ${Object.keys(jsonData)}`);
      if (!jsonData.channels) {
        throw new Error('No "channels" key in JSON');
      }
      return jsonData;
    } catch (parseError) {
      console.error(`JSON parse error: ${parseError.message}`);
      console.log(`Raw decompressed sample: ${decompressed.substring(0, 100)}`);
      return null;
    }
  } catch (error) {
    console.error(`Error in fetch/decompress: ${error.message}`);
    return null;
  }
}

async function generatePlexPlaylist() {
  const channelsUrl = 'https://raw.githubusercontent.com/matthuisman/i.mjh.nz/refs/heads/master/Plex/.channels.json.gz';
  const channelsData = await fetchAndDecompress(channelsUrl);

  if (!channelsData || !channelsData.channels) {
    console.log('Failed to get valid channels; falling back to iptv-org');
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
    const streamUrl = channel.url || null;

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
    } else {
      console.error('Fallback fetch failed:', response.status);
      return '#EXTM3U\n#EXTINF:-1 tvg-id="error" tvg-name="Error" tvg-logo="",Error\nhttp://example.com/error.m3u8';
    }
  } catch (error) {
    console.error('Error fetching fallback:', error.message);
    return '#EXTM3U\n#EXTINF:-1 tvg-id="error" tvg-name="Error" tvg-logo="",Error\nhttp://example.com/error.m3u8';
  }
}

async function main() {
  const m3uContent = await generatePlexPlaylist();
  await fs.writeFile('plex.m3u', m3uContent);
  console.log('Playlist written to plex.m3u, channels:', (m3uContent.match(/#EXTINF:/g) || []).length);
}

main().catch(error => console.error('Main error:', error.message));
