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
    app.models.Order.findById(task.data.order_id, function (err, order) {
      var amount = 1;//order.total
      app.models.Order.braintre_complete_transation(task.data.transaction_id, amount, function(err, res) {
        task.done = true;
        task.retry_count = task.retry_count+1;
        app.models.Task.upsert(task, function (err, model) {
          if (err) {
            done(err, null);
            return;
          }
          if (res.success) {
            order.status = 'closed';
            app.models.Order.upsert(order, function (err, model) {
              if (err) {
                done(err, null);
                return;
              }
              done(null, null);
            });
          }
        });
      });
    });
  };

  var run_handler = function (task, callback) {
    task.retry_count++;
    if (task.handler === 'braintre_complete_transation') {
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
        app.models.Task.findOne(filter_where, function (err, model) {
          task = model;
          setImmediate(callback, err, !!model);
        });
      },

      function (callback) {
        run_handler(task, function (err, result) {
          callback(null);
        });
      },

      function (err) {
        callback(null);
      }
    );
  };

  var start = function () {
    if (running === false) {
      loop_task(function (err) {
        running = false
      });
    }
  };

  var job = new CronJob('* * * * * *',
    function() {
      start();
    }, null, true, 'Europe/London');

  if (require.main === module) {
    app.start();
  }
});