var async = require('async');

module.exports = function (Service) {

  var verify_password = function (data) {
    return function (next) {
      // TODO password check
      data.autenticate = true;
      next();
    };
  };

  var find_or_create_service = function (data) {
    return function (next) {
      var service_data = {};
      service_data.name = data.name;
      service_data.public_key = data.public_key;
      service_data.private_key = data.private_key;
      service_data.params = data.params;

      Service.findOrCreate({where: {name: data.name}}, service_data, function (err, model) {
        data.service_model = model;
        setImmediate(next, err);
      });
    };
  };

  var update_service_key = function (data) {
    return function (next) {
      var service_data = {};
      data.name = data.name;
      data.service_model.public_key = data.public_key;
      data.service_model.private_key = data.private_key;
      data.service_model.params = data.params;
      Service.upsert(data.service_model, function (err, model) {
        data.service_model_updated = model;
        setImmediate(next, err);
      });
    };
  };

  Service.update_service = function (data, callback) {
      async.waterfall([
      verify_password(data),
      find_or_create_service(data),
      update_service_key(data)
    ],

    function (err) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, data.service_model_updated);
    });
  };




  Service.remoteMethod('update_service', {
    accepts: [
      { arg: 'data', type: 'object' }
    ],
    returns: { arg: 'result', type: 'object' },
    http: { verb: 'post', path:'/update_service' }
  });

};