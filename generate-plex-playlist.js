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
    'X-Forwarded-For': countryCode === 'us' ? '185.236.200.172' : undefined,
  };

  const params = {
    'X-Plex-Product': 'Plex Web',
    'X-Plex-Version': '4.126.1',
    'X-Plex-Client-Identifier': Math.random().toString(36).substring(2),
    'X-Plex-Language': 'en',
    'X-Plex-Platform': 'Chrome',
  };

  const url = 'https://clients.plex.tv/api/v2/users/anonymous';
  const response = await axios.post(url, null, { headers, params });
  return response.status === 200 || response.status === 201 ? response.data.authToken : null;
}

async function findStreamUrl(pageUrl, token) {
  try {
    const response = await axios.get(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'X-Plex-Token': token,
      },
    });
    const html = response.data;
    const m3u8Match = html.match(/https?:\/\/[^\s"]+\.m3u8/);
    if (m3u8Match) {
      const streamUrl = `${m3u8Match[0]}?X-Plex-Token=${token}`;
      const test = await axios.head(streamUrl, { timeout: 5000, headers: { 'X-Plex-Token': token } });
      if (test.status === 200) {
        console.log(`Found valid stream: ${streamUrl}`);
        return streamUrl;
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
  const channelsData = await fetchChannels(channelsUrl);
  console.log('First channel sample:', JSON.stringify(channelsData[0], null, 2));

  if (!Array.isArray(channelsData)) throw new Error('Invalid channels data: Expected an array');
  console.log(`Found ${channelsData.length} channels`);

  const token = await getPlexToken('us');
  if (!token) throw new Error('Failed to obtain Plex token');

  const streamMap = {};
  const channelsToTest = channelsData.slice(0, 5);
  for (const channel of channelsToTest) {
    const streamUrl = await findStreamUrl(channel.Link, token);
    if (streamUrl) {
      streamMap[channel.Link] = streamUrl;
    }
  }
  console.log(`Found ${Object.keys(streamMap).length} valid streams out of 5 tested`);

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
