var request = require('superagent');
var faker = require('faker');
var async = require('async');
var casual = require('casual');// random tags array

var vendors = [];
var product_types = [];
var products = [];
var collections = [];
var orders = [];
var customers = [];

function random_boolean () {
  return Math.random()>0.5;
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

// // generate random customers
// create_customers(100, function (err) {
//   if (err) {
//     console.log(err);
//     return;
//   }
// });


// generate random orders
// create_orders(100, function (err) {
//   if (err) {
//     console.log(err);
//     return;
//   }
// });

function data_faker (callback) {
  async.waterfall([
    function (next) {
      create_vendors(20, vendors, next);
    },
    function (next) {
      create_product_types(20, product_types, next);
    },
    function (next) {
      create_collections(20, collections, next);
    },
    function (next) {
      create_products(20, products, next)
    }
  ], callback);
}

function create_product_types (n, models, callback) {
  var count = 0;
  async.whilst(
    function () {
      return count < n;
    },
    function (done) {
      count++;
      create_product_type(function (err, model) {
        if (err) {
          done(err)
          return;
        }
        models.push(model);
        done(null);
      });
    },
    callback
  );
}


function create_product_type (callback) {
  request
    .post('http://localhost:3000/api/product_types')
    .send({
      name: faker.commerce.department(),
      description: faker.commerce.productName()
    })
    .type('json')
    .set('X-API-Key', 'foobar')
    .set('Accept', 'application/json')
    .end(function (err, res) {
      if (err) {
        callback(err);
        return;
      }
      var model = res.body;
      callback(null, model);
    });
}


function create_vendors (n, models, callback) {
  var count = 0;
  async.whilst(
    function () {
      return count < n;
    },
    function (done) {
      count++;
      create_vendor(function (err, model) {
        if (err) {
          done(err)
          return;
        }
        models.push(model);
        done(null);
      });
    },
    callback
  );
}

function create_vendor (callback) {
  request
    .post('http://localhost:3000/api/vendors')
    .send({
      name: casual.username,
      description: faker.name.jobDescriptor()
    })
    .type('json')
    .set('X-API-Key', 'foobar')
    .set('Accept', 'application/json')
    .end(function (err, res) {
      if (err) {
        callback(err);
        return;
      }
      var model = res.body;
      callback(null, model);
    });
}

function create_products (n, models, callback) {
  var count = 0;
  async.whilst(
    function () {
      return count < n;
    },
    function (done) {
      count++;
      create_product(function (err, model) {
        if (err) {
          done(err);
          return;
        }
        models.push(model);
        done(null);
      });
    },
    callback
  );
}

function create_product (callback) {
  request
    .post('http://localhost:3000/api/products')
    .send({
      title: faker.commerce.product(),
      description: faker.commerce.productName(),
      price: casual.integer(from = 0, to = 10000),
      compare_at_price: casual.integer(from = 0, to = 100000),
      is_charge_taxes: random_boolean(),
      sku: casual.rgb_hex,
      barcode: casual.word,
      track_quantity: random_boolean(),
      quantity: casual.integer(from = 0, to = 10000),
      sell_after_purchase: random_boolean(),
      unit_measure_weight: 'kg',
      weight: casual.integer(from = 0, to = 10),
      require_shipping: random_boolean(),
      is_published: random_boolean(),
      published_at: casual.unix_time,
      tags: casual.array_of_words(10),
      vendor_id: vendors[getRandomInt(0, vendors.length)].id,
      product_type_id: product_types[getRandomInt(0, product_types.length)].id
    })
    .type('json')
    .set('X-API-Key', 'foobar')
    .set('Accept', 'application/json')
    .end(function (err, res) {
      if (err) {
        callback(err);
        return;
      }
      var model = res.body;
      callback(null, model);
    });
}

function create_collections (n, models, callback) {
  var count = 0;
  async.whilst(
    function () {
      return count < n;
    },
    function (done) {
      count++;
      create_collection(function (err, model) {
        if (err) {
          done(err);
          return;
        }
        models.push(model);
        done(null);
      });
    },
    callback
  );
}

function create_collection (callback) {
  request
    .post('http://localhost:3000/api/collections')
    .send({
      title: casual.first_name,
      description: casual.last_name,
      is_published: random_boolean(),
      published_at: casual.unix_time
    })
    .type('json')
    .set('X-API-Key', 'foobar')
    .set('Accept', 'application/json')
    .end(function (err, res) {
      if (err) {
        callback(err);
        return;
      }
      var model = res.body;
      callback(null, model);
    });
}

function create_orders (n, callback) {
  var count = 0;
  async.whilst(
    function () {
      return count < n;
    },
    function (done) {
      count++;
      create_order(done);
    },
    callback
  );
}

function create_order (callback) {
  request
    .post('http://localhost:3000/api/orders')
    .send({
      discount: casual.integer(from = 0, to = 50),
      shipping_cost: casual.integer(from = 0, to = 10),
      taxes: casual.integer(from = 0, to = 10),
      total: casual.integer(from = 100, to = 1000),
      notes: casual.address,
      feedback: random_boolean()
    })
    .type('json')
    .set('X-API-Key', 'foobar')
    .set('Accept', 'application/json')
    .end(callback);
}

function create_customers (n, callback) {
  var count = 0;
  async.whilst(
    function () {
      return count < n;
    },
    function (done) {
      count++;
      create_customer(done);
    },
    callback
  );
}

function create_customer (callback) {
  request
    .post('http://localhost:3000/api/customers')
    .send({
      first_name: casual.first_name,
      last_name: casual.last_name,
      email: casual.email,
      marketing: random_boolean(),
      taxes_exempt: random_boolean(),
      location: casual.address1,
      location_number: casual.integer(from = 1, to = 10000),
      address_details: casual.address,
      phone: casual.phone,
      notes: casual.short_description,
      tags: casual.array_of_words(10)
    })
    .type('json')
    .set('X-API-Key', 'foobar')
    .set('Accept', 'application/json')
    .end(callback);
}

data_faker(function (err) {
  if (err) {
    console.log(err);
    return;
  }
  console.log('yeah');
});