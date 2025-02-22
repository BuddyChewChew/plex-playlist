const axios = require('axios');
const fs = require('fs').promises;

async function fetchChannels(url) {
  console.log('Fetching channels...');
  try {
    const response = await axios.get(url);
    console.log('Channels fetched');
    return response.data;
  } catch (error) {
    throw new Error(`Failed to fetch channels: ${error.message}`);
  }
}

async function getPlexToken(countryCode = 'us') {
  console.log('Getting Plex token...');
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'X-Forwarded-For': countryCode === 'us' ? '185.236.200.172' : undefined,
  };
  const params = {
    'X-Plex-Product': 'Plex Web',
    'X-Plex-Version': '4.126.1',
    'X-Plex-Client-Identifier': Math.random().toString(36).substring(2),
  };
  try {
    const response = await axios.post('https://clients.plex.tv/api/v2/users/anonymous', null, { headers, params });
    if (response.status === 200 || response.status === 201) {
      console.log('Token fetched successfully');
      return response.data.authToken;
    }
    throw new Error(`Unexpected status: ${response.status}`);
  } catch (error) {
    console.error(`Token fetch failed: ${error.message}`);
    return null;
  }
}

async function findStreamUrl(pageUrl, token) {
  console.log(`Scraping: ${pageUrl}`);
  try {
    const response = await axios.get(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'X-Plex-Token': token,
      },
      timeout: 10000, // Give it time to load
    });
    const html = response.data;
    const m3u8Matches = html.match(/https?:\/\/[^'"\s<>]+\.m3u8/g) || [];
    console.log(`Found ${m3u8Matches.length} .m3u8 URLs`);
    for (const m3u8 of m3u8Matches) {
      const streamUrl = `${m3u8}?X-Plex-Token=${token}`;
      try {
        const test = await axios.head(streamUrl, { timeout: 5000, headers: { 'X-Plex-Token': token } });
        if (test.status === 200) {
          console.log(`Found valid stream: ${streamUrl}`);
          return streamUrl;
        }
        console.log(`Stream ${streamUrl} returned ${test.status}`);
      } catch (error) {
        console.log(`Stream ${streamUrl} failed: ${error.response ? error.response.status : error.message}`);
      }
    }
    console.log(`No valid .m3u8 found in ${pageUrl}`);
    return null;
  } catch (error) {
    console.log(`Error fetching ${pageUrl}: ${error.message}`);
    return null;
  }
}

async function generatePlexPlaylist() {
  const channelsUrl = 'https://raw.githubusercontent.com/BuddyChewChew/free-iptv-channels/refs/heads/main/plex/channels.json';
  let channelsData;
  try {
    channelsData = await fetchChannels(channelsUrl);
    console.log('First channel sample:', JSON.stringify(channelsData[0], null, 2));
  } catch (error) {
    throw error;
  }

  if (!Array.isArray(channelsData)) throw new Error('Invalid channels data: Expected an array');
  console.log(`Found ${channelsData.length} channels`);

  const token = await getPlexToken('us');
  if (!token) throw new Error('Failed to obtain Plex token');

  const streamMap = {};
  const channelsToTest = channelsData.slice(0, 10);
  for (const channel of channelsToTest) {
    const streamUrl = await findStreamUrl(channel.Link, token);
    if (streamUrl) {
      streamMap[channel.Link] = streamUrl;
    }
  }
  console.log(`Found ${Object.keys(streamMap).length} valid streams out of ${channelsToTest.length} tested`);

  let m3u = '#EXTM3U\n';
  let channelCount = 0;
  for (const channel of channelsData) {
    const name = channel.Title || `Plex Channel ${channel.Link.split('channel=')[1] || 'Unknown'}`;
    const logo = 'https://provider-static.plex.tv/static/images/plex-logo.png';
    const group = channel.Genre || 'Uncategorized';
    const streamUrl = streamMap[channel.Link];

    if (streamUrl) {
      const channelId = channel.Link.split('channel=')[1] || channel.Link.split('/').pop();
      m3u += `#EXTINF:-1 tvg-id="${channelId}" tvg-name="${name}" tvg-logo="${logo}" group-title="${group}",${name}\n${streamUrl}\n`;
      channelCount++;
    }
  }

  console.log(`Wrote ${channelCount} channels to M3U`);
  if (channelCount === 0) {
    console.log('No Plex streams found; falling back to iptv-org');
    try {
      const fallback = await axios.get('https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us_plex.m3u');
      return fallback.data;
    } catch (error) {
      throw new Error(`Fallback failed: ${error.message}`);
    }
  }

  return m3u;
}

async function main() {
  console.log('Starting...');
  try {
    const m3uContent = await generatePlexPlaylist();
    console.log('Writing file...');
    await fs.writeFile('plex.m3u', m3uContent);
    console.log('Playlist written to plex.m3u, channels:', (m3uContent.match(/#EXTINF:/g) || []).length);
  } catch (error) {
    console.error('Main error:', error.message);
  }
  console.log('Done.');
}

main();
