const app = require('../src/app');

module.exports = app;

// Disable Vercel automatic body parsing so Express body parsers can populate req.rawBody
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
