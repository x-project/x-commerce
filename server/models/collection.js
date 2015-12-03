var async = require('async');
var rmdir = require('rimraf');

module.exports = function (Collection) {

  /* ********************************************************* */
  /*
    * data validation
  */
  Collection.validate('published_at', validate_published_at_future, { message: 'invalid past date' });
  function validate_published_at_future (err) {
    var collection = this;
    if (!collection.published_at) {
      return;
    }
    var published_at = new Date(collection.published_at);
    var date_now = Date.now();
    var diff =  published_at - date_now;
    if (diff < 0) {
      err();
    }
  }
  /* ********************************************************* */


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
    var collection = ctx.instance;

    if (!collection) {
      callback(null);
      return;
    }

    async.waterfall([
      function (next) {
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
        callback(err);
        return;
      }
      callback(null);
    });
  });

};