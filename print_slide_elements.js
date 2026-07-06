const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const regex = /(<div\s+[^>]*class="slide[^"]*"[^>]*>)/g;
let match;
let index = 0;
while ((match = regex.exec(html)) !== null && index < 25) {
    console.log(`Index ${index}: ${match[1]}`);
    index++;
}
