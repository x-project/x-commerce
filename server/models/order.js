var express = require('express');
var body_parser = require('body-parser');
var braintree = require('braintree');
var async = require('async');

var gateway = braintree.connect({
  environment: braintree.Environment.Sandbox,
  merchantId: "f6mgcbwps775kfdx",
  publicKey: "fxqtdy3ssyj7548r",
  privateKey: "76b8e18f6f1a276b79604230fd232d96"
});


module.exports = function (Order) {

  Order.observe('before delete', function(ctx, callback) {
    var order = ctx.instance;

    if (!order) {
      callback(null);
      return;
    }

    async.waterfall([
      function (next) {
        order.order_items.destroyAll(next);
      },

      function (next) {
        order.taxes.destroyAll(next);
      }
    ],
    function (err) {
      if (err) {
        callback(err);
        return;
      }
      callback(null);
    });
  });


  /*BRAINTREE*/
  /*
    * 1 get client token
  */
  Order.get_client_token = function (customer_id, callback) {
    gateway.customer.find(customer_id, function (err, customer) {
      if (err) {
        callback(err, null);
        return;
      }
      gateway.clientToken.generate({
        customerId: customer_id
      },
        function (err, response) {
          if (err) {
            callback(err, null);
            return;
          }
          callback(null, response);
        }
      );
    });
  };

  var get_amount = function (order_items, callback) {
    var amount = 0;
    order_items.forEach( function (item) {
      if (item.product_variant()) {
        amount += item.quantity * item.product_variant().price;
      }
      else {
        amount += item.quantity * item.product().price;
      }
    });
    callback(null, amount);
  };

  function  try_close_transation(sale_result, callback) {
    console.log(sale_result);
    gateway.transaction.submitForSettlement(sale_result.transaction.id, callback);
  };

  var try_checkout_cart = function ( nonce, amount, callback) {
    var data = { paymentMethodNonce: nonce, amount: amount};
    gateway.transaction.sale(data, function (err, sale_result) {
      try_close_transation(sale_result, function (err, trans_complete) {
        if (err) {
          callback(err, null);
        }
        callback(null, trans_complete);
      });
    });
  };



  Order.checkout = function (order_id, payment_method_nonce, callback) {
    var order;
    var amount = 0;
    async.waterfall([
      function (next) {
        Order.findById(order_id, {include: [{order_items: ['product', 'product_variant']}, 'customer']}, next);
      },

      function (order, next) {
        order = order;
        get_amount(order.order_items(), next);
      },

      function (amount, next) {
        amount = amount;
        console.log(amount);
        try_checkout_cart(payment_method_nonce, amount, next);
      }
    ],

    function (err, result) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, result);
    });

  };


  Order.remoteMethod('get_client_token', {
    accepts: { arg: 'customer_id', type: 'string', required: true },
    returns: { arg: 'token', type: 'object' },
    http: { verb: 'get', path:'/client_token' }
  });

  Order.remoteMethod('checkout', {
    accepts: [ { arg: 'order_id', type: 'string' }, { arg: 'payment_method_nonce', type: 'string' }],
    returns: { arg: 'status', type: 'object' },
    http: { verb: 'post', path:'/:order_id/checkout' }
  });

};