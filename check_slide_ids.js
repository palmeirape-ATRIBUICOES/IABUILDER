const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Match each slide element and its index
const regex = /<div\s+[^>]*class="slide[^"]*"[^>]*>/g;
let match;
let index = 0;
while ((match = regex.exec(html)) !== null) {
    const slideTag = match[0];
    const idMatch = /id="([^"]+)"/.exec(slideTag);
    const id = idMatch ? idMatch[1] : 'no-id';
    console.log(`Index ${index}: ID = ${id}`);
    index++;
}
