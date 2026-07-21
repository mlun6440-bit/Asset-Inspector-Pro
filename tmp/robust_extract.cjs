const fs = require('fs');
const html = fs.readFileSync('/tmp/yt.html', 'utf8');

// Use simple indexOf to find ytInitialPlayerResponse
let startIdx = html.indexOf('ytInitialPlayerResponse = ');
if (startIdx !== -1) {
  startIdx += 'ytInitialPlayerResponse = '.length;
  // find the matching closing semicolon or end of script block
  let endIdx = html.indexOf(';</script>', startIdx);
  if (endIdx === -1) endIdx = html.indexOf(';var ', startIdx);
  if (endIdx === -1) endIdx = html.indexOf(';', startIdx);
  
  if (endIdx !== -1) {
    const jsonStr = html.substring(startIdx, endIdx).trim();
    try {
      // Sometimes there are extra statements. Let's try parsing it or extracting title/description with regex on the substring
      const titleMatch = jsonStr.match(/"title"\s*:\s*"([^"]+)"/) || jsonStr.match(/"title"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"/);
      if (titleMatch) {
        console.log("JSON Title (Robust):", titleMatch[1] || titleMatch[2]);
      }
      
      const authorMatch = jsonStr.match(/"author"\s*:\s*"([^"]+)"/);
      if (authorMatch) {
        console.log("JSON Author (Robust):", authorMatch[1]);
      }

      // Find shortDescription
      const descMatch = jsonStr.match(/"shortDescription"\s*:\s*"([^"]+)"/);
      if (descMatch) {
        // Unescape the string
        console.log("JSON Short Description:", descMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').substring(0, 1500));
      } else {
        // Try finding with general regex in the json string
        const idx = jsonStr.indexOf('"shortDescription":"');
        if (idx !== -1) {
          const descStart = idx + '"shortDescription":"'.length;
          const descEnd = jsonStr.indexOf('","', descStart);
          if (descEnd !== -1) {
            console.log("JSON Short Description (Substr):", jsonStr.substring(descStart, descEnd).replace(/\\n/g, '\n').replace(/\\"/g, '"').substring(0, 1500));
          }
        }
      }
    } catch (e) {
      console.log("Error extracting from player response substring:", e.message);
    }
  }
} else {
  console.log("ytInitialPlayerResponse not found with indexOf");
}

// Let's also look for general meta tags in a robust way
const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/) || html.match(/<meta name="title" content="([^"]+)"/);
if (ogTitle) console.log("og:title:", ogTitle[1]);

const ogUrl = html.match(/<meta property="og:url" content="([^"]+)"/);
if (ogUrl) console.log("og:url:", ogUrl[1]);

const ogDesc = html.match(/<meta property="og:description" content="([^"]+)"/) || html.match(/<meta name="description" content="([^"]+)"/);
if (ogDesc) console.log("og:description:", ogDesc[1]);
