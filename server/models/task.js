var async = require('async');

module.exports = function (Task) {

  var get_order = function (data) {
    return function (next) {
      Task.app.models.Order.get_order_by_id(data.task.data.order_id, function (err, model) {
        data.order = model;
        setImmediate(next, err);
      });
    };
  };

  var destroy_order = function (data) {
    return function (next) {
      if(data.order !== null) {
        Task.app.models.Order.destroyById(data.order.id, next);
        return;
      }
      next();
    };
  };

  var get_task = function (data) {
    return function (next) {
      Task.findById(data.task_id, function (err, model) {
        data.task = model;
        setImmediate(next, err);
      });
    };
  };

  Task.observe('before delete', function(ctx, callback) {
    var task_id = ctx.where.id;
    var data = {};
    data.task_id = task_id;

    if (!task) {
      callback(null);
      return;
    }
    async.waterfall([
      get_task(data),
      get_order(data),
      destroy_order(data)
    ],

    function (err) {
      setImmediate(callback, err);
    });
  });
};