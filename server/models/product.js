var async = require('async');
var path = require('path');
var rmdir = require('rimraf');
var moment = require('moment');

module.exports = function (Product) {
  /* ********************************************************* */
  /*
    * data validation
  */
  Product.validate('published_at', validate_published_at_future, { message: 'invalid past date' });

  function validate_published_at_future (err) {
    var product = this;
    if (!product.published_at) {
      return;
    }
    var published_at = new Date(product.published_at);
    var date_now = Date.now();
    var diff =  published_at - date_now;
    if (diff < 0) {
      err();
    }
  }
  /* ********************************************************* */

  var get_product = function (data) {
    return function (next) {
      Product.findById(data.product_id, function (err, model) {
        data.product = model;
        setImmediate(next, err);
      });
    };
  };

  var destroy_options = function (data) {
    return function (next) {
      data.product.options.destroyAll(function (err, info, num) {
        setImmediate(next, err);
      });
    };
  };

  var destroy_variants = function (data) {
    return function (next) {
      data.product.variants.destroyAll(function (err, info, num) {
        setImmediate(next, err);
      });
    };
  };

  var destroy_images = function (data) {
    return function (next) {
      data.product.images.destroyAll(function (err, info, num) {
        setImmediate(next, err);
      });
    };
  };

  var delete_product_thumbs_folder = function (data) {
    return function (next) {
      var folder_path = path.join(__dirname, '..', 'public', 'storage' ,'products', '' + data.product_id);
      rmdir(folder_path, function (err) {
        setImmediate(next, err);
      });
    };
  };

  var get_collections = function (data) {
    return function (next) {
      data.product.collections(function (err, collections) {
        data.collections = collections;
        setImmediate(next, err);
      });
    };
  };

  var remove_collections = function (data) {
    return function (next) {
      async.each(data.collections,
        function(collection, done) {
          data.product.collections.remove(collection, done);
        }, next);
    };
  };

  Product.observe('before delete', function(ctx, callback) {
    var product_id = ctx.where.id;
    var data = {};
    data.product_id = product_id;
    async.waterfall([
      get_product(data),
      destroy_options(data),
      destroy_variants(data),
      destroy_images(data),
      delete_product_thumbs_folder(data),
      get_collections(data),
      remove_collections(data)
    ],
    function (err) {
      if (err) {
        callback(err);
        return;
      }
      callback(null);
    });
  });

  var cartesian = function (args) {
    return args.reduce(function (values_a, values_b) {
      var values_a_b = [];
      values_a.forEach(function (value_a) {
        values_b.forEach(function (value_b) {
          values_a_b.push(value_a.concat([value_b]));
        });
      });
      return values_a_b;
    }, [[]]);
  };


  Product.generate_variants = function (product_id, callback) {
    var product;

    async.waterfall([
      function (next) {
        Product.findById(product_id, next);
      },

      function (result, next) {
        product = result;
        product.variants.destroyAll(next);
      },

      function (result, next) {
        product.options(next);
      },

      function (result, next) {
        var options = result.map(function (option) {
          return option.values;
        });
        var combos = cartesian(options);
        var variants = combos.map(function (values) {
          return {
            name: values.join('-'),
            combo: values,
            available: true,
            price: product.price || '',
            compare_at_price: product.compare_at_price || '',
            track_quantity: product.track_quantity || '',
            quantity: product.quantity || '',
            sell_after_purchase: product.sell_after_purchase || '',
            weight: product.weight || '',
            require_shipping: product.require_shipping || ''
          };
        },this);
        product.variants.create(variants, next);
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

  Product.remoteMethod('generate_variants', {
    accepts: { arg: 'product_id', type: 'string', required: true },
    returns: { arg: 'variants', type: 'Array' },
    http: { verb: 'get', path:'/generate' }
  });
};

