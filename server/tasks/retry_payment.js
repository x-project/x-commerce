var async = require('async');
var moment = require('moment');

module.exports = function (app) {

  app.tasks =  app.tasks || {};

  app.tasks.retry_payment = function (task, callback) {
    var data = {};
    data.task = task;
    data.payment_status = {};
    async.waterfall([
      get_order(data),
      retry_submit_payment(data),
      close_order(data),
      save_payment(data),
      // create_review(data)
      mark_complete_task(data)
      // delete_oldest_task(data)
    ],

    function (err) {
      setImmediate(callback, err);
    });
  };

  var delete_oldest_task = function (data) {
    return function (next) {
      var filter_where = {
        where: {
          retry_count: { gt: 6 }
        }
      };
      app.models.Task.destroyAll(filter_where, next);
    };
  };

  var get_order = function (data) {
    return function (next) {
      app.models.Order.get_order_by_id(data.task.data.order_id, function (err, model) {
        data.order = model;
        setImmediate(next, err);
      });
    };
  };

  var retry_submit_payment = function (data) {
    return function (next) {
      var amount = 1;  //data.order.total - (data.order.total * data.order.discount)/100;
      var tras_id = data.task.data.transaction_id;
      console.log(tras_id);
      var _order = app.models.Order;
      _order.braintre_complete_transation(tras_id, amount, function(err, res) {
        data.payment_status.transaction = res;
        setImmediate(next, err);
      });
    };
  };

  var close_order = function (data) {
    return app.models.Order.try_close_order(data);
  };

  var save_payment = function (data) {
    return app.models.Order.try_close_order(data);
  };


  var get_order_items = function (data) {
    return function (next) {
      data.order.order_items(function (err, res) {
        var products_id = [];
        res.forEach(function (item) {
          products_id.push(item.product_id);
        });
        data.order_items_product_id = products_id;
        data.order_items = res;
        setImmediate(next, err);
      });
    };
  };

  var get_reviews = function (data) {
    return function (next) {
      var filter = {where: {and: [{product_id: {inq: data.order_items_product_id}},
      {customer_id: data.order.customer_id}]}};
      app.models.Review.find(filter, function (err, result) {
        data.reviews = result;
        setImmediate(next, err);
      });
    };
  };

  var check_reviews = function (data) {
    return function (next) {

      if(data.order_items.length === data.reviews.length) {
        next();
        return;
      }
      var contains = function (cart, product_id) {
        cart.some(function (item) {
          return item.product_id === product_id;
        });
      };

      data.order_items.forEach(function (order_item) {
        if (!contains(data.reviews, order_item.product_id)) {
          var review = {};
          review.customer_id = data.order.customer_id;
          review.product_id = order_item.product_id;
          review.closed = false;
          review.title = '';
          review.text = '';
          review.rating = 0;
          app.models.Review.create(review, function (err, model) {
            return;
          });
        }
      });
    };
  };

  var create_review = function (data) {
    return function (next) {
      async.waterfall([
        get_order_items(data),
        get_reviews(data)
        // check_reviews(data)
      ],

      function (err) {
        setImmediate(next, err);
      });
    };
  };

  var get_payment = function (data) {
    return function (next) {
      var filter = {where: {id: data.payment.id}}
      data.order.payments(filter, function (err, res) {
        data.payment_checked = res;
        setImmediate(next, err);
      });
    };
  };

  var mark_complete_task = function (data) {
    return function (next) {
      var date_now = new Date(moment().format().split('+')[0] + 'Z');
      var task = data.task;
      task.retry_count++;
      task.last_retry_at = date_now;
      task.done = true;
      task.done_at = date_now;
      app.models.Task.upsert(task, function (err, model) {
        data.new_task = model;
        setImmediate(next, err);
      });
    };
  };

};