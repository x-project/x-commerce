var request = require('superagent');
var async = require('async');
var faker = require('faker');
var casual = require('casual');
var fs = require('fs');
var retry = require('retry');
// var loopback = require('loopback');

var collections = {};

collections['vendors'] = [];
collections['product_types'] = [];
collections['products'] = [];
collections['collections'] = [];
collections['orders'] = [];
collections['customers'] = [];
collections['stores'] = [];

var images = [];

var fakers = {};

function random_boolean () {
  return Math.random() > 0.5;
}

fakers['stores'] = function () {
  return {
    name: faker.commerce.department(),
    description: faker.commerce.productName()
  };
};

fakers['product_types'] = function () {
  return {
    name: faker.commerce.department(),
    description: faker.commerce.productName()
  };
};

fakers['vendors'] = function () {
  return {
    name: faker.name.firstName() + ' ' + faker.name.lastName(),
    description: faker.name.jobDescriptor()
  };
};

fakers['products'] = function () {
  return {
    title: faker.commerce.product(),
    description: faker.commerce.productName(),
    price: casual.integer(0, 10000),
    compare_at_price: casual.integer(0, 100000),
    is_charge_taxes: random_boolean(),
    sku: casual.rgb_hex,
    barcode: casual.word,
    track_quantity: random_boolean(),
    quantity: casual.integer(0, 10000),
    sell_after_purchase: random_boolean(),
    unit_measure_weight: 'kg',
    weight: casual.integer(0, 10),
    require_shipping: random_boolean(),
    is_published: random_boolean(),
    published_at: casual.unix_time,
    tags: casual.array_of_words(10),
    vendor_id: random_id_from('vendors'),
    product_type_id: random_id_from('product_types')
  };
};

fakers['collections'] = function () {
  return {
    title: faker.name.firstName(),
    description: casual.last_name,
    is_published: random_boolean(),
    published_at: casual.unix_time
  };
};

fakers['orders'] = function () {
  return {
    discount: casual.integer(0, 50),
    shipping_cost: casual.integer(0, 10),
    taxes: casual.integer(0, 10),
    total: casual.integer(100, 1000),
    notes: casual.address,
    feedback: random_boolean()
  };
};

fakers['customers'] = function () {
  return {
    password: '123',
    first_name: casual.first_name,
    last_name: casual.last_name,
    email: casual.email,
    marketing: random_boolean(),
    taxes_exempt: random_boolean(),
    location: casual.address1,
    location_number: casual.integer(1, 10000),
    address_details: casual.address,
    phone: casual.phone,
    notes: casual.short_description,
    tags: casual.array_of_words(10)
  };
};

var random_model_from = function (models) {
  var index = faker.random.number({ min: 0, max: models.length - 1 });
  var model = models[index];
  return model;
};

var random_id_from = function (models) {
  var model = random_model_from(models);
  var id = model.id;
  return id;
};

var till = function (n, iterate) {
  return function (next) {
    var count = 0;

    function test () {
      return count < n;
    }

    function step (done) {
      count += 1;
      iterate(done);
    }

    async.whilst(test, step, next);
  }
};

var populate = function (name) {
  return function (next) {
    var data = fakers[name]();
    var api = 'http://localhost:3000/api/' + name;
    var collection = collections[name];
    request
      .post(api)
      .send(data)
      .type('json')
      .set('Accept', 'application/json')
      .end(function (err, res) {
        if (err) {
          next(err);
          return;
        }
        var model = res.body;
        collections[name].push(model);
        next(null);
      });
  };
};

var each = function (models, iterate) {
  return function (next) {
    async.eachSeries(models, iterate, next);
  };
};

var signed_url = function (name, item, image) {
  return function (next) {
    request
      .post('http://localhost:3000' + '/api/' + name + '/' + item.id + '/images')
      .send({
        filename: image,
        filetype: "image/jpeg",
        container: name + '/' + item.id + '/images'
      })
      .type('json')
      .set('Accept', 'application/json')
      .end(function (err, res) {
        setImmediate(next, err, res.body);
      });
  };
};

var upload_image = function (data, next) {
  request
    .post('http://localhost:3000' + data.signed_url)
    .attach('file', __dirname + '/images/' + data.filename, data.filename)
    .end(next);
};

var populate_image = function (name) {
  return function (item, next) {
    var image = random_model_from(images);
    async.waterfall([
      signed_url(name, item, image),
      upload_image
    ], next);
  };
};

var load_images = function (path) {
  return function (next) {
    fs.readdir(path, function (err, files) {
      images = err ? [] : files;
      setImmediate(next, err);
    });
  };
}

function start () {
  async.waterfall([

    each(collections['products'], destroy('products'))

    till(1, populate('stores')),
    till(5, populate('product_types')),
    till(10, populate('customers')),
    till(10, populate('vendors')),
    till(5, populate('collections')),
    till(10, populate('products')),
    till(5, populate('orders')),
    // load_images(__dirname + '/images'),
    // each(collections['products'], populate_image('products')),
    // each(collections['collections'], populate_image('collections'))
  ], function (err) {
    if (err) {
      console.log(err);
      return;
    }
    console.log('yeah');
    process.exit(1);
  });
}

start();
