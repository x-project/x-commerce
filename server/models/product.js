var async = require('async');
var path = require('path');
var rmdir = require('rimraf');
var moment = require('moment');

module.exports = function (Product) {

  Product.validate('published_at', validate_published_at_future, { message: 'invalid past date' });

  function validate_published_at_future (err) {
    var product = this;
    var published_at = new Date(product.published_at);
    var date_now = Date.now();
    var diff =  published_at - date_now;
    if (diff < 0) {
      err();
    }
  }

  var remove_collections = function (product, collections, callback) {
    async.each(collections,
      function(collection, done) {
        product.collections.remove(collection, done);
      },callback);
  };

  var delete_product_image_folder = function (collection, collection_id, done) {
    var folder_path = path.join(__dirname, '..', 'storage', collection, '' + collection_id);
    rmdir(folder_path, done);
  };

  Product.observe('before delete', function(ctx, callback) {
    var product = ctx.instance;

    if (!product) {
      callback(null);
      return;
    }

    async.waterfall([
      function (next) {
        product.options.destroyAll(next);
      },

      function (result, next) {
        product.variants.destroyAll(next);
      },

      function (result, next) {
        product.images.destroyAll(next);
      },

      function (result, next) {
        delete_product_image_folder('products', product.id , next);
      },

      function (next) {
        product.collections(next)
      },

      function (result, next) {
        remove_collections(product, result, next);
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
            price: product.price,
            compare_at_price: product.compare_at_price,
            track_quantity: product.track_quantity,
            quantity: product.quantity,
            sell_after_purchase: product.sell_after_purchase,
            weight: product.weight,
            require_shipping: product.require_shipping
          };
        });
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

