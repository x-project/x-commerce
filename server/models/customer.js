var loopback = require('loopback');
var email_verify = require('email-verify');
var validator = require('validator');
var nodemailer = require('nodemailer');
var async = require('async');
var moment = require('moment');
var jwt = require('jwt-simple');


module.exports = function (Customer) {

  var authToken = process.env.TWILIO_AUTH_TOKEN;
  var accountSid = process.env.TWILIO_ACCOUNT_SID;
  var client = require('twilio')(accountSid, authToken);


  function getCurrentUserId() {
    var ctx = loopback.getCurrentContext();
    var accessToken = ctx && ctx.get('accessToken');
    var userId = accessToken && accessToken.userId;
    return userId;
  }

  Customer.change_email = function (new_email, confirm_email, password, callback) {
    if (new_email !== confirm_email) {
      cb(new Error('email not confirmed'), null);
      return;
    }

    var user;
    var user_id = getCurrentUserId();

    var on_find_user = function (err, user) {
      if (err) {
        callback(err, null);
        return;
      }
      user.hasPassword(password, on_match_password);
    }

    var on_match_password = function (err, match) {
      if (!match) {
        callback(new Error('invalid password'), null);
        return;
      }
      user.updateAttribute('email', new_email, on_update_email);
    }

    var on_update_email = function (err, user) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, true);
    };

    Customer.findById(user_id, on_find_user);
  };

  Customer.remoteMethod('change_email', {
    http: { path: '/change_email', verb: 'post' },
    accepts: [
      { arg: 'new_email', type: 'string' },
      { arg: 'confirm_email', type: 'string' },
      { arg: 'password', type: 'string' }
    ],
    returns: { arg: 'changed', type: 'boolean' }
  });

  Customer.change_password = function (new_password, confirm_password, password, callback) {
    if (new_password !== confirm_password) {
      callback(new Error('password not confirmed'), null);
      return;
    }

    var user;
    var user_id = getCurrentUserId();

    var on_find_user = function (err, instance) {
      if (err) {
        callback(err, null);
        return;
      }
      user = instance;
      user.hasPassword(password, on_match_password);
    };

    var on_match_password = function (err, match) {
      if (!match) {
        callback(new Error('invalid password'), null);
        return;
      }
      user.updateAttribute('password', new_password, on_update_password);
    };

    var on_update_password = function (err, user) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, true);
    };

    Customer.findById(user_id, on_find_user);
  };

  Customer.remoteMethod('change_password', {
    http: { path: '/change_password', verb: 'post' },
    accepts: [
      { arg: 'new_password', type: 'string' },
      { arg: 'confirm_password', type: 'string' },
      { arg: 'password', type: 'string' }
    ],
    returns: { arg: 'changed', type: 'boolean' }
  });



  Customer.on('resetPasswordRequest', function (info) {
    // console.log(info.user); // the requested user
    // console.log(info.email); // the email of the requested user
    // console.log(info.accessToken); // the temp access token to allow password reset
    // TODO: send email to user
  });

/*
* init passwordless with email
*/


  var create_trasport = function () {
    var transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE,
      auth: {
        user: process.env.MY_EMAIL,
        pass: process.env.EMAIL_PASS
      }
    });
    return transporter;
  };

  var prepare_mail = function (destination_email, enter_token) {
    var host = 'http://localhost:3000/';
    var link = host + 'enter?token=' + enter_token;
    var signed_url = '<a href="' + link + '">' + link + '</a>';
    var mail = {
      from: '<' + process.env.MY_EMAIL + '>',
      to: destination_email,
      subject: 'enter token',
      html: signed_url,
      text: '<b>click on link to sign in</b>'
    };
    return mail;
  };

  var get_user_for_email = function (email, done) {
    var query = { where: {email: email} };
    Customer.findOne(query, done);
  };

  var create_token = function  (user) {
    var payload = {
      sub: user.id,
      iat: moment().unix(),
      exp: moment().add(1, 'days').unix()
    };
    var token = jwt.encode(payload, process.env.TOKEN_SECRET_ENTER);
    return token;
  };

  var try_send_mail = function (email, user, done) {
    var enter_token;
    async.waterfall([
      function (next) {
        enter_token = create_token(user);
        user.last_enter_token = enter_token;
        Customer.upsert(user, next);
      },
      function (user, next) {
        var transporter = create_trasport();
        var mail = prepare_mail(email, enter_token);
        transporter.sendMail(mail, function (err, info) {
          next(err, info);
        });
      }
    ],

    function (err, result) {
      if (err) {
        done(err, null);
        return;
      }
      done(null, result);
    });
  };

  var create_new_user = function (email, done) {
    Customer.create({email: email, password: '123'}, function (err, model) {
      console.log(model);
      if (err) {
        done(err, null);
      }
      try_send_mail(email, model, done);
    });
  };

  // passwordless for email
  Customer.enter_token = function (email, callback) {
    async.waterfall([
      function (next) {
        get_user_for_email(email, next);
      },

      function (user, next) {
        if (user != null) {
          try_send_mail(email, user, next);
        }
        else{
          create_new_user(email, next);
        }
      }
    ],
    function (err, result) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, result);
    });
  };


  Customer.sendme_password_sms = function (telephone_number, callback) {
    client.sms.messages.create({
      body: "Jenny please?! I love you <3",
      to: process.env.MY_TELEPHONE_NUM,
      from: process.env.TWILIO_TELE_NUM
    },
    function(err, sms) {
      if(err) {
        callback(err, null);
      }
      callback(null, sms);
    });
  };

  var create_access_token = function (user, callback) {
    user.createAccessToken(Customer.settings.ttl, function (err, token) {
      if (err) {
        callback(err, null);
        return;
      }
      var _token = JSON.parse(JSON.stringify(token));
      var _user = JSON.parse(JSON.stringify(user));
      delete _user.password;
      delete _user.last_enter_token;
      _user.id = _token.userId;
      _token.user = _user;
      callback(null, _token);
    });
  };

  Customer.enter = function (enter_token, callback) {
    var payload = jwt.decode(enter_token, process.env.TOKEN_SECRET_ENTER);
    Customer.findById(payload.sub, function(err, user) {
      if (!user) {
        callback({error: 'user not found'}, null);
      }
      create_access_token(user, function (err, user_profile) {
        if (err) {
          callback(err, null);
        }
        callback(null, user_profile);
      });
    });
  };

  // passwordless for email
  Customer.remoteMethod('enter_token', {
    accepts: { arg: 'email', type: 'string', required: true },
    returns: { arg: 'result', type: 'object' },
    http: { path: '/enter_token', verb: 'get' }
  });

  Customer.remoteMethod('sendme_password_sms', {
    accepts: { arg: 'telephone_number', type: 'number', required: true },
    returns: { arg: 'result', type: 'object' },
    http: { path: '/sendme_password_sms', verb: 'get' }
  });

  Customer.remoteMethod('enter', {
    accepts: { arg: 'enter_token', type: 'string', required: true },
    returns: { arg: 'result', type: 'object' },
    http: { path: '/enter', verb: 'get' }
  });

};