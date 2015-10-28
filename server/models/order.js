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

  var destroy_order_items = function (order) {
    return function (next) {
      order.order_items.destroyAll(next);
    };
  };

  var destroy_taxes = function (order) {
    return function (next) {
      order.taxes.destroyAll(next);
    };
  };

  Order.observe('before delete', function(ctx, callback) {
    var order = ctx.instance;
    if (!order) {
      callback(null);
      return;
    }

    async.waterfall([
      destroy_order_items(order),
      destroy_taxes(order)
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

  var get_customer = function (data) {
    return function (next) {
      Order.app.models.Customer.findById(data.token, function (err, user) {
        data.customer = user;
        setImmediate(next, err);
      });
    };
  };

  var get_access_token_customer =  function (data) {
    return function (next) {
      var accessTokens = Order.app.models.Customer.relations.accessTokens;
      Order.app.models.Customer.relations.accessTokens.modelTo.findById(data.customer_token, function (err, token) {
        data.token = token.userId;
        setImmediate(next, err);
      });
    };
  };

  var create_order = function (data) {
    return function (done) {
      var amount = get_amount(data.cart);
      data.amount = amount;
      var order = {
        customer_id: data.customer.id,
        total: amount
      };
      Order.create(order, function (err, model) {
        data.new_order = model;
        setImmediate(done, err);
      });
    };
  };

  var create_order_item = function (data, cart) {
    return function (done) {
      var cart = data.cart;
      var cart_clone = data.cart.slice(0);
      cart_clone.forEach(function (item) {
        delete item.variant;
        delete item.product;
      });
      data.new_order.order_items.create(cart, function (err, models) {
        setImmediate(done, err);
      });
    }
  };

  var prepare_order_review = function (data) {
    return function (next) {
      var reviews = [];
      var review;
      data.cart.forEach( function (item) {
        review = {};
        review.customer_id = data.customer.id;
        review.product_id = item.product_id;
        review.closed = false;
        review.title = '';
        review.text = '';
        review.rating = 0;
        reviews.push(review);
      });
      Order.app.models.Review.create(reviews, function (err, model) {
        setImmediate(next, err);
      });
    };
  };

  var prepare_order = function (data) {
    return function (next) {
      var new_order;
      async.waterfall([
        create_order(data),
        create_order_item(data),
      ],
      function (err) {
        setImmediate(next, err);
      });
    };
  };


  var save_payment = function (data) {
    return function (next) {
      var prefix = data.payment_status;
      if (prefix) {
        var data_payment = {
          success: prefix.success,
          tras_id: prefix.transaction.id,
          status: prefix.transaction.status,
          amount: prefix.transaction.amount,
          bin: prefix.transaction.creditCard.bin,
          cardType: prefix.transaction.creditCard.cardType,
          customerLocation: prefix.transaction.creditCard.customerLocation,
          debit: prefix.transaction.creditCard.debit,
          expirationDate: prefix.transaction.creditCard.expirationDate,
          expirationMonth: prefix.transaction.creditCard.expirationMonth,
          expirationYear: prefix.transaction.creditCard.expirationYear,
          maskedNumber: prefix.transaction.creditCard.maskedNumber,
          last4: prefix.transaction.creditCard.last4,
          issuingBank: prefix.transaction.creditCard.issuingBank,
          createdAt: prefix.transaction.createdAt,
          merchantAccountId: prefix.transaction.merchantAccountId,
          paymentInstrumentType: prefix.transaction.paymentInstrumentType,
          processorAuthorizationCode: prefix.transaction.processorAuthorizationCode,
          processorResponseCode: prefix.transaction.processorResponseCode,
          processorResponseText: prefix.transaction.processorResponseText,
          updatedAt: prefix.transaction.updatedAt,
          type: prefix.transaction.type,
          statusHistory: prefix.transaction.statusHistory
        };
        data.new_order.payments.create(data_payment, function (err, model) {
          setImmediate(next, err);
          return;
        });
      }
      next();
    };
  };

  var braintree_checkout = function (data) {
    return function (next) {
      var transaction = gateway.transaction;
      var sale_data = {
        amount: 1,//data.amount
        paymentMethodNonce: data.nonce,
        options: {
          submitForSettlement: false
        }
      };
      transaction.sale(sale_data, function (err, res) {
        if (res.errors !== undefined) {
          var err_detail = {
            params: res.params,
            success: res.success,
            message: res.message
          };
          data.authorizatoin_error = err_detail;
          setImmediate(next, null);
          return;
        }
        data.payment_status = res;
        setImmediate(next, err);
      });
    };
  };

  Order.braintre_complete_transation = function (tras_id, amount, callback) {
    var transaction = gateway.transaction;
    transaction.find(tras_id, function (err, tras_status) {
      if (tras_status.status !== 'submitted_for_settlement') {
        transaction.submitForSettlement(tras_id, amount, callback);
      }
    });
  };

  var create_fail_task = function (data) {
    return function (next) {
      console.log(data.payment_status);
      if (data.payment_status) {
        if (data.payment_status.success) {
          var task = {
            data: {
              order_id: data.new_order.id,
              transaction_id: data.payment_status.transaction.id,
              error: 'data.payment_status'
            },
            handler: 'braintre_complete_transation',
            done: false,
            retry_count: 0,
          };
          Order.app.models.Task.create(task, function (err, model) {
            setImmediate(next, err);
            return;
          });
        }
      }
      next();
    };
  };

  var prepare_response = function (data) {
    return function (next) {
      if (data.payment_status) {
        if (data.payment_status.success) {
          data.data_client_response.complete = data.payment_status;
          data.data_client_response.order = data.new_order;
          next();
          return;
        }
      }
      if (data.authorizatoin_error) {
        data.data_client_response.error = data.authorizatoin_error;
        next();
        return;
      }
    };
  };

  var try_close_order =  function (data) {
    return function (next) {
      if(data.payment_status) {
        if(data.payment_status.success) {
          data.new_order.status = 'closed';
          Order.upsert(data.new_order, function (err, model) {
            data.new_order = model;
            setImmediate(next, err);
            return;
          });
        }
      }
      next();
    };
  };

  Order.checkout_braintree = function (cart, payment_method_nonce, customer_token, callback) {
    var amount = 0;
    var data = {
      cart: cart,
      nonce: payment_method_nonce,
      customer_token: customer_token,
      data_client_response: {}
    };
    async.waterfall([
      get_access_token_customer(data),
      get_customer(data),
      prepare_order(data),
      prepare_order_review(data),
      braintree_checkout(data),
      try_close_order(data),
      save_payment(data),
      create_fail_task(data),
      prepare_response(data)
    ],

    function (err) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, {
        err: data.data_client_response.error,
        order: data.data_client_response.order,
        complete: data.data_client_response.complete
      });
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