var async = require('async');

module.exports = function (ProductVariant) {

  ProductVariant.generate = function (callback) {
    var product_option = ProductVariant.app.models.ProductOption.find({}, function (err, options) {

      if (err) {
        callback(err, null);
        return;
      }

      var values = [];
      options.forEach(function (option) {
        values.push(option.values);
      });

      var combos = cartesian(values);

      var models = combos.map(function (combo) {
        return {
          name: combo.join('-'),
          combo: combo,
          available: true
        };
      });

      ProductVariant.create(models, function (err, models) {
        if (err) {
          callback(err, null);
          return;
        }
        callback(null, models);
      });

      // async.forEach(combos, function (combo, next) {
      //   ProductVariant.create({
      //     name: combo.join('-'),
      //     values: combo
      //   }, function (err, model) {
      //     if (err) {
      //       next(err);
      //       return;
      //     }
      //     models.push(model)
      //     next();
      //   }, function (err) {
      //     if (err) {
      //       callback(err, null);
      //       return;
      //     }
      //     callback(null, models);
      //   });
      // });
    });
  };

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

  ProductVariant.remoteMethod('generate', {
    accepts: [],
    returns: { arg: 'variants', type: 'Array' },
    http: { verb: 'get', path:'/generate' }
  });
};