var async = require('async');
var body_parser = require('body-parser');
var braintree = require('braintree');
var express = require('express');
var moment = require('moment');
var loopback = require('loopback');

module.exports = function (Order) {

  /* ********************************************************* */
  /*
    * data validation
  */
  // Order.validate('customer_id', validate_customer, { message: 'invalid customer' });
  // function validate_customer (err) {
  //   var order = this;
  //   Order.app.models.Customer.exists(order.customer_id, function (error, exixts) {
  //     if (exixts){
  //       return;
  //     }
  //     err();
  //   });
  // }
  /* ********************************************************* */
  Order.app.models.Service.find({where: {name: 'braintree'}}, function (err, models) {
    console.log(models);
  });

  var gateway = braintree.connect({
    environment: braintree.Environment.Sandbox,
    merchantId: process.env.BRAINTREE_MERCHANT_ID,
    publicKey: process.env.BRAINTREE_PUBLIC_KEY,
    privateKey: process.env.BRAINTREE_SECRET_KEY
  });
  var stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

/*=================Tax===================*/
var taxjar = require('taxjar')(process.env.TAXJAR_API_KEY);

taxjar.taxForOrder({
  'from_country': 'IT',
  'to_country': 'FR',
  'amount': 18.50,
  'shipping': 1.5
}).then(function(res) {
  // res.tax; // Tax object
  // res.tax.amount_to_collect; // Amount to collect
  // console.log(res);
});

/*=======================================*/


  Order.payment_systems =  Order.payment_systems || {};

  var destroy_order_items = function (data) {
    return function (next) {
      data.order.order_items.destroyAll( function (err, res) {
        setImmediate(next, err);
      });
    };
  };

  var destroy_taxes = function (data) {
    return function (next) {
      data.order.taxes.destroyAll( function (err, res) {
        setImmediate(next, err);
      });
    };
  };

  var destroy_payment = function (data) {
    return function (next) {
      data.order.payments.destroyAll( function (err, res) {
        setImmediate(next, err);
      });
    };
  };

  var get_order = function (data) {
    return function (next) {
      Order.findById(data.order_id, function (err, model) {
        data.order = model;
        setImmediate(next, err);
      });
    };
  };

  Order.observe('before delete', function(ctx, callback) {
    var order_id = ctx.where.id;
    data = {};
    data.order_id = order_id;

    async.waterfall([
      get_order(data),
      destroy_order_items(data),
      destroy_payment(data),
      destroy_taxes(data)
    ],

    function (err) {
      if (err) {
        callback(err);
        return;
      }
      callback(null);
    });
  });

  //use in server.js
  Order.get_order_by_id = function (order_id, callback) {
    var include_filter = {include: ['customer']};
    Order.findById(order_id, include_filter, callback);
  };

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
    return function (next) {
      var amount = get_amount(data.cart);
      data.amount = amount;
      var order = {};
      var discount = 0;
      if (data.coupon) {
        var date_now = new Date(moment().format().split('+')[0] + 'Z');
        var coupon_from_date = new Date(data.coupon.date_to);
        if (coupon_from_date - date_now > 0) {
          discount = data.coupon.discount;
          data.amount = amount - (amount * data.coupon.discount)/100;
        }
      }
      order.customer_id = data.customer.id;
      order.total = amount;
      order.discount = discount;
      Order.create(order, function (err, model) {
        data.order = model;
        setImmediate(next, err);
      });
    };
  };

  var create_order_item = function (data, cart) {
    return function (next) {
      var cart = data.cart;
      var cart_clone = data.cart.slice(0);
      cart_clone.forEach(function (item) {
        delete item.variant;
        delete item.product;
      });
      data.order.order_items.create(cart, function (err, models) {
        setImmediate(next, err);
      });
    }
  };

  var get_coupon = function (data) {
    return function (next) {
      if (!data.coupon) {
        next();
        return;
      }
      Order.app.models.Coupon.findById(data.coupon, function (err, model) {
        data.coupon = model;
        setImmediate(next, err);
      });
    };
  };

  var update_coupon = function (data) {
    return function (next) {
      if (!data.coupon) {
        next();
        return;
      }
      var coupon = data.coupon;
      coupon.order_id = data.order.id;
      Order.app.models.Coupon.upsert(coupon, function (err, res) {
        setImmediate(next, err);
      });
    };
  };

  var prepare_order = function (data) {
    return function (next) {
      async.waterfall([
        get_coupon(data),
        create_order(data),
        create_order_item(data),
        update_coupon(data)
      ],
      function (err) {
        setImmediate(next, err);
      });
    };
  };

  var braintree_checkout = function (data) {
    return function (next) {
      var transaction = gateway.transaction;
      var sale_data = {
        amount: 1,//data.amount
        paymentMethodNonce: data.payment_method_nonce,
        options: {
          submitForSettlement: true
        }
      };
      transaction.sale(sale_data, function (err, res) {
        if (res.errors !== undefined) {
          var err_detail = {
            params: res.params,
            success: res.success,
            message: res.message
          };
          data.authorization_error = err_detail;
          setImmediate(next, null);
          return;
        }
        data.payment_status = res;
        setImmediate(next, err);
      });
    };
  };

  var get_task_braintree = function (data) {
    var date_now = moment().format().split('+')[0] + 'Z';
    var task = {
      data: {
        order_id: data.order.id,
        transaction_id: data.payment_status.transaction.id,
        customer_id: data.customer.id,
        error: 'data.payment_status'
      },
      handler: 'retry_payment',
      created_at: date_now,
      priority: 'medium',
      last_retry_at: date_now,
      retry_count: 1,
      done: false
    };
    return task;
  };

  var get_task_stripe = function (data) {
    var date_now = moment().format().split('+')[0] + 'Z';
    var task = {
      data: {
        order_id: data.order.id,
        transaction_id: data.stripe_token,
        customer_id: data.customer.id,
        error: 'data.stripe_payment_status'
      },
      handler: 'retry_payment_stripe',
      created_at: date_now,
      priority: 'medium',
      last_retry_at: date_now,
      retry_count: 1,
      done: false
    };
    return task;
  };

  Order.braintre_complete_transation = function (tras_id, amount, callback) {
    var transaction = gateway.transaction;
    transaction.find(tras_id, function (err, tras_status) {
      if (tras_status.status !== 'submitted_for_settlement') {
        transaction.submitForSettlement(tras_id, amount, callback);
        return;
      }
      callback(err, tras_status);
    });
  };

  Order.stripe_complete_transation = function (stripe_token, amount, callback) {
    var charge = stripe.charges.create({
        amount: 1 * 100,//amount * 100
        currency: "eur",
        source: stripe_token,
        description: "retry payment"
      },
      function (err, charge) {
        if (err && err.type === 'StripeCardError') {
          data.stripe_payment_status = 'card_declined';
          setImmediate(next, err);
          return;
        }
        data.stripe_payment_status = charge;
        setImmediate(next, null);
      }
    );
  };

  var create_invoice = function (data) {
    return function (next) {
      //TODO INVOICE
      next();
    };
  };

  var check_pre_condition = function (data) {
    return (data.cart.length <= 0 || data.payment_method_nonce === null ||
      data.payment_method_nonce === undefined ||data. payment_method_nonce.length <= 0 ||
      data.customer_token === null || data.customer_token === undefined || data.customer_token.length <= 0);
  };

  var prepare_response_braintree = function (data) {
    return function (next) {
      if (!data.payment_status) {
        next();
        return;
      }
      if (data.payment_status.success) {
        data.data_client_response.success = data.payment_status.success;
        data.data_client_response.order = data.order;
        next();
        return;
      }
      if (data.authorization_error) {
        data.data_client_response.error = data.authorization_error;
        next();
        return;
      }
    };
  };

  var prepare_response_stripe = function (data) {
    return function (next) {
      if (!data.stripe_payment_status) {
        next();
        return;
      }
      if (data.stripe_payment_status.status == 'succeeded') {
        next();
        return;
      }
      if(data.stripe_payment_status.status !== 'succeeded') {
        Order.app.models.Task.create(get_task_stripe(data), function (err, model) {
          setImmediate(next, err);
          return;
        });
      }
    };
  };

  var create_fail_task_braintree = function (data) {
    return function (next) {
      if (!data.payment_status) {
        next();
        return;
      }
      if (data.payment_status.success) {
        next();
        return;
      }
      if (!data.payment_status.success) {
        Order.app.models.Task.create(get_task_braintree(data), function (err, model) {
          setImmediate(next, err);
          return;
        });
      }
    };
  };

  var create_fail_task_stripe = function (data) {
    return function (next) {
      if (!data.stripe_payment_status) {
        next();
        return;
      }
      if (data.stripe_payment_status.status == 'succeeded') {
        next();
        return;
      }
      if(data.stripe_payment_status.status !== 'succeeded') {
        Order.app.models.Task.create(get_task_stripe(data), function (err, model) {
          setImmediate(next, err);
          return;
        });
      }
    };
  };

  Order.save_payment_braintree = function (data) {
    return function (next) {
      if(!data.payment_status) {
        next();
        return;
      }
      if(data.payment_status.transaction.status !== 'submitted_for_settlement'){
        next();
        return;
      }
      if(data.payment_status.transaction.status === 'submitted_for_settlement') {
        var payment = { payment_method: data.payment_system, payment: data.payment_status};
        data.order.payments.create(payment, function (err, model) {
          setImmediate(next, err);
          return;
        });
      }
    };
  };

  var save_payment_stripe = function (data) {
    return function (next) {
      if (!data.stripe_payment_status) {
        next();
        return;
      }
      if (data.stripe_payment_status.status !== 'succeeded') {
        next();
        return;
      }
      if(data.stripe_payment_status.status === 'succeeded') {
        var payment = { payment_method: data.payment_system, payment: data.stripe_payment_status};
        data.order.payments.create(payment, function (err, model) {
          setImmediate(next, err);
          return;
        });
      }
    };
  };

  Order.try_close_order_braintree = function (data) {
    return function (next) {
      if(!data.payment_status) {
        next();
        return;
      }
      if(data.payment_status.transaction.status !== 'submitted_for_settlement'){
        next();
        return;
      }
      if(data.payment_status.transaction.status === 'submitted_for_settlement') {
        data.order.status = 'closed';
        Order.upsert(data.order, function (err, model) {
          data.order = model;
          setImmediate(next, err);
          return;
        });
      }
    };
  };

  Order.try_close_order_stripe = function (data) {
    return function (next) {
      if (!data.stripe_payment_status) {
        next();
        return;
      }
      if (data.stripe_payment_status.status !== 'succeeded') {
        next();
        return;
      }
      if(data.stripe_payment_status.status === 'succeeded') {
        data.order.status = 'closed';
        Order.upsert(data.order, function (err, model) {
          data.order = model;
          setImmediate(next, err);
          return;
        });
      }
    };
  };

  var get_reviews = function (data) {
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
    return reviews;
  };

  Order.prepare_order_review_braintree = function (data) {
    return function (next) {
      if (!data.payment_status) {
        next();
        return;
      }
      if (data.payment_status.transaction.status !== 'submitted_for_settlement') {
        next();
        return;
      }
      if(data.payment_status.transaction.status === 'submitted_for_settlement') {
        var reviews = get_reviews(data);
        Order.app.models.Review.create(reviews, function (err, model) {
          setImmediate(next, err);
          return;
        });
      }
    };
  };

  Order.prepare_order_review_stripe = function (data) {
    return function (next) {
      if (!data.stripe_payment_status) {
        next();
        return;
      }
      if (data.stripe_payment_status.status !== 'succeeded') {
        next();
        return;
      }
      if(data.stripe_payment_status.status === 'succeeded') {
        var reviews = get_reviews(data);
        Order.app.models.Review.create(reviews, function (err, models) {
          setImmediate(next, err);
          return
        });
      }
    };
  };

  var stripe_checkout = function (data) {
    return function (next) {
      var charge = stripe.charges.create({
          amount: 1 * 100,//data.amount * 100
          currency: "eur",
          source: data.stripe_token,
          description: "my first faker payment"
        },
        function (err, charge) {
          if (err && err.type === 'StripeCardError') {
            data.stripe_payment_status = 'card_declined';
            setImmediate(next, err);
            return;
          }
          data.stripe_payment_status = charge;
          setImmediate(next, null);
        }
      );
    };
  };

  Order.checkout_braintree = function (payment_method_nonce, input_data, callback) {
    var data = {};
    data.payment_system = 'braintree';
    data.cart = JSON.parse(input_data.cart);
    data.payment_method_nonce = payment_method_nonce;
    data.coupon = input_data.coupon;
    data.customer_token = input_data.customer_token;
    data.data_client_response = {};

    if (check_pre_condition(data)) {
      data.data_client_response.error = 'invalid input'
      callback(null, {err: data.data_client_response.error});
      return;
    }
    async.waterfall([
      get_access_token_customer(data),
      get_customer(data),
      prepare_order(data),
      braintree_checkout(data),
      Order.prepare_order_review_braintree(data),
      Order.try_close_order_braintree(data),
      Order.save_payment_braintree(data),
      // create_invoice(data),
      create_fail_task_braintree(data),
      prepare_response_braintree(data)
    ],

    function (err) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, {
        err: data.data_client_response.error,
        order: data.data_client_response.order,
        success: data.data_client_response.success
      });
    });
  };

  Order.checkout_stripe = function (input_data, token, callback) {
    var data = {};
    data.payment_system = 'stripe';
    data.cart = JSON.parse(input_data.cart);
    data.coupon = input_data.coupon;
    data.customer_token = input_data.customer_token;
    data.stripe_token = token;
    data.data_client_response = {};

    async.waterfall([
      get_access_token_customer(data),
      get_customer(data),
      prepare_order(data),
      stripe_checkout(data),
      Order.prepare_order_review(data),
      Order.try_close_order(data),
      Order.save_payment(data),
      // create_invoice(data),
      create_fail_task(data)
      // prepare_response(data)
    ],

    function (err) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, {});
    });

  };

  Order.remoteMethod('get_client_token', {
    accepts: { arg: 'customer_id', type: 'string', required: true },
    returns: { arg: 'token', type: 'object' },
    http: { verb: 'post', path:'/client_token' }
  });

  Order.remoteMethod('checkout_braintree', {
    accepts: [
      { arg: 'payment_method_nonce', type: 'string' },
      { arg: 'data', type: 'object' }
    ],
    returns: { arg: 'result', type: 'object' },
    http: { verb: 'post', path:'/checkout' }
  });

  Order.remoteMethod('checkout_stripe', {
    accepts: [
      { arg: 'data', type: 'object' },
      { arg: 'token', type: 'string' }
    ],
    returns: { arg: 'result', type: 'object' },
    http: { verb: 'post', path:'/stripe' }
  });
};