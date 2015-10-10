var async = require('async');

module.exports = function (Order) {

  Order.observe('before delete', function(ctx, callback) {
    var order;

    async.waterfall([
      function (next) {
        Order.findById(ctx.where.id, function(err, model) {
          if (err) {
            next(err);
            return;
          }
          order = model;
          next();
        });
      },

      function (next) {
        order.order_items.destroyAll(next);
      },

      function (next) {
        order.taxes.destroyAll(next);
      }
    ],
    function (err) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, null);
    });
  });

};