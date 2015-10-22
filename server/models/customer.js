var loopback = require('loopback');
var email_verify = require('email-verify');
var validator = require('validator');
var async = require('async');
var moment = require('moment');
var jwt = require('jwt-simple');
var mandrill = require('mandrill-api/mandrill');
var mandrill_client = new mandrill.Mandrill(process.env.MANDRILL_KEY);
var plivo = require('plivo');
var plivio_client = plivo.RestAPI({
  authId: process.env.PLIVIO_AUTH_ID_KEY,
  authToken: process.env.PLIVIO_AUTH_TOKEN
});

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
    var message = {
      "html": signed_url,
      "text": "click from url for sign in",
      "subject": "signed url",
      "from_email": process.env.MY_EMAIL,
      "from_name": "x-commerce",
      "to": [{
              "email": destination_email,
              "name": "x-commerce",
              "type": "to"
          }],
      "headers": {
          "Reply-To": process.env.MY_EMAIL
      },
      "subaccount": "123",
    };
    return message;
  };

  var get_user_for_email = function (email, done) {
    var query = { where: {email: email} };
    Customer.findOne(query, done);
  };

  var get_user_for_phone = function (phone, done) {
    var query = { where: {phone: phone} };
    Customer.findOne(query, done);
  };

  var create_token = function  (code, secret) {
    var payload = {
      sub: code,
      iat: moment().unix(),
      exp: moment().add(1, 'days').unix()
    };
    var token = jwt.encode(payload, secret);
    return token;
  };

  var try_send_mail = function (email, user, done) {
    var enter_token;
    async.waterfall([
      function (next) {
        enter_token = create_token(user.id, process.env.TOKEN_SECRET_ENTER);
        user.last_enter_token = enter_token;
        Customer.upsert(user, next);
      },
      function (user, next) {
        var message = prepare_mail(email, enter_token);
        // var send_at = "2015-10-22 13:00:10"; // add on production version
        mandrill_client.messages.send({"message": message}, function(result) {
          next(null, result);
        }, function(err) {
          callback(err, null);
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

  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
  }


  var prepare_sms = function (code, phone) {
    var msg = {
        'src': process.env.PHONE_SRC,
        'dst' : phone,
        'text' : 'you code is here ' + code,
        'url' : "http://example.com/report/", // The URL to which with the status of the message is sent
        'method' : "GET" // The method used to call the url
    };
    return msg;
  };

  var try_send_sms = function (user, phone, code, token_sms, done) {
    async.waterfall([
      function (next) {
        user.last_sms_token = token_sms;
        user.last_phone = phone;
        Customer.upsert(user, next);
      },

      function (user, next) {
        var message = prepare_sms(code, phone);
        plivio_client.send_message(message, function (status, response) {
          next(null, response);
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

  var create_new_user_phone = function (phone, code, token, done) {
    Customer.create({last_phone: phone, password: '123', email: 'ciao20@email'+code+'.com'}, function (err, user) {
      if (err) {
        console.log('err', err);
        done(err, null);
      }
      try_send_sms(user, phone, code, token, done);
    });
  };

  Customer.phone_token = function (phone, callback) {
    async.waterfall([
      function (next) {
        get_user_for_phone(phone, next);
      },

      function (user, next) {
        var code = getRandomInt(1000, 100000);
        var token = create_token(code, process.env.TOKEN_SECRET_ENTER_SMS);
        if (user != null) {
          try_send_sms(user, phone, code, token, next);
        }
        else{
          create_new_user_phone(phone, code, token, next);
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
      delete _user.last_sms_token;
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


  Customer.enter_code = function (phone, code, callback) {
    // var payload = jwt.decode(code, process.env.TOKEN_SECRET_ENTER_SMS);
    Customer.findOne({ where: {last_phone: phone} }, function (err, user) {
      if (!user) {
        callback({error: 'user not found'}, null);
      }
      var payload = jwt.decode(user.last_sms_token, process.env.TOKEN_SECRET_ENTER_SMS);
      if (payload.sub == code) {
        create_access_token(user, function (err, user_profile) {
          if (err) {
            callback(err, null);
          }
          callback(null, user_profile);
        });
      }
      else{
        callback({error: 'invalid code'}, null);
      }
    });
  };

  // passwordless for email
  Customer.remoteMethod('enter_token', {
    accepts: { arg: 'email', type: 'string', required: true },
    returns: { arg: 'result', type: 'object' },
    http: { path: '/enter_token', verb: 'post' }
  });

  Customer.remoteMethod('phone_token', {
    accepts: { arg: 'phone', type: 'number', required: true },
    returns: { arg: 'result', type: 'object' },
    http: { path: '/sendme_password_sms', verb: 'post' }
  });

  Customer.remoteMethod('enter', {
    accepts: { arg: 'enter_token', type: 'string', required: true },
    returns: { arg: 'result', type: 'object' },
    http: { path: '/enter', verb: 'post' }
  });

  Customer.remoteMethod('enter_code', {
    accepts: [
      { arg: 'phone', type: 'number', required: true },
      { arg: 'code', type: 'number', required: true }
    ],
    returns: { arg: 'result', type: 'object' },
    http: { path: '/enter_code', verb: 'post' }
  });


};