// generateTree.cjs or generateTree.js (ESM-compatible with import adjustments)
const fs = require('fs');
const path = require('path');

// Folders/files to exclude
const exclude = ['node_modules', '.git', 'dist', 'build'];

function generateTree(dirPath, prefix = '') {
    const files = fs.readdirSync(dirPath).filter(file => !exclude.includes(file));

    files.forEach((file, index) => {
        const fullPath = path.join(dirPath, file);
        const isLast = index === files.length - 1;
        const stats = fs.statSync(fullPath);
        const treeSymbol = isLast ? '└── ' : '├── ';

        console.log(`${prefix}${treeSymbol}${file}`);

        if (stats.isDirectory()) {
            const newPrefix = prefix + (isLast ? '    ' : '│   ');
            generateTree(fullPath, newPrefix);
        }
    });
}

// Start from current directory
generateTree('.');
