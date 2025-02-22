const axios = require('axios');
const fs = require('fs').promises;

async function fetchChannels(url) {
  const response = await axios.get(url);
  return response.data;
}

async function generatePlexPlaylist() {
  const channelsUrl = 'https://raw.githubusercontent.com/BuddyChewChew/free-iptv-channels/refs/heads/main/plex/channels.json';
  const channelsData = await fetchChannels(channelsUrl);

  // Extract channels from the JSON structure
  const channels = (channelsData.regions && channelsData.regions.us && channelsData.regions.us.channels) || channelsData.channels;
  if (!channels) {
    throw new Error('No channels found in channels.json');
  }
  console.log(`Found ${Object.keys(channels).length} channels from channels.json`);

  // Base CDN URL for Plex streams (update this if needed)
  const baseCdnUrl = 'https://plex-freqlive-plex-akamai.akamaized.net/channels/'; // Placeholder—verify via DevTools

  let m3u = '#EXTM3U\n';
  let channelCount = 0;

  for (const channelId in channels) {
    const channel = channels[channelId];
    const name = channel.name || `Plex Channel ${channelId}`;
    const logo = channel.logo || 'https://provider-static.plex.tv/static/images/plex-logo.png';
    // Assume stream URL is constructed from channelId; adjust if channels.json provides URLs directly
    const streamUrl = channel.streamUrl || `${baseCdnUrl}${channelId}/master.m3u8`;

    m3u += `#EXTINF:-1 tvg-id="${channelId}" tvg-name="${name}" tvg-logo="${logo}",${name}\n${streamUrl}\n`;
    channelCount++;
  }

  console.log(`Wrote ${channelCount} channels to M3U`);
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
