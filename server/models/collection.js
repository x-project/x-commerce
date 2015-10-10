var async = require('async');

module.exports = function (Collection) {

  var remove_products = function (collection, products, callback) {
    async.each(products,
      function(product, done) {
        collection.products.remove(product, done);
      },callback);
  };

  var delete_collection_image_folder = function (collection, collection_id, done) {
    var folder_path = path.join(__dirname, '..', 'storage', collection, '' + collection_id);
    rmdir(folder_path, done);
  };

  Collection.observe('before delete', function(ctx, callback) {
    var collection;

    async.waterfall([
      function (next) {
        Collection.findById(ctx.where.id, next);
      },

      function (result, next) {
        collection = result;
        collection.images.destroyAll(next);
      },

      function (result, next) {
        delete_collection_image_folder('collections', collection.id, next);
      },

      function (next) {
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