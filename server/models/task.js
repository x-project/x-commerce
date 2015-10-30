var async = require('async');

module.exports = function (Task) {

  var get_order = function (data) {
    return function (next) {
      Task.models.Order.get_order_by_id(data.task.data.order_id, function (err, model) {
        data.order = model;
        setImmediate(next, err);
      });
    };
  };

  var destroy_order = function (data) {
    return function (next) {
      Task.model.Order.destroyById(data.order.id, next);
    };
  };

  Task.observe('before delete', function(ctx, callback) {
    var task = ctx.instance;
    var data = {};
    data.task = task;

    if (!task) {
      callback(null);
      return;
    }
    async.waterfall([
      get_order(data),
      destroy_order(data)
    ],

    function (err) {
      if (err) {
        callback(err);
        return;
      }
      callback(null);
    });
  });
};