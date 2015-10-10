var request = require('superagent');
var faker = require('faker');
var fs = require('fs');

module.exports = function (server) {

var START = true;

var models = {};

server.models().forEach(function (model) {
  var model_name = model.definition.name;
  models[model_name] = model;
});

faker.model = {};

faker.model.Collection = function () {
  return {
    title: faker.name.firstName(),
    description: faker.lorem.sentence(),
    is_published: faker.random.boolean(),
    published_at: faker.date.past()
  };
};

faker.model.Customer = function () {
  return {
    password: '123',
    first_name: faker.name.firstName(),
    last_name: faker.name.lastName(),
    email: faker.internet.email(),
    marketing: faker.random.boolean(),
    taxes_exempt: faker.random.boolean(),
    location: faker.address.streetAddress(),
    location_number: faker.random.number(1000),
    address_details: faker.lorem.sentence(),
    phone: faker.phone.phoneNumber(),
    notes: faker.lorem.paragraph(),
    tags: faker.lorem.words()
  };
};

faker.model.Order = function () {
  return {
    discount: faker.random.number(50),
    shipping_cost: faker.random.number(10),
    taxes: faker.random.number(10),
    total: faker.random.number(1000),
    notes: faker.lorem.paragraph(),
    feedback: faker.random.boolean()
  };
};

faker.model.Product = function () {
  return {
    title: faker.commerce.product(),
    description: faker.commerce.productName(),
    price: faker.random.number(10000),
    compare_at_price: faker.random.number(100000),
    is_charge_taxes: faker.random.boolean(),
    sku: faker.random.number(),
    barcode: faker.random.number(),
    track_quantity: faker.random.boolean(),
    quantity: faker.random.number(10000),
    sell_after_purchase: faker.random.boolean(),
    unit_measure_weight: 'kg',
    weight: faker.random.number(10),
    require_shipping: faker.random.boolean(),
    is_published: faker.random.boolean(),
    published_at: faker.date.past(),
    tags: faker.lorem.words(),
    vendor_id: faker.random.model('Vendor').id,
    product_type_id: faker.random.model('ProductType').id
  };
};

faker.model.ProductType = function () {
  return {
    name: faker.commerce.department(),
    description: faker.commerce.productName()
  };
};

faker.model.Store = function () {
  return {
    name: faker.commerce.department(),
    description: faker.commerce.productName()
  };
};

faker.model.Vendor = function () {
  return {
    name: faker.name.firstName() + ' ' + faker.name.lastName(),
    description: faker.name.jobDescriptor()
  };
};

faker.random.model = function (model_name) {
  var models = faker.random[model_name];
  if (!models.length) {
    return {};
  }
  var index = faker.random.number(models.length - 1);
  var model = models[index];
  return model;
};

var save_image = function (model, image) {
  var defer = Promise.defer();

  var data = {
    filename: image,
    filetype: "image/jpeg",
    container: name + '/' + item.id + '/images'
  };

  model.signed_url(data, function (err, res) {
    if (err) {
      defer.reject(err);
      return;
    }

    defer.resolve(res);
  });

  return defer.promise;
};

var upload_image = function (data) {
  var defer = Promise.defer();

  request
    .post('http://localhost:3000' + data.signed_url)
    .attach('file', __dirname + '/images/' + data.filename, data.filename)
    .end(function (err, res) {
      if (err) {
        defer.reject(err);
        return;
      }
      defer.resolve(res);
    });

  return defer.promise;
};

var add_image = function (model) {
  var defer = Promise.defer();
  var image = random_model_from(images);

  save_image(model, image)
    .then(upload_image)
    .then(defer.resolve)
    .catch(defer.reject)

  return defer.promise;
};

var fake = function (model_name) {
  var defer = Promise.defer();
  var data = faker.model[model_name]();

  faker.random[model_name] = faker.random[model_name] || [];

  var res = models[model_name].create(data, function (err, model) {
    if (err) {
      defer.reject(err);
      return;
    }
    faker.random[model_name].push(model);
    defer.resolve(model);
  });

  return defer.promise;
};

var fake_all = function (n, model_name) {
  var defer = Promise.defer();
  var i = 0;

  var iterator = function () {
    if (++i < n) {
      fake(model_name).then(iterator).catch(defer.reject);
    } else {
      defer.resolve();
    }
  };

  iterator();

  return defer.promise;
};

var init = function () {
  var defer = Promise.defer();

  defer.resolve();

  return defer.promise;
};

var clear_all = function (model_name) {
  var defer = Promise.defer();

  models[model_name].destroyAll(function (err, info) {
    if (err) {
      defer.reject(err);
      return;
    }
    defer.resolve(info);
  });

  return defer.promise;
};

function start () {
  init()
    .then(clear_all('Store'))
    .then(clear_all('ProductType'))
    .then(clear_all('Customer'))
    .then(clear_all('Vendor'))
    .then(clear_all('Collection'))
    .then(clear_all('Product'))
    .then(clear_all('Order'))
    .then(fake_all(1, 'Store'))
    .then(fake_all(10, 'ProductType'))
    .then(fake_all(10, 'Customer'))
    .then(fake_all(10, 'Vendor'))
    .then(fake_all(10, 'Collection'))
    .then(fake_all(10, 'Product'))
    .then(fake_all(10, 'Order'))
    .then(function () {
      console.log('yeah!');
    })
    .catch(function () {
      console.log('oops!')
    });
}

if (START) {
  start();
}

};