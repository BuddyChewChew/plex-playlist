async function findStreamUrl(pageUrl, token) {
  const channelSlug = pageUrl.split('/').pop(); // e.g., "go-wild"
  const possibleStreamUrl = `https://epg.provider.plex.tv/streams/${channelSlug}/master.m3u8?X-Plex-Token=${token}`;
  
  try {
    const test = await axios.head(possibleStreamUrl, {
      timeout: 5000,
      headers: { 'X-Plex-Token': token },
    });
    if (test.status === 200) {
      console.log(`Found valid stream: ${possibleStreamUrl}`);
      return possibleStreamUrl;
    }
    console.log(`Stream ${possibleStreamUrl} returned ${test.status}`);
    return null;
  } catch (error) {
    console.log(`Stream ${possibleStreamUrl} failed: ${error.response ? error.response.status : error.message}`);
    
    // Fallback: try fetching the page as before
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
}
