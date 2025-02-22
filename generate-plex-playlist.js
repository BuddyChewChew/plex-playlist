async function findStreamUrl(pageUrl, token) {
  try {
    const response = await axios.get(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'X-Plex-Token': token,
      },
    });
    const html = response.data;
    // Broader regex to catch more .m3u8 URLs
    const m3u8Matches = html.match(/https?:\/\/[^'"\s<>]+\.m3u8/g) || [];
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
  const channelsToTest = channelsData.slice(0, 10); // Test 10 to get a better sample
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
