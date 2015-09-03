var loopback = require('loopback');
var boot = require('loopback-boot');
var path = require('path');

var app = module.exports = loopback();

app.start = function() {
  return app.listen(function() {
    app.emit('started');
    console.log('Web server listening at: %s', app.get('url'));
  });
};

boot(app, __dirname, function(err) {
  if (err) throw err;

  app.use(loopback.static(path.resolve(__dirname, '../client')));

  var index_path = path.resolve(__dirname, '../client/index.html');
  app.get('*', function (req, res) { res.sendFile(index_path); });

  if (require.main === module)
    app.start();
});
