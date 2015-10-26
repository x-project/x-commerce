var async = require('async');
var loopback = require('loopback');
var boot = require('loopback-boot');
var path = require('path');
var env = require('node-env-file');
var auth = require('./auth/auth');
var app = module.exports = loopback();

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

  app.use(loopback.static(path.resolve(__dirname, './storage'), { index: false }));

  auth(app);

  app.get('/admin/*', function (req, res) {
    res.sendFile(path.resolve(__dirname, '../public/admin.html'));
  });

  app.get('/*', function (req, res) {
    res.sendFile(path.resolve(__dirname, '../public/index.html'));
  });



  var running = false;

  var run_hundler = function (task, callback) {
    console.log(task);
    callback();
  };

  var execute_task = function (counter, callback) {
    running = true;
    async.whilst(
      function () {
        return counter > 0;
      },
      function (done) {
        app.models.Task.findOne(function (err, model) {
          if (err) {
            done(err);
          }
          if (model) {
            run_hundler(model, function (err, result) {
              counter--;
              done();
            });
          }
        });
      },
      function (err) {
        callback();
      }
    );
  };

  var prepare_tasks =  function (counter, callback) {
    // if (counter == 0 || running === true) {
    //   //nulla da fare o cron gia avviato
    //   return;
    // }
    // if (counter == 0 && running === false) {
    //   // nulla fa fare
    //   return;
    // }
    // if (counter > 0 && running === true) {
    //   // cron e' gia avviato
    //   return;
    // }
    if (counter > 0 && running === false) {
      //c'è da fare e nessuno sta lavorando
      execute_task(counter, callback);
    }
    else {
      callback();
    }
  };

  var start = function  () {
    app.models.Task.count( function (err, counter) {
      if (err) {
        return;
      }
      prepare_tasks(counter, function () {
        console.log("finsih");
      });
    });
  };

  start();









  if (require.main === module) {
    app.start();
  }
});