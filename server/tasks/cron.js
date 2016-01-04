var async = require('async');
var CronJob = require('cron').CronJob;
var moment = require('moment');

module.exports = function (app) {
  require('./retry_payment')(app);
  var running = false;

  var start = function () {
    if (running === false) {
      loop_task(function (err) {
        running = false;
      });
    }
  };

  var get_next_task = function (tasks) {
    var test = false;
    var task = null;
    for(var i = 0; i < tasks.length && !test; i++) {
      var last_retry_at = new Date(tasks[i].last_retry_at)
      var date_now = new Date(moment().format().split('+')[0] + 'Z');
      var minutes_past = (date_now - last_retry_at)/1000/60;
      // console.log(minutes_past, Math.pow(tasks[i].retry_count, 4.09));
      if (minutes_past > Math.pow(tasks[i].retry_count, 4.09)) {
        task = tasks[i];
        test = true;
      }
    }
    return task;
  };

  var loop_task = function (callback) {
    var task;
    running = true;
    async.during(
      function (callback) {
        var filter = { where: { done: false}};
        app.models.Task.find(filter, function (err, tasks) {
          task = get_next_task(tasks);
          setImmediate(callback, err, !!task);
        });
      },

      function (callback) {
        app.run_handler(task, function (err, result) {
          callback(null);
        });
      },

      function (err) {
        callback(null);
      }
    );
  };

  // var job = new CronJob('* * * * * *', function () { start(); }, null, true, 'Europe/London');

};