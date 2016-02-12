var async = require('async');
module.exports = function (Review) {


  var get_product_by_id = function (data) {
    return function (next) {
      Review.app.models.Product.findById(data.review.product_id, function (err, product) {
        data.product = product;
        setImmediate(next, err);
      });
    };
  };

  var update_product_rating = function (data) {
    return function (next) {
      var product = {};
      product = data.product;
      product.score_reviews = data.product.score_reviews + data.review.rating;
      product.total_reviews = data.product.total_reviews + 1;
      product.total_score = product.score_reviews / product.total_reviews;
      Review.app.models.Product.upsert(product, function (err, product) {
        data.product = product;
        setImmediate(next, err);
      });
    };
  };

  Review.observe('after save', function (ctx, done) {
    var review = ctx.instance;
    var data = {};
    data.review = review;
    if (!review.closed && review.rating <= 1) {
      done(null, null);
      return;
    }
    async.waterfall([
      get_product_by_id(data),
      update_product_rating(data)
    ],
    function (err) {
      setImmediate(done, err);
    });
  });
};