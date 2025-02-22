const axios = require('axios');
const fs = require('fs').promises;

async function fetchChannels(url) {
  const response = await axios.get(url);
  return response.data;
}

async function getPlexToken(countryCode = 'us') {
  const headers = {
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en',
    'Origin': 'https://app.plex.tv',
    'Referer': 'https://app.plex.tv/',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  };

  const params = {
    'X-Plex-Product': 'Plex Web',
    'X-Plex-Version': '4.126.1',
    'X-Plex-Client-Identifier': Math.random().toString(36).substring(2), // Simple UUID substitute
    'X-Plex-Language': 'en',
    'X-Plex-Platform': 'Chrome',
    'X-Plex-Platform-Version': '123.0',
    'X-Plex-Features': 'external-media,indirect-media,hub-style-list',
    'X-Plex-Model': 'hosted',
    'X-Plex-Device': 'Linux',
    'X-Plex-Device-Name': 'Chrome',
    'X-Plex-Device-Screen-Resolution': '1282x929,1920x1080',
  };

  const xForwardedForMap = {
    'us': '185.236.200.172',
    'ca': '192.206.151.131',
    'uk': '178.238.11.6',
  };

  if (xForwardedForMap[countryCode]) {
    headers['X-Forwarded-For'] = xForwardedForMap[countryCode];
  }

  const url = 'https://clients.plex.tv/api/v2/users/anonymous';
  try {
    const response = await axios.post(url, null, { headers, params });
    if (response.status === 200 || response.status === 201) {
      const token = response.data.authToken;
      console.log('Plex Token:', token);
      return token;
    }
    console.log('Error fetching token:', response.status);
    return null;
  } catch (error) {
    console.error('Token fetch error:', error.message);
    return null;
  }
}

async function testStreamUrl(url, token) {
  try {
    const response = await axios.head(url, {
      timeout: 5000,
      headers: { 'X-Plex-Token': token },
    });
    console.log(`Tested ${url}: ${response.status}`);
    return response.status === 200;
  } catch (error) {
    console.log(`Tested ${url}: ${error.response ? error.response.status : error.message}`);
    return false;
  }
}

async function generatePlexPlaylist() {
  const channelsUrl = 'https://raw.githubusercontent.com/BuddyChewChew/free-iptv-channels/refs/heads/main/plex/channels.json';
  let channelsData;
  try {
    channelsData = await fetchChannels(channelsUrl);
  } catch (error) {
    throw new Error(`Failed to fetch channels.json: ${error.message}`);
  }

  console.log('Raw channelsData:', channelsData);

  if (!Array.isArray(channelsData)) {
    throw new Error('Invalid channels data: Expected an array in channels.json');
  }

  console.log(`Found ${channelsData.length} channels from channels.json`);

  const token = await getPlexToken('us');
  if (!token) {
    throw new Error('Failed to obtain Plex token');
  }

  // Base URL inspired by GAS script’s transformation
  const baseCdnUrl = 'https://epg.provider.plex.tv/library/parts/'; // Placeholder—needs validation
  const streamMap = {};

  // Test first 5 channels
  const channelsToTest = channelsData.slice(0, 5);
  for (const channel of channelsToTest) {
    const channelId = channel.Link.split('/').pop(); // e.g., "go-wild"
    const streamUrl = `${baseCdnUrl}${channelId}/master.m3u8?X-Plex-Token=${token}`;
    if (await testStreamUrl(streamUrl, token)) {
      streamMap[channelId] = streamUrl;
    }
  }
  console.log(`Found ${Object.keys(streamMap).length} valid stream URLs out of 5 tested`);

  let m3u = '#EXTM3U\n';
  let channelCount = 0;
  for (const channel of channelsData) {
    const channelId = channel.Link.split('/').pop();
    const name = channel.Title || `Plex Channel ${channelId}`;
    const logo = 'https://provider-static.plex.tv/static/images/plex-logo.png';
    const group = channel.Genre || 'Uncategorized';
    const streamUrl = streamMap[channelId];

    if (streamUrl) {
      m3u += `#EXTINF:-1 tvg-id="${channelId}" tvg-name="${name}" tvg-logo="${logo}" group-title="${group}",${name}\n${streamUrl}\n`;
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
  try {
    const m3uContent = await generatePlexPlaylist();
    await fs.writeFile('plex.m3u', m3uContent);
    console.log('Playlist written to plex.m3u, channels:', (m3uContent.match(/#EXTINF:/g) || []).length);
  } catch (error) {
    console.error('Main error:', error.message);
  }
}

main();
