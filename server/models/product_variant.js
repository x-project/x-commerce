// var async = require('async');

// module.exports = function (ProductVariant) {

//   ProductVariant.generate = function (id, callback) {
//     var product_option = ProductVariant.app.models.ProductOption.find({}, function (err, options) {
//       console.log(options);
//       if (err) {
//         callback(err, null);
//         return;
//       }

//       var values = [];
//       options.forEach(function (option) {
//         values.push(option.values);
//       });

//       var combos = cartesian(values);

//       var models = combos.map(function (combo) {
//         return {
//           name: combo.join('-'),
//           combo: combo,
//           available: true
//         };
//       });

//       // ProductVariant.create(models, function (err, models) {
//       //   if (err) {
//       //     callback(err, null);
//       //     return;
//       //   }
//       //   callback(null, models);
//       // });

//       var result = [];

//       async.forEach(models, function (variant, next) {
//         ProductVariant.create(variant,
//         function (err, model) {
//           if (err) {
//             next(err);
//             return;
//           }

//           result.push(model);
//           next();
//         });
//       },
//         function (err) {
//           if (err) {
//             callback(err, null);
//             return;
//           }
//           callback(null, result);
//         });
//     });
//   };

//   var cartesian = function (args) {
//     return args.reduce(function (values_a, values_b) {
//       var values_a_b = [];
//       values_a.forEach(function (value_a) {
//         values_b.forEach(function (value_b) {
//           values_a_b.push(value_a.concat([value_b]));
//         });
//       });
//       return values_a_b;
//     }, [[]]);
//   };

//   ProductVariant.remoteMethod('generate', {
//     accepts: [{arg: 'id', type: 'string', required: true}],
//     returns: { arg: 'variants', type: 'Array' },
//     http: { verb: 'get', path:'/generate/product/:id' }
//   });
// };