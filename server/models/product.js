var async = require('async');

module.exports = function (Product) {

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
    var current_product;

    async.waterfall([
      function (next) {
        Product.findById(product_id, next);
      },

      function (product, next) {
        current_product = product;
        product.variants.destroyAll(next);
      },

      function (variants, next) {
        current_product.options(next);
      },

      function (options, next) {
        var options = options.map(function (option) {
          return option.values;
        });
        var combos = cartesian(options);
        var variants = combos.map(function (values) {
          return {
            name: values.join('-'),
            combo: values,
            available: true,
            price: current_product.price,
            compare_at_price: current_product.compare_at_price,
            track_quantity: current_product.track_quantity,
            quantity: current_product.quantity,
            sell_after_purchase: current_product.sell_after_purchase,
            weight: current_product.weight,
            require_shipping: current_product.require_shipping
          };
        });
        current_product.variants.create(variants, next);
      }
    ],

    function (err, variants) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, variants);
    });
  };

  Product.remoteMethod('generate_variants', {
    accepts: { arg: 'product_id', type: 'string', required: true },
    returns: { arg: 'variants', type: 'Array' },
    http: { verb: 'get', path:'/generate' }
  });
};

