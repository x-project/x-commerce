var async = require('async');

module.exports = function (Manager) {

  var get_invite_by_email = function (data) {
    return function (next) {
      var filter = {where: { email: data.email }};
      Manager.app.models.Invite.findOne(filter, function (err, model) {
        data.invite = model;
        setImmediate(next, err);
      });
    };
  }


  var create_manager_token = function (data) {
    return function (next) {
      data.manager.createAccessToken(Manager.settings.ttl, function (err, token) {
        if (err) {
          callback(err, null);
          return;
        }
        var _token = JSON.parse(JSON.stringify(token));
        var _manager = JSON.parse(JSON.stringify(data.manager));
        delete _manager.password;
        _manager.id = _token.userId;
        _token.user = _manager;
        data.manager_credentionals = _token
        setImmediate(next, err);
      });
    };
  };

  var update_status_invite = function (data) {
    return function (next) {
      if (data.token !== data.invite.token) {
        next(new Error('unauthorization invite'), null);
        return;
      }
      data.invite.status = 'accepted';
      Manager.app.models.Invite.upsert(data.invite, function (err, model) {
        data.invite = model;
        setImmediate(next, err);
      });
    };
  };

  var create_manager = function (data) {
    return function (next) {
      var manager = {
        role: data.invite.role,
        fullname: data.invite.full_name,
        password: data.invite.password,
        email: data.invite.email,
        isMainAdmin: false
      };
      Manager.create(manager, function (err, model) {
        data.manager = model;
        setImmediate(next, err);
      });
    };
  };


  Manager.confirm_invite = function (credentials, callback) {
    var data = {};
    data.email = credentials.email;
    data.password = credentials.password;
    data.token = credentials.token;

    async.waterfall([
      get_invite_by_email(data),
      update_status_invite(data),
      create_manager(data),
      create_manager_token(data)
    ],
    function (err) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, data.manager_credentionals);
    });
  };



  Manager.remoteMethod('confirm_invite', {
    accepts: [
      { arg: 'credentials', type: 'object', required: true },
    ],
    returns: { arg: 'result', type: 'object' },
    http: { path: '/confirm_invite', verb: 'post' }
  });


};
