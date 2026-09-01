// ==========================================
// ENTRY POINT
// The Express app is assembled in src/app.js (modular structure).
// This file only boots the HTTP server and keeps the startup banner.
// ==========================================
const app = require('./src/app');
const config = require('./src/config');

if (require.main === module) {
    app.listen(config.port, config.host, () => {
        console.clear();

        const cyan = '\x1b[36m';
        const green = '\x1b[32m';
        const yellow = '\x1b[33m';
        const magenta = '\x1b[35m';
        const bold = '\x1b[1m';
        const reset = '\x1b[0m';

        console.log(`
${cyan}${bold}
  █████╗ ███╗   ██╗██╗███╗   ███╗███████╗
 ██╔══██╗████╗  ██║██║████╗ ████║██╔════╝
 ███████║██╔██╗ ██║██║██╔████╔██║█████╗
 ██╔══██║██║╚██╗██║██║██║╚██╔╝██║██╔══╝
 ██║  ██║██║ ╚████║██║██║ ╚═╝ ██║███████╗
 ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝╚═╝     ╚═╝╚══════╝
       STREAMING SERVER v7.0 (MODULAR)
${reset}
${yellow}=================================================${reset}
  ${green}✔${reset} ${bold}SERVER STATUS :${reset} ${green}ONLINE & READY${reset}
  ${green}✔${reset} ${bold}PORT          :${reset} ${magenta}${config.port}${reset}
  ${green}✔${reset} ${bold}URL LOCAL     :${reset} ${cyan}http://localhost:${config.port}${reset}
${yellow}=================================================${reset}
  ${bold}Tekan ${reset}${yellow}CTRL + C${reset}${bold} untuk mematikan server.${reset}
    `);
    });
}

module.exports = app;
