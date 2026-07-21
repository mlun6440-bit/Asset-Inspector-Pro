const fs = require('fs');
const html = fs.readFileSync('/tmp/yt.html', 'utf8');

const keyword = '"shortDescription":"';
const idx = html.indexOf(keyword);
if (idx !== -1) {
  console.log("Found shortDescription at:", idx);
  const start = idx + keyword.length;
  // find the closing quote, keeping in mind escaped quotes \"
  let end = start;
  while (end < html.length) {
    if (html[end] === '"' && html[end - 1] !== '\\') {
      break;
    }
    end++;
  }
  const desc = html.substring(start, end);
  console.log("--- DESCRIPTION ---");
  console.log(desc.replace(/\\n/g, '\n').replace(/\\"/g, '"').substring(0, 3000));
} else {
  console.log("shortDescription keyword not found.");
  // Let's find any occurrences of "CFO" and print surrounding text
  const cfoIdx = html.indexOf('CFO');
  if (cfoIdx !== -1) {
    console.log("Found CFO at:", cfoIdx);
    console.log(html.substring(cfoIdx - 100, cfoIdx + 300));
  }
}
