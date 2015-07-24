var loopback = require('loopback');
var boot = require('loopback-boot');
var path = require('path');
var env = require('node-env-file');

// env(__dirname + '/.env');

var app = module.exports = loopback();

app.use(loopback.token({ model: app.models.accessToken }));
app.use(loopback.compress());

boot(app, __dirname);

app.use(loopback.static(path.resolve(__dirname, '../client')));

app.use(loopback.json());
app.use(loopback.urlencoded({ extended: true }));

app.index_file_path = path.resolve(__dirname, '../client/index.html');
app.get('*', function (req, res) { res.sendFile(app.index_file_path); });

app.start = function() {
  return app.listen(function() {
    app.emit('started');
    console.log('Web server listening at: %s', app.get('url'));
  });
};

if (require.main === module) {
  app.start();
}