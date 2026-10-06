const { spawn } = require('node:child_process');
const path = require('node:path');
const environment = { ...process.env };
// Some IDEs use Electron as a Node executable. Deed needs the desktop runtime.
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [path.resolve(__dirname, '..'), ...process.argv.slice(2)], { env: environment, stdio: 'inherit' });
child.once('error', err => { console.error(err.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
