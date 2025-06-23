// extractFilesToText.js

const fs = require('fs');
const path = require('path');

// 🟡 Add the paths to the files you want to extract
const filesToExtract = [
  'controllers/orderController.js',
  'controllers/userOrderController.js',
  'extractFilesToText.js',
  'generateTree.cjs',
  'models/orderModel.js',
  'models/userOrderModel.js',
  'routes/orderRoutes.js',
  'routes/pingRoute.js',
  'routes/userOrderRoutes.js',
  'server.js',
  'utils/cashfree.js',
  'utils/usersDbConnection.js',
];




const outputFile = 'selected_code_output.txt';

let output = '';

filesToExtract.forEach((filePath) => {
  const absolutePath = path.resolve(filePath);

  if (fs.existsSync(absolutePath)) {
    const code = fs.readFileSync(absolutePath, 'utf-8');
    const fileName = path.basename(filePath);

    output += `${fileName}:\n`;
    output += code + '\n\n';
  } else {
    console.warn(`⚠️ File not found: ${filePath}`);
  }
});

fs.writeFileSync(outputFile, output, 'utf-8');
console.log(`✅ Code from selected files saved to: ${outputFile}`);
