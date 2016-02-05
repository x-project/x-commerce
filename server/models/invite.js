var loopback = require('loopback');
var jwt = require('jwt-simple');
var moment = require('moment');
var minstache = require('minstache');
var async = require('async');
var if_async = require('if-async');
var mandrill = require('mandrill-api/mandrill');


// var template_url = minstache.compile(url);
// var template_text = minstache.compile(email_text);
// var template_html = minstache.compile(email_html);

module.exports = function (Invite) {

  var getCurrentUserId = function () {
    var ctx = loopback.getCurrentContext();
    var accessToken = ctx && ctx.get('accessToken');
    var userId = accessToken && accessToken.userId;
    return userId;
  };

  var services = {};

  function get_service (name) {
    return new Promise(function (resolve, reject) {
      if (name in services) {
        resolve(services[name]);
        return;
      }
      var filter = {where: { name: name }};
      Invite.app.models.Service.findOne(filter, function (err, service) {
        if (err) {
          reject(err);
          return;
        }
        services[name] = service;
        resolve(service);
      });
    });
  }

  var prepare_mail = function (x_data, callback) {
    get_service('email')
      .then(function (serivce) {
        var base_url = 'http://localhost:3000/admin/signup';

        var url = base_url + '?invite='+ x_data.invite.token +'&email='+ x_data.invite.email;
        var email_text = "Hello there,\n\n you have been invited to take part in x-commerce as" + x_data.invite.role + ".\n\nTo accept the invitation follow this link: "+ url;
        var email_html = "<div><p>Hello there,</p><p>you have been invited to take part in x-commerce as "+ x_data.invite.role +"</p></br><p>Use this email for login: "+ x_data.invite.email + "</p></br><p>Use this password for login: "+ x_data.invite.password +"</p></br><p>To accept the invitation follow this link: <a href=\"" +url +"\">" + url +"</a><div>";

        var message = {
          "html": email_html,
          "text": email_text,
          "subject": "signed url",
          "from_email": serivce.params.email,
          "from_name": "x-commerce",
          "to": [{
            "email": x_data.invite.email,
            "name": "x-commerce",
            "type": "to"
          }],
          "headers": {
            "Reply-To": serivce.params.email
          },
          "subaccount": "123",
        };
        callback(null, message);
    }).catch(function (err) {
      callback(err, null);
    });
  };

  var send_email = function (x_data, next) {
    prepare_mail(x_data, function (err, message) {
      if (err) {
        setImmediate(next, err);
        return;
      }
      Invite.app.models.Customer.connect_mandrill_client()
        .then(function (mandrill_client) {
          mandrill_client.messages.send({"message": message},
            function (res) {
              x_data.email_result = res;
              setImmediate(next, null);
            },
            function (err) {
              setImmediate(next, err);
            });
        }).catch(function (err) {
          setImmediate(next, err);
        });
      });
  };


  var is_complete = function (invite) {
    return function (cb) {
      var complete = invite.url !== undefined &&
                     invite.exiration !== undefined &&
                     invite.token !== undefined;
      return cb(null, complete);
    };
  };

  var complete = function (x_data) {
    var invite = x_data.invite;
    return function (done) {
      get_service('passwordless_secret_keys')
      .then(function (service) {
        var expiresAt = moment().add(invite.expiresIn, 'd').toDate();
        var payload = {
          invite_id: invite.id,
          expiresAt: expiresAt,
          email: invite.email,
          role: invite.role,
          status: invite.status
        };
        var token = jwt.encode(payload, service.params.jwt_secret_key_email);
        invite.expiresAt = expiresAt;
        invite.token = token;
        invite.senderId = getCurrentUserId();
        setImmediate(done, null, x_data);
      }).catch(function () {
        setImmediate(err, null);
      });
    };
  };

  var retrieve_invite = function (x_data, next) {
    Invite.findById(x_data.id, function (err, invite) {
      x_data.invite = invite;
      setImmediate(next, err, x_data);
    });
  };

  var update_invite = function  (x_data, next) {
    x_data.invite.save(function (err, invite) {
      x_data.invite = invite;
      setImmediate(next, err, x_data);
    });
  };

  var check_invite = function (x_data, next) {
    var error = null;
    if (!x_data.invite) {
      error = {
        code: 10,
        message: 'Invalid invite id.',
      };
    }
    setImmediate(next, error, x_data);
  };

  var check_status = function (x_data, next) {
    var status = x_data.valid_status;
    var error = null;

    console.log(x_data.invite.status, status);

    if (x_data.invite.status !== status) {
      error = {
        code: 11,
        mesage: 'Invalide invite status'
      };
    }
    setImmediate(next, error, x_data);
  };

  var revoke_invite = function (x_data, next) {
    x_data.invite.updateAttribute('status', 'revoked', function (err, invite) {
      setImmediate(next, err, true);
    });
  };

  Invite.afterRemote('create', function( ctx, invite, done) {
    var x_data = { invite: invite };
    // TODO IMPROVE THIS WATERFALL
    async.waterfall([
      if_async.not(is_complete(x_data))
        .then(async.seq(
            complete(x_data),
            update_invite
        )),
      send_email
    ], done);
  });

  /**
   * resend
   */

  Invite.resend = function (id, done) {
    var x_data = {
      id: id,
      valid_status: 'pending'
    };

    async.waterfall([
      function (next) { setImmediate(next, null, x_data); },
      retrieve_invite,
      check_invite,
      check_status,
      send_email
    ], done);
  };

  Invite.remoteMethod(
      'resend',
      {
        accepts: {arg: 'id', type: 'string', required: true},
        http: {
          path: '/:id/resend',
          verb: 'post'
        },
        returns: {arg: 'ok', type: 'boolean'}
      }
  );

  /**
   * revoke
   */

  Invite.revoke = function (id, done) {
    var x_data = {
      id: id,
      valid_status: 'pending'
    };

    async.waterfall([
      function (next) { setImmediate(next, null, x_data); },
      retrieve_invite,
      check_invite,
      check_status,
      revoke_invite
    ], done);

  };

  Invite.remoteMethod(
      'revoke',
      {
        accepts: {arg: 'id', type: 'string', required: true},
        http: {
          path: '/:id/revoke',
          verb: 'post'
        },
        returns: {arg: 'ok', type: 'boolean'}
      }
  );

};
