var express = require('express');
var body_parser = require('body-parser');
var braintree = require('braintree');
var async = require('async');
var loopback = require('loopback');

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

      gateway.clientToken.generate({ customerId: customer_id }, function (err, response) {
        if (err) {
          callback(err, null);
          return;
        }

        callback(null, response);
      });
    });
  };

  var get_amount = function (order_items, callback) {
    var amount = order_items.reduce(function (amount, item) {
      var price = item.product_variant ? item.product_variant.price : item.product.price;
      return amount + item.quantity * price;
    }, 0);
    callback(null, amount);
  };

  var checkout = function (nonce, amount, callback) {
    var data = { paymentMethodNonce: nonce, amount: amount};
    var transaction = gateway.transaction;

    transaction.sale(data, function (err, result) {
      if (err) {
        callback(err);
        return;
      }

      transaction.submitForSettlement(result, function (err, complete) {
        if (err) {
          callback(err, null);
          return;
        }
        callback(null, complete);
      });
    });
  };

  var create_payment =  function (order, checkout, callback) {
    // var payment = Order.app.models.Payment;
    // var payment_model = {
    //   tras_id: trasition_status.id,
    //   order_id: order.id,
    //   amount: trasition_status.amount,
    //   cardType: trasition_status.cardType,
    //   success: trasition_status.success
    // };
    // payment.create(payment_model, fun);
    callback(null, {});
  };

  var get_customer =  function (token, callback) {
    Order.app.models.Customer.relations.accessTokens.modelTo.findById(token, function (err, token) {
      if (err) {
        callback(err, null);
        return;
      }
      Order.app.models.Customer.findById(token.userId, function (err, user) {
        if (err) {
          callback(err, null);
          return;
        }
        callback(null, user);
      });
    });
  };

  var create_model_order = function (customer, amount, done) {
    var order = {
      customer_id: customer.id,
      total: amount
    };
    Order.create(order, done);
  };

  var create_order_item = function (order, cart, done) {
    cart.forEach(function (item) {
      delete item.variant;
      delete item.product;
    });
    order.order_items.create(cart, done);
  };

  var create_order = function (customer, cart, callback) {
    async.waterfall([
      function (next) {
        get_amount(cart, next);
      },

      function (amount, next) {
        create_model_order(customer, amount, next);
      },

      function (order, next) {
        create_order_item(order, cart, next);
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

  Order.checkout = function (cart, payment_method_nonce, token, callback) {
    var order, curr_customer;
    var amount = 0;
    async.waterfall([
      function (next) {
        get_customer(token, next);
      },

      function (customer, next) {
        curr_customer = customer;
        create_order(customer, cart, next);
      }

      // function (result, next) {
      //   get_amount(cart, next);
      // },

      // function (result, next) {
      //   checkout(payment_method_nonce, 10, next);
      // },

      // function (result, next) {
      //   create_payment(order, result, next);
      // }
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
    accepts: [
      { arg: 'cart', type: 'array' },
      { arg: 'payment_method_nonce', type: 'string' },
      { arg: 'token', type: 'string' }
    ],
    returns: { arg: 'result', type: 'object' },
    http: { verb: 'post', path:'/checkout' }
  });

};