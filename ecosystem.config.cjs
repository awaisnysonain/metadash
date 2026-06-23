module.exports = {
  apps: [{
    name: 'meta-dashboard',
    script: 'tsx',
    args: 'server/index.ts',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      PORT: 5011,
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '512M',
  }],
};
