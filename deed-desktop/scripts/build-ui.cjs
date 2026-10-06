const { spawnSync } = require('node:child_process');
const path = require('node:path');
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
  cwd: path.resolve(__dirname, '../../Deed2'), stdio: 'inherit', env: { ...process.env, REACT_APP_API_URL: '' }
});
process.exit(result.status ?? 1);
