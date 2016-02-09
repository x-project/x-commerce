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

  var getCurrentUserId = function () {
    var ctx = loopback.getCurrentContext();
    var accessToken = ctx && ctx.get('accessToken');
    var userId = accessToken && accessToken.userId;
    return userId;
  };


  function get_mail_configuration_params (msg_type, host) {
    return new Promise(function (resolve, reject) {
      var filter = { where: {or: [{type: msg_type}, {type: host}] } };
      Invite.app.models.MailMessage.find(filter, function (err, models) {
        if (err) {
          reject(err);
          return;
        }
        resolve(models);
      });
    });
  }

  function get_mail_msg(service, params) {
    var message = {
      "html": params.text,
      // "text": email_text,
      "subject": params.subject,
      "from_email": service.params.email,
      "from_name": params.from_name,
      "to": [{
        "email": params.to,
        "name": params.from_name,
        "type": "to"
      }],
      "headers": {
        "Reply-To": service.params.email
      },
      "subaccount": "123",
    };
    return message;
  }

  function setup_mail_content_msg (x_data, callback) {
    get_service('email')
      .then(function (service) {
        var host_name_conf = x_data.email_setup_params.filter(function (item) {
          return item.type == 'host_name';
        });
        var invite_collaborators_conf = x_data.email_setup_params.filter(function (item) {
          return item.type == 'invite_collaborators';
        });
        var base_url = host_name_conf[0].text + '/admin/signup';
        var url = base_url + '?invite='+ x_data.invite.token +'&email='+ x_data.invite.email;
        var text = invite_collaborators_conf[0].text + "<br/><p>email: " + x_data.invite.email+ "</p>" + "<br/><p>password: " + x_data.invite.password + "</p>" + "<br/> <p>click here for confirm</p>" + url;
        var params = {
          text: text,
          subject: invite_collaborators_conf[0].subject,
          from_name: invite_collaborators_conf[0].from_name,
          to: x_data.invite.email
        };
        callback(null, get_mail_msg(service, params));
      }).catch(function (err) {
      callback(err, null);
    });
  }

  var prepare_mail = function (x_data, callback) {
    get_mail_configuration_params('invite_collaborators', 'host_name')
      .then(function (models) {
        x_data.email_setup_params = models;
        setup_mail_content_msg(x_data, function (err, message) {
          if (err) {
            callback(err, null);
            return;
          }
          callback(null, message);
        });
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
      }).catch(function (err) {
        setImmediate(done, err, null);
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
