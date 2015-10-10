var async = require('async');

module.exports = function (Collection) {

  var remove_products = function (collection, products, callback) {
    var remove_product = function (product, done) {
      collection.products.remove(product, done);
    };
    async.each(products, remove_product, callback);
  };

  Collection.observe('before delete', function(ctx, callback) {
    var instance;

    async.waterfall([
      function (next) {
        Collection.findById(ctx.where.id, function(err, model) {
          if (err) {
            next(err);
            return;
          }
          instance = model;
          next();
        });
      },
      function (next) {
        //todo delete images in /storage in image.js
        instance.images.destroyAll(next);
      },
      function (result, next) {
        instance.products(next);
      },
      function (result, next) {
        remove_products(instance, result, next);
      }
    ],
    function (err) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, null);
    });
  });

};