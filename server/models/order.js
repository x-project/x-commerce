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


  Order.checkout = function (payment_method_nonce, amount, callback) {
    var data = { amount: amount, paymentMethodNonce: nonce };
    gateway.transaction.sale(data, function (err, result) {
      try_close_transation(result, function (err, tras_complete) {
        if (err) {
          callback(err);
        }
        callback(trans_complete);
      });
    });
  };


function try_close_transation (result, callback) {
  gateway.transaction.submitForSettlement(result.transaction.id, callback);
}
  /*
    * 2 create transition
  */


  Order.remoteMethod('get_client_token', {
    accepts: { arg: 'customer_id', type: 'string', required: true },
    returns: { arg: 'token', type: 'object' },
    http: { verb: 'get', path:'/client_token' }
  });

  Order.remoteMethod('checkout', {
    accepts: [
              { arg: 'payment_method_nonce', type: 'object', required: true },
              { arg: 'amount', type: 'object', required: true },
              { arg: 'order_id', type: 'string', required: true }
            ],
    returns: { arg: 'status', type: 'boolean' },
    http: { verb: 'post', path:'/checkout' }
  });

};