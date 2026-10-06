const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
// Reuse the verified test download for this Mac's app without overwriting its workspace.
if (process.platform !== 'darwin') throw new Error('This preview helper is for the tested Mac build.');
const source = path.resolve(__dirname, '../vendor/model-test/models');
const target = path.join(os.homedir(), 'Library', 'Application Support', 'deed-desktop', 'models');
if (!fs.existsSync(path.join(source, 'manifests'))) throw new Error('Run the real-model check before seeding the preview.');
fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, target, { recursive: true, force: false, mode: fs.constants.COPYFILE_FICLONE });
console.log('Verified model cached for the local Deed app. Existing workspace files were not changed.');
