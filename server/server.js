var loopback = require('loopback');
var boot = require('loopback-boot');
var path = require('path');
var env = require('node-env-file');
var auth = require('./auth/auth');
var app = module.exports = loopback();
var moment = require('moment');

if (process.env.NODE_ENV !== 'production') {
  env(__dirname + '/.env');
}

app.start = function() {
  return app.listen(function() {
    app.emit('started');
    console.log('Web server listening at: %s', app.get('url'));
  });
};

boot(app, __dirname, function(err) {
  if (err) throw err;
  app.use(loopback.static(path.resolve(__dirname, '../public')));
  app.use(loopback.static(path.resolve(__dirname, './public'), { index: false }));

  auth(app);

  app.get('/admin/*', function (req, res) {
    res.sendFile(path.resolve(__dirname, '../public/admin.html'));
  });

  app.get('/*', function (req, res) {
    res.sendFile(path.resolve(__dirname, '../public/index.html'));
  });

  require('./tasks/cron')(app);

  app.run_handler = function (task, callback) {
    if (!(task.handler in app.tasks)) {
      callback({});
      return;
    }
    app.tasks[task.handler](task, callback);
  };

  if (require.main === module) {
    app.start();
  }
});