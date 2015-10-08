var async = require('async');

module.exports = function (Collection) {

  var remove_products = function (collection, products, callback) {
    async.each(products,
      function(product, done) {
        collection.products.remove(product, done);
      },callback);
  };

  Collection.observe('before delete', function(ctx, callback) {
    var collection;

    async.waterfall([
      function (next) {
        Collection.findById(ctx.where.id, function(err, model) {
          collection = model;
          next();
        });
      },
      function (next) {
        //todo delete images in /storage in image.js
        collection.images.destroyAll(next);
      },
      function (result, next) {
        collection.products(next);
      },
      function (result, next) {
        remove_products(collection, result, next);
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