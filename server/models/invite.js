var loopback = require('loopback');
var jwt = require('jwt-simple');
var moment = require('moment');
var minstache = require('minstache');
var async = require('async');
var if_async = require('if-async');

var base_url = 'http://localhost:3000/admin/signup';

var url = base_url + '?token={{token}}&email={{email}}';
var email_text = "Hello there,\n\n you have been invited to take part in x-journal as {{role}}.\n\nTo accept the invitation follow this link: {{url}}";
var email_html = "<div><p>Hello there,</p><p>you have been invited to take part in x-journal as {{role}}.</p><p>To accept the invitation follow this link: <a href=\"{{url}}\">{{url}}</a><div>";

var template_url = minstache.compile(url);
var template_text = minstache.compile(email_text);
var template_html = minstache.compile(email_html);

module.exports = function (Invite) {

  var getCurrentUserId = function () {
    var ctx = loopback.getCurrentContext();
    var accessToken = ctx && ctx.get('accessToken');
    var userId = accessToken && accessToken.userId;
    return userId;
  };

  var send_email = function (x_data, next) {
    var invite = x_data.invite;
    var text = template_text(invite);
    var html = template_html(invite);

    Invite.app.models.Email.send({
      from: "x-journal <x-journal@something.com>",
      to: invite.email,
      subject: "Invitation to partecipate in x-journal",
      text: text,
      html: html
    }, next);
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
      var expiresAt = moment().add(invite.expiresIn, 'd').toDate();
      var payload = {
        invite_id: invite.id,
        expiresAt: expiresAt,
        email: invite.email,
        role: invite.role,
        status: invite.status
      };
      var token = jwt.encode(payload, process.env.SECRET);
      invite.expiresAt = expiresAt;
      invite.token = token;
      invite.url = encodeURI(template_url(invite));
      invite.senderId = getCurrentUserId();
      setImmediate(done, null, x_data);
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
    var x_data = {
      invite: invite
    };

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
