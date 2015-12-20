var async = require('async');

module.exports = function (Service) {

  var verify_admin = function (data) {
    return function (next) {
      var admin_email = data.admin_email;
      var admin_password = data.admin_password + '';
      Service.app.models.Manager.findOne({where: {email: admin_email}}, function (err, manager) {
        manager.hasPassword(admin_password)
          .then(function (result) {
            data.authenticate = result;
            setImmediate(next, err);
          })
          .catch(function (err) {
            next(err, null);
          });
      });
    };
  };

  var find_or_create_service = function (data) {
    return function (next) {
      if (!data.authenticate) {
        next(new Error('you don\'t have permission for request this actions'), null);
        return;
      }
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
      if (!data.authenticate) {
        next(new Error('you don\'t have permission for request this actions'), null);
        return;
      }
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
      verify_admin(data),
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