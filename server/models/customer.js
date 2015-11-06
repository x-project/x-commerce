var loopback = require('loopback');
var async = require('async');
var moment = require('moment');
var jwt = require('jwt-simple');
var mandrill = require('mandrill-api/mandrill');

var mandrill_client = new mandrill.Mandrill(process.env.MANDRILL_KEY);

module.exports = function (Customer) {

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

  var create_new_customer = function (data) {
    return function (next) {
      if (data.customer != null) {
        next();
        return;
      }
      var model_new = {
        first_name: 'unknown',
        last_name: 'unknown',
        email: data.email,
        password: '123'
      };
      Customer.create(model_new, function (err, model) {
        data.customer = model;
        setImmediate(next, err);
      });
    };
  };

  var get_customer_by_email = function (data) {
    return function (next) {
      var query = { where: {email: data.email} };
      Customer.findOne(query, function (err, model) {
        data.customer = model;
        setImmediate(next, err);
      });
    };
  };

  var create_token = function (data) {
    return function (next) {
      var payload = {
        sub: data.customer.id,
        iat: moment().unix(),
        exp: moment().add(1, 'days').unix()
      };
      var token = jwt.encode(payload, process.env.TOKEN_SECRET_ENTER);
      data.token =  token;
      data.customer.last_enter_token = token;
      Customer.upsert(data.customer, function (err, model) {
        data.customer = model;
        setImmediate(next, err);
      });
    };
  };

  var send_signed_url_by_email = function (data) {
    return function (next) {
      var message = prepare_mail(data.email, data.token);
      mandrill_client.messages.send({"message": message},
        function (res) {
          data.email_result = res;
          setImmediate(next, null);
        },
        function (err) {
          setImmediate(next, err);
        }
      );
    };
  };

  // passwordless for email
  Customer.get_token_email = function (email, first_name, last_name, callback) {
    var data = {};
    data.email = email;
    data.first_name = first_name;
    data.last_name = last_name;

    async.waterfall([
      get_customer_by_email(data),
      create_new_customer(data),
      create_token(data),
      send_signed_url_by_email(data)
    ],
    function (err) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, data.email_result);
    });
  };


  Customer.enter_token_sms = function (telephone_number, callback) {
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

  Customer.try_enter_email = function (enter_token, callback) {
    var payload = jwt.decode(enter_token, process.env.TOKEN_SECRET_ENTER);
    Customer.findById(payload.sub, function(err, user) {
      if (!user) {
        callback({error: 'user not found'}, null);
      }
      create_access_token(user, function (err, user_profile) {
        if (err) {
          callback(err, null);
        }
        callback(null, user_profile);
      });
    });
  };



  /*
    * passwordless by email
  */
  // enter_token = client da la richiesta e il server invia una signed url con token
  Customer.remoteMethod('get_token_email', {
    accepts: [
      { arg: 'email', type: 'string', required: true },
      { arg: 'first_name', type: 'string', required: true },
      { arg: 'last_name', type: 'string', required: true }
    ],
    returns: { arg: 'result', type: 'object' },
    http: { path: '/enter_token', verb: 'post' }
  });
  // all click sull link inviato per email, il client da una post e verifico
  //che il token della richiesta sia corretto e rispondo con il profilo dell utente
  Customer.remoteMethod('try_enter_email', {
    accepts: { arg: 'enter_token', type: 'string', required: true },
    returns: { arg: 'result', type: 'object' },
    http: { path: '/enter', verb: 'post' }
  });

  /*
    * passwordless by sms
  */

  Customer.remoteMethod('get_token_sms', {
    accepts: { arg: 'telephone_number', type: 'number', required: true },
    returns: { arg: 'result', type: 'object' },
    http: { path: '/sendme_password_sms', verb: 'post' }
  });

};