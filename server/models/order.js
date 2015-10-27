var express = require('express');
var body_parser = require('body-parser');
var braintree = require('braintree');
var async = require('async');
var loopback = require('loopback');

var stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

var gateway = braintree.connect({
  environment: braintree.Environment.Sandbox,
  merchantId: process.env.BRAINTREE_MERCHANT_ID,
  publicKey: process.env.BRAINTREE_PUBLIC_KEY,
  privateKey: process.env.TOKEN_SECRET_BRAINTREE
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

  var get_amount = function (order_items) {
    var amount = order_items.reduce(function (amount, item) {
      var price = item.product_variant ? item.product_variant.price : item.product.price;
      return amount + item.quantity * price;
    }, 0);
    return amount;
  };

  //obj = {complete: complete_trasition, order: new_order}
  var create_payment =  function (obj, done) {
    var payment = Order.app.models.Payment;
    var payment_model = {
      success: obj.complete.transaction.success,
      tras_id: obj.complete.transaction.id,
      status: obj.complete.transaction.status,
      amount: obj.complete.transaction.amount,
      bin: obj.complete.transaction.creditCard.bin,
      cardType: obj.complete.transaction.creditCard.cardType,
      customerLocation: obj.complete.transaction.creditCard.customerLocation,
      debit: obj.complete.transaction.creditCard.debit,
      expirationDate: obj.complete.transaction.creditCard.expirationDate,
      expirationMonth: obj.complete.transaction.creditCard.expirationMonth,
      expirationYear: obj.complete.transaction.creditCard.expirationYear,
      maskedNumber: obj.complete.transaction.creditCard.maskedNumber,
      last4: obj.complete.transaction.creditCard.last4,
      issuingBank: obj.complete.transaction.creditCard.issuingBank,
      createdAt: obj.complete.transaction.createdAt,
      merchantAccountId: obj.complete.transaction.merchantAccountId,
      paymentInstrumentType: obj.complete.transaction.paymentInstrumentType,
      processorAuthorizationCode: obj.complete.transaction.processorAuthorizationCode,
      processorResponseCode: obj.complete.transaction.processorResponseCode,
      processorResponseText: obj.complete.transaction.processorResponseText,
      updatedAt: obj.complete.transaction.updatedAt,
      type: obj.complete.transaction.type,
      statusHistory: obj.complete.transaction.statusHistory
      // order_id: obj.order.id
    };
    payment.create(payment_model, done);
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

  var create_order = function (customer, amount, done) {
    var order = {
      customer_id: customer.id,
      total: amount
    };
    Order.create(order, done);
  };

  var create_order_item = function (order, cart, done) {
    var cart_clone = cart.slice(0);
    cart_clone.forEach(function (item) {
      delete item.variant;
      delete item.product;
    });
    order.order_items.create(cart, done);
  };

  var prepare_order_review = function (customer, cart, done) {
    var reviews = [];
    var review;
    cart.forEach( function (item) {
      review = {};
      review.customer_id = customer.id;
      review.product_id = item.product_id;
      review.closed = false;
      review.title = '';
      review.text = '';
      review.rating = 0;
      reviews.push(review);
    });
    Order.app.models.Review.create(reviews, done);
  };

  var prepare_order = function (customer, cart, amount, callback) {
    var new_order;
    async.waterfall([
      function (next) {
        create_order(customer, amount, next);
      },

      function (order, next) {
        new_order = order;
        create_order_item(order, cart, next);
      },

      function (result, next) {
        next(null, new_order);
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

  var mark_closed_order =  function (order, done) {
    order.status = 'closed';
      Order.upsert(order, done);
  };

  var create_fail_task = function (order, payment, callback) {
    var data_payment = {
      success: transaction.success,
      tras_id: transaction.id,
      status: transaction.status,
      amount: transaction.amount,
      bin: transaction.creditCard.bin,
      cardType: transaction.creditCard.cardType,
      customerLocation: transaction.creditCard.customerLocation,
      debit: transaction.creditCard.debit,
      expirationDate: transaction.creditCard.expirationDate,
      expirationMonth: transaction.creditCard.expirationMonth,
      expirationYear: transaction.creditCard.expirationYear,
      maskedNumber: transaction.creditCard.maskedNumber,
      last4: transaction.creditCard.last4,
      issuingBank: transaction.creditCard.issuingBank,
      createdAt: transaction.createdAt,
      merchantAccountId: transaction.merchantAccountId,
      paymentInstrumentType: transaction.paymentInstrumentType,
      processorAuthorizationCode: transaction.processorAuthorizationCode,
      processorResponseCode: transaction.processorResponseCode,
      processorResponseText: transaction.processorResponseText,
      updatedAt: transaction.updatedAt,
      type: transaction.type,
      statusHistory: transaction.statusHistory
    };
    order.payments.create(data_payment, callback);
  };


  var checkout_braintree = function (order, nonce, amount, callback) {
    var transaction = gateway.transaction;
    var data = { paymentMethodNonce: nonce, amount: amount };
    transaction.sale(data, function (err, response) {
      if (err) {
        callback(err, null);
        return;
      }
      if (!response.success) {
        callback(response, null);
        return;
      }
      transaction.submitForSettlement(response.params.transaction.id, function (err, complete) {
        if (err) {
          create_fail_task(order, tras_completed);
          callback(err, null);
          return;
        }
        callback(null, complete);
        return;
      });
    });
  };

  Order.checkout_braintree = function (cart, payment_method_nonce, customer_token, callback) {
    var new_order, tras_completed;
    var amount = 0;
    async.waterfall([
      function (next) {
        get_customer(customer_token, next);
      },

      function (customer, next) {
        curr_customer = customer;
        amount = get_amount(cart);
        prepare_order(customer, cart, amount, next);
      },

      function (order, next) {
        new_order = order;
        prepare_order_review(curr_customer, cart, next);
      },

      function (result, next) {
        checkout_braintree(new_order, payment_method_nonce, -1, next);
      },

      function (complete, next) {
        if (complete.success) {
          tras_completed = complete;
          mark_closed_order(new_order, next);
          return;
        }
        next(null, new_order);
      },

      function (order_closed, next) {
        new_order = order_closed;
        next(null, {complete: tras_completed, order: new_order});
      }

      // function (output, next) {
      //   create_payment(output, function (err, result) {
      //     next(null, output);
      //   });
      // },
    ],

    function (err, result) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, result);
    });
  };

  var stripe_checkout = function ( token, amount, callback) {
    var charge = stripe.charges.create({
      amount: amount * 100,//cents
      currency: "eur",
      source: token,
      description: "my first faker payment"
    }, function(err, charge) {
      if (err && err.type === 'StripeCardError') {
        callback(err, null);
      }
    callback(null, charge);
    });
  };

  Order.checkout_stripe = function (cart, token, customer_token, callback) {
    var new_order, tras_completed;
    var amount = 0;
    async.waterfall([
      function (next) {
        get_customer(customer_token, next);
      },

      function (customer, next) {
        curr_customer = customer;
        amount = get_amount(cart);
        prepare_order(customer, cart, amount, next);
      },

      function (order, next) {
        new_order = order;
        prepare_order_review(curr_customer, cart, next);
      },

      function (result, next) {
        stripe_checkout(token, 1, next);
      },
      function (complete, next) {
        tras_completed = complete;
        mark_closed_order(new_order, next);
      },

      function (order_closed, next) {
        new_order = order_closed;
        next(null, {complete: tras_completed, order: new_order});
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

  Order.remoteMethod('checkout_braintree', {
    accepts: [
      { arg: 'cart', type: 'array' },
      { arg: 'payment_method_nonce', type: 'string' },
      { arg: 'customer_token', type: 'string' }
    ],
    returns: { arg: 'result', type: 'object' },
    http: { verb: 'post', path:'/checkout' }
  });

  Order.remoteMethod('checkout_stripe', {
    accepts: [
      { arg: 'cart', type: 'array' },
      { arg: 'token', type: 'string' },
      { arg: 'customer_token', type: 'string' }
    ],
    returns: { arg: 'result', type: 'object' },
    http: { verb: 'post', path:'/stripe' }
  });
};