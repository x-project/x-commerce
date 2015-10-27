var async = require('async');
var loopback = require('loopback');
var boot = require('loopback-boot');
var path = require('path');
var env = require('node-env-file');
var auth = require('./auth/auth');
var app = module.exports = loopback();
var CronJob = require('cron').CronJob;
var dateFormat = require('dateformat');


 // var now = new Date();
 // var date = dateFormat(now, "isoDateTime");
 // var date = date.replace('+','Z+');
 // console.log(date);

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

  app.retry_payment = function (task, done) {
    // console.log(task);
    // TODO RETRY PAYMENT
    console.log(task);
    app.models.Task.destroyById(task.id, function (err) {
      if(err) {
        callback(err);
        return;
      }
      done(null, null);
    });
  };

  var run_handler = function (task, callback) {
    task.retry_count++;
    // app.models.Task.upsert(task, function (err, model) {
    // });
    if (task.handler === 'retry_payment') {
      app.retry_payment(task, function (err, result) {
        if(err) {
          callback(err);
          return;
        }
        callback(null);
      });
    }
  };

  var loop_task = function (callback) {
    running = true;
    var task;
    async.during(
      function (callback) {
        var filter_where = { where: {done: false} };
        app.models.Task.findOne(function (err, model) {
          task = model;
          setImmediate(callback, err, !!model);
        });
      },

      function (callback) {
        run_handler(task, function (err, result) {
          callback();
        });
      },

      function (err) {
        callback();
      }
    );
  };

  var start = function (callback) {
    if (running === false) {
      loop_task(callback);
    }
    else {
      callback(null);
    }
  };

  var job = new CronJob({
    cronTime: '* * * * * *',//Each minute
    onTick: start(function (err) {
      if (err) {
        running = false;
      }
    }),
    start: true,
    timeZone: 'America/Los_Angeles'
  });
  job.start();

  if (require.main === module) {
    app.start();
  }
});