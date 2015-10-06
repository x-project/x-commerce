var request = require('superagent');
var faker = require('faker');
var async = require('async');
var casual = require('casual');// random tags array
var fs = require('fs');
var retry = require('retry');

var vendors = [];
var product_types = [];
var products = [];
var collections = [];
var orders = [];
var customers = [];
var store = [];
var images = [];
var images_name = [];
var images_filenames = [];

function random_boolean () {
  return Math.random() > 0.5;
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

function get_images_files_name (path, callback) {
  fs.readdir(path, function (err, files) {
    if (err) {
      images_name = [];
      callback(err, null);
      return;
    }
    images_name = files;
    callback(null, files);
  });
}

function data_faker (callback) {
  async.waterfall([
    function (next) {
      create_vendors(10, vendors, next);
    },
    function (next) {
      create_product_types(5, product_types, next);
    },
    function (next) {
      create_collections(5, collections, next);
    },
    function (next) {
      create_products(10, products, next)
    },
    function (next) {
      create_stores(1, store, next);
    },
    function (next) {
      create_customers(10, customers, next);
    },
    function (next) {
      create_orders(10, orders, next);
    },
    function  (next) {
      get_images_files_name(__dirname + '/imageTest', function (err, files) {
        images_name = files;
        next();
      });
    },
    function (next) {
      create_images(images, 'products', next);
    },
    function (next) {
      upload_images(next);
    }
  ], callback);
}



// get images

// foreach

//  retry(

//     POST signedURL
//     UPLOAD

//  )

var upload = function (type) {
  return function (data, callback) {
    request.post('http://localhost:3000' + data.signed_url)
    .attach('file', __dirname + '/imageTest/' + data_upload.filename)
    .end(function(err, res) {
      setImmediate(callback, err);
   });
  };
};

var signedURL = function (type, item, image) {
  return function (callback) {
    var url = '/api/' + type + '/' + item.id + '/images';
    request
      .post('http://localhost:3000' + url)
      .send({
        filename: image,
        filetype: "image/jpeg",
        container: type + '/' + item.id + '/images'
      })
      .type('json')
      .set('X-API-Key', 'foobar')
      .set('Accept', 'application/json')
      .end(function (err, res) {
        setImmediate(callback, err, res.body);
      });
  };
};

var store_image = function (item, done) {
    var operation = retry.operation();
    operation.attempt(function (current) {
      async.waterfall([
        signedURL(type, item, images_filenames(getRandomInt(0, images.length))),
        upload(type)
      ], function  (err) {
        if (operation.retry(err)) {
          return;
        }
        setImmediate(done, err ? operation.mainError() : null);
      });
    });
};

var each = function (type) {
  return function (next) {
    async.eachSeries(collections[type], store_image, next);
  };
};

var get_images_files_name = function (next) {
  fs.readdir(path, function (err, files) {
    if (err) {
      images_filenames = [];
      callback(err, null);
      return;
    }
    images_filenames = files;
    callback(null, files);
  });
  setImmediate(next, err);
};

var store_images = function (next) {
  async.waterfall([
    get_images_files_name,
    each('product'),
    each('collection')
  ], next);
};



// function upload_images (callback) {
//   async.eachSeries(images,
//     function (data_upload, done) {
//       upload_image(data_upload, function (err, model) {
//         if (err) {
//           done(err);
//           return;
//         }
//         done(null);
//       });
//     },
//     function (err) {
//       if (err) {
//         callback();
//         return;
//       }
//       setImmediate(callback);
//     }
//   );
// }

// function upload_image (data_upload, callback) {
//   request.post('http://localhost:3000' + data_upload.signed_url)
//     .attach('file', __dirname + '/imageTest/' + data_upload.filename)
//     .end(function(err, res) {
//       if (err) {
//         callback(err, null);
//         return;
//       }
//       var model = res.body;
//       callback(null, model);
//    });
// }

// function create_images (models, collection, callback) {
//   async.each(products,
//     function (product, done) {
//       create_image(collection, product.id, function (err, model) {
//         if (err) {
//           done(err);
//           return;
//         }
//         models.push(model);
//         done(null);
//       });
//     },
//     function (err) {
//       if (err) {
//         callback();
//         return;
//       }
//       callback();
//     }
//   );
// }

// function create_image (collection, model_id, callback) {
//   var url = '/api/' + collection + '/' + model_id + '/images';
//   request
//     .post('http://localhost:3000' + url)
//     .send({
//       filename: images_name[0, getRandomInt(0, images_name.length)],
//       filetype: "image/jpeg",
//       container: collection + '/' + model_id + '/images'
//     })
//     .type('json')
//     .set('X-API-Key', 'foobar')
//     .set('Accept', 'application/json')
//     .end(function (err, res) {
//       if (err) {
//         callback(err);
//         return;
//       }
//       var model = res.body;
//       callback(null, model);
//     });
// }

/*====================================================*/

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
    }
  );
}

/*====================================================*/

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

/*====================================================*/

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
      description: faker.commerce.productName(),
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

/*====================================================*/

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

/*====================================================*/

function create_stores (n, models, callback) {
  var count = 0;
  async.whilst(
    function () {
      return count < n;
    },
    function (done) {
      count++;
      create_store(function (err, model) {
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

function create_store (callback) {
  request
    .post('http://localhost:3000/api/stores')
    .send({
      description: casual.text,
      phone: casual.phone,
      email: casual.email,
      policy: casual.text
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

/*====================================================*/

function create_customers (n, models, callback) {
  var count = 0;
  async.whilst(
    function () {
      return count < n;
    },
    function (done) {
      count++;
      create_customer(function (err, model) {
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
      location_number: casual.integer(1, 10000),
      address_details: casual.address,
      phone: casual.phone,
      notes: casual.short_description,
      tags: casual.array_of_words(10)
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

/*====================================================*/

function create_orders (n, models, callback) {
  var count = 0;
  async.whilst(
    function () {
      return count < n;
    },
    function (done) {
      count++;
      create_order(function (err, model) {
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

function create_order (callback) {
  request
    .post('http://localhost:3000/api/orders')
    .send({
      discount: casual.integer(0, 50),
      shipping_cost: casual.integer(0, 10),
      taxes: casual.integer(0, 10),
      total: casual.integer(100, 1000),
      notes: casual.address,
      feedback: random_boolean(),
      customer_id: customers[getRandomInt(0, customers.length)].id
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


/*====================================================*/
/*====================================================*/
/*====================================================*/
/*====================================================*/
data_faker(function (err) {
  if (err) {
    console.log(err);
    return;
  }
  console.log('finish');
});