const axios = require('axios');
const fs = require('fs').promises;

async function getPlexToken(region = 'us') {
  const headers = {
    'Accept': 'application/json',
    'Origin': 'https://app.plex.tv',
    'Referer': 'https://app.plex.tv/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'X-Plex-Product': 'Plex Web',
    'X-Plex-Version': '4.126.1',
    'X-Plex-Client-Identifier': Math.random().toString(36).substring(2),
  };

  const xForwardedForMap = {
    'uk': '178.238.11.6',
    'us': '185.236.200.172',
    'ca': '192.206.151.131',
  };

  if (xForwardedForMap[region]) {
    headers['X-Forwarded-For'] = xForwardedForMap[region];
  }

  try {
    const response = await axios.post('https://clients.plex.tv/api/v2/users/anonymous', null, { headers });
    if (response.status === 200 || response.status === 201) {
      console.log('Token retrieved:', response.data.authToken.substring(0, 5) + '...');
      return response.data.authToken;
    } else {
      console.error('Token fetch failed:', response.status, response.data);
      return null;
    }
  } catch (error) {
    console.error('Error fetching token:', error.message);
    return null;
  }
}

async function scrapePlexChannels(region) {
  const plexToken = await getPlexToken(region);
  if (!plexToken) {
    console.log('Falling back to iptv-org due to token failure');
    return await generateFallbackPlaylist();
  }

  try {
    const channelsUrl = `https://tv.plex.tv/api/v2/livetv/channels?X-Plex-Token=${plexToken}`;
    const response = await axios.get(channelsUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'X-Plex-Client-Identifier': Math.random().toString(36).substring(2),
        'X-Plex-Product': 'Plex Web',
        'X-Plex-Version': '4.126.1'
      }
    });

    if (response.status !== 200) {
      console.log('API returned non-200:', response.status, response.data);
      return await generateFallbackPlaylist();
    }

    const channels = response.data.data || response.data.channels || [];
    console.log('Found channels:', channels.length);

    if (channels.length === 0) {
      console.log('No channels found; using fallback');
      return await generateFallbackPlaylist();
    }

    let m3u = `#EXTM3U url-tvg="https://epg.provider.plex.tv/grid?type=channel&X-Plex-Token=${plexToken}"\n`;
    channels.forEach((channel, index) => {
      const name = channel.title || channel.name || `Plex Channel ${index + 1}`;
      const tvgId = channel.id || channel.ratingKey || `${index + 1}`;
      const logo = channel.thumbnail || channel.thumb ? `${channel.thumbnail || channel.thumb}?X-Plex-Token=${plexToken}` : 'https://provider-static.plex.tv/static/images/plex-logo.png';
      const streamUrl = channel.media && channel.media[0] && channel.media[0].url
        ? `${channel.media[0].url}?X-Plex-Token=${plexToken}`
        : (channel.streamUrl ? `${channel.streamUrl}?X-Plex-Token=${plexToken}` : null);

      if (streamUrl) {
        m3u += `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${name}" tvg-logo="${logo}",${name}\n${streamUrl}\n`;
      }
    });

    if (m3u === `#EXTM3U url-tvg="https://epg.provider.plex.tv/grid?type=channel&X-Plex-Token=${plexToken}"\n`) {
      console.log('No valid streams; using fallback');
      return await generateFallbackPlaylist();
    }

    return m3u;
  } catch (error) {
    console.error('Error scraping channels:', error.message);
    return await generateFallbackPlaylist();
  }
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
  const region = 'us';
  const m3uContent = await scrapePlexChannels(region);
  await fs.writeFile('plex.m3u', m3uContent);
  console.log('Playlist written to plex.m3u');
}

main().catch(console.error);
