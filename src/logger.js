const chalk = require('chalk');

const logger = {
  info: (msg) => console.log(chalk.blue('ℹ  ') + msg),
  success: (msg) => console.log(chalk.green('✅ ') + msg),
  warn: (msg) => console.log(chalk.yellow('⚠️  ') + msg),
  error: (msg, err = '') => console.log(chalk.red('❌ ') + msg + (err ? chalk.red.dim(` ${err}`) : '')),

  // Specific Modules
  ai: (msg, data = null) => {
    console.log(chalk.magenta('🤖 [AI] ') + msg);
    if (data) console.log(chalk.magenta.dim(typeof data === 'string' ? data : JSON.stringify(data, null, 2)));
  },
  tts: (msg) => console.log(chalk.cyan('🗣️  [TTS] ') + msg),
  coach: (msg) => console.log(chalk.hex('#FFA500')('🧢 [Coach] ') + msg), // Orange
  ws: (msg) => console.log(chalk.blueBright('📡 [WS] ') + msg),

  // Box for startup
  box: (title) => {
    const len = title.length + 8;
    const line = '═'.repeat(len);
    console.log(chalk.blue(`
╔${line}╗
║    ${chalk.bold(title)}    ║
╚${line}╝`));
  }
};

module.exports = logger;
