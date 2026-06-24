import fs from 'fs';
import { execSync } from 'child_process';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const keys = ['META_APP_ID', 'META_APP_SECRET', 'META_ACCESS_TOKEN'];
const updates = Object.fromEntries(keys.map(k => [k, env[k]]));

const py = `import re
from pathlib import Path
p = Path('/var/www/html/metadashboard/.env')
text = p.read_text()
updates = ${JSON.stringify(updates)}
for k, v in updates.items():
    if re.search(r'^' + k + r'=', text, re.M):
        text = re.sub(r'^' + k + r'=.*$', k + '=' + v, text, flags=re.M)
    else:
        text += '\\n' + k + '=' + v
p.write_text(text)
print('Updated', ', '.join(updates.keys()))
`;

const pem = 'C:/Users/Nysonian/Downloads/NysonianERP-v2.pem';
const host = 'ec2-user@54.172.115.118';
fs.writeFileSync('_update_meta_env.py', py);

execSync(
  `scp -i "${pem}" -o StrictHostKeyChecking=no _update_meta_env.py ${host}:/tmp/_update_meta_env.py`,
  { stdio: 'inherit' }
);
execSync(
  `ssh -i "${pem}" -o StrictHostKeyChecking=no ${host} "python3 /tmp/_update_meta_env.py; rm -f /tmp/_update_meta_env.py; pm2 restart metadashboard"`,
  { stdio: 'inherit' }
);
fs.unlinkSync('_update_meta_env.py');
console.log('Server Meta credentials updated and metadashboard restarted.');
