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

faker.model.Article = function () {
  return {
    title: faker.lorem.sentence(),
    subtitle: faker.lorem.sentence(),
    summary: faker.lorem.paragraph(),
    content: faker.lorem.paragraphs(),
    created_at: faker.date.past(),
    updated_at: faker.date.past(),
    published_at: faker.date.past(),
    tags: faker.lorem.words(),
    category_id: faker.random.model('Category')
  };
};

faker.model.Category = function () {
  return {
    name: faker.commerce.department(),
    description: faker.lorem.paragraph()
  };
};

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

var upto = function (n, iterator) {
  var defer = Promise.defer();
  var promise = defer.promise;

  var completed = 0;

  var complete = function () {
    completed += 1;
    if (completed >= n) {
      defer.resolve();
      return;
    }
    iterate();
  };

  var iterate = function () {
    iterator(completed)
      .then(complete)
      .catch(defer.reject);
  };

  if (n === 0) {
    defer.resolve();
    return promise;
  }

  iterate();

  return promise;
};

var init = function () {
  var defer = Promise.defer();

  defer.resolve();

  return defer.promise;
};

var destroy = function (model_name) {
  return function () {
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
};

var fake = function (model_name, n) {

  var iterator = function (i) {
    // console.log('fake', model_name, i);

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

  return function () {
    return upto(n, iterator);
  }
};

function start () {
  init()
    .then(destroy('Category'))
    .then(destroy('Article'))
    .then(destroy('Store'))
    .then(destroy('ProductType'))
    .then(destroy('Customer'))
    .then(destroy('Vendor'))
    .then(destroy('Collection'))
    .then(destroy('Product'))
    .then(destroy('Order'))
    .then(fake('Store', 1))
    .then(fake('Category', 4))
    .then(fake('Article', 16))
    .then(fake('ProductType', 4))
    .then(fake('Customer', 16))
    .then(fake('Vendor', 4))
    .then(fake('Collection', 4))
    .then(fake('Product', 16))
    .then(fake('Order', 4))
    .then(function () {
      console.log('yeah!');
    })
    .catch(function (err) {
      console.log('oops!');
      console.warn(err);
    });
}

if (START) {
  start();
}

};