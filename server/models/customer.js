var loopback = require('loopback');
var async = require('async');
var moment = require('moment');
var jwt = require('jwt-simple');
var mandrill = require('mandrill-api/mandrill');
var plivo = require('plivo');

module.exports = function (Customer) {

//   var host = 'http://localhost:3000/';

  var services = {};

  function get_service (name) {
    return new Promise(function (resolve, reject) {
      if (name in services) {
        resolve(services[name]);
        return;
      }
      var filter = {where: { name: name }};
      Customer.app.models.Service.findOne(filter, function (err, service) {
        if (err) {
          reject(err);
          return;
        }
        services[name] = service;
        resolve(service);
      });
    });
  }

  var mandrill_client;
  Customer.connect_mandrill_client = function () {
    return new Promise(function (resolve, reject) {
      if (mandrill_client) {
        resolve(mandrill_client);
        return;
      }
      get_service('mandrill').then(function (service) {
        resolve(new mandrill.Mandrill(service.private_key));
      }).catch(function (err) {
        reject(err);
      });
    });
  }

  var plivo_client;
  Customer.connect_plivo_client = function () {
    return new Promise(function (resolve, reject) {
      if (plivo_client) {
        resolve(plivo_client);
        return;
      }
      get_service('plivo').then(function (service) {
        var plivo_client = plivo.RestAPI({
          authId: service.public_key,
          authToken: service.private_key
        });
        resolve(plivo_client);
      }).catch(function (err) {
        reject(err);
      });
    });
  }

/*=========send credentials for email===========*/

  var credentials_email = function (credentials, callback) {
    get_service('email')
      .then(function (serivce) {
        var signed_url = "<div><p>email: "+ credentials.email +"</p></br><p>password: "+ credentials.password +"</p></div>";
        var message = {
          "html": signed_url,
          "text": "credentials",
          "subject": "credentials",
          "from_email": serivce.params.email,
          "from_name": "x-commerce",
          "to": [{
            "email": credentials.email,
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

  Customer.send_credentials_email = function (credentials, callback) {
    credentials_email(credentials, function (err, message) {
      if (err) {
        callback(err, null);
        return;
      }
      Customer.connect_mandrill_client()
        .then(function (mandrill_client) {
          mandrill_client.messages.send({"message": message},
            function (res) {
              callback(null, res);
            },
            function (err) {
              callback(err, null);
            }
          );
        }).catch(function (err) {
          callback(err, null);
        });
    });
  };

  Customer.remoteMethod('send_credentials_email', {
    accepts: [
      { arg: 'credentials', type: 'object', required: true },
    ],
    returns: { arg: 'result', type: 'object' },
    http: { path: '/send_credentials_email', verb: 'post' }
  });

  /*===============================================*/
  function getCurrentUserId() {
    var ctx = loopback.getCurrentContext();
    var accessToken = ctx && ctx.get('accessToken');
    var userId = accessToken && accessToken.userId;
    return userId;
  }

  Customer.change_email = function (email, confirm_email, password, callback) {
    if (email !== confirm_email) {
      callback(new Error('email not confirmed'), null);
      return;
    }

    var user;
    var user_id = getCurrentUserId();

    var on_find_user = function (err, res) {
      if (err) {
        callback(err, null);
        return;
      }
      user = res;
      user.hasPassword(password, on_match_password);
    }

    var on_match_password = function (err, match) {
      if (!match) {
        callback(new Error('invalid password'), null);
        return;
      }
      user.updateAttribute('email', email, on_update_email);
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
      { arg: 'email', type: 'string' },
      { arg: 'confirm', type: 'string' },
      { arg: 'password', type: 'string' }
    ],
    returns: { arg: 'changed', type: 'boolean' }
  });

  Customer.change_password = function (new_password, confirm_password, old_password, callback) {
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
      user.hasPassword(old_password, on_match_password);
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
      { arg: 'old_password', type: 'string' }
    ],
    returns: { arg: 'changed', type: 'boolean' }
  });


  Customer.on('resetPasswordRequest', function (info) {
    console.log(info.user); // the requested user
    console.log(info.email); // the email of the requested user
    console.log(info.accessToken); // the temp access token to allow password reset
    // TODO: send email to user
  });

  var create_new_customer = function (data) {
    return function (next) {
      if (data.customer != null) {
        next();
        return;
      }
      Customer.create(data.new_customer, function (err, model) {
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
      get_service('passwordless_secret_keys')
        .then(function (service) {
          var token = jwt.encode(payload, service.params.jwt_secret_key_email);
          data.token =  token;
          data.customer.last_enter_token = token;
          Customer.upsert(data.customer, function (err, model) {
            data.customer = model;
            setImmediate(next, err);
            return;
          });
        })
        .catch(function (err) {
          setImmediate(next, err);
        });
    };
  };

  var send_signed_url_by_email = function (data) {
    return function (next) {
      Customer.connect_mandrill_client()
        .then(function (mandrill_client) {
          mandrill_client.messages.send({"message": data.message},
            function (res) {
              data.email_result = res;
              setImmediate(next, null);
            },
            function (err) {
              setImmediate(next, err);
            }
          );
        }).catch(function (err) {
          setImmediate(next, err);
        });
    };
  };

  // ritorna parametri come il testo, nome del dominio
  var get_email_conf_params = function (data) {
    return function (next) {
      var filter = { where: {or: [{type: 'passworless_via_email'}, {type: 'host_name'}]}};
      Customer.app.models.MailMessage.get_mail_configuration_params(filter)
      .then(function (models) {
        data.email_conf_params = models;
        setImmediate(next, null);
      }).catch(function (err) {
        setImmediate(next, err);
      });
    };
  };

  var get_sender_info = function (data) {
    return function (next) {
      get_service('email')
        .then(function (service) {
          data.sender_info = service;
          setImmediate(next, null);
        }).catch(function (err) {
          setImmediate(next, err);
        });
    };
  };


  function get_email_msg (content, destination_email, sender_email) {
    var message = {
      "html": content,
      "text": "click from url for sign in",
      "subject": "signed url",
      "from_email": sender_email,
      "from_name": "x-commerce",
      "to": [{
        "email": destination_email,
        "name": "x-commerce",
        "type": "to"
      }],
      "headers": {
        "Reply-To": sender_email
      },
      "subaccount": "123",
    };
    return message;
  }

  var prepare_email_content = function (data) {
    return function (next) {
      var host_name = data.email_conf_params.filter(function (item) {
        return item.type == 'host_name';
      });
      var text_content = data.email_conf_params.filter(function (item) {
        return item.type == 'passworless_via_email';
      });
      var link = host_name[0].text + '/enter?token=' + data.token;
      var content = text_content[0].text +'<br/><a href="' + link + '">' + link + '</a>';
      var msg = get_email_msg(content, data.email, data.sender_info.params.email);
      data.message = msg;
      setImmediate(next, null);
    };
  };

  // passwordless for email
  Customer.get_token_email = function (email, first_name, last_name, callback) {
    var data = {};
    data.email = email;
    data.first_name = first_name;
    data.last_name = last_name;
    data.new_customer = {
      first_name: 'unknown',
      last_name: 'unknown',
      email: data.email,
      password: '123'
    };

    async.waterfall([
      get_customer_by_email(data),
      create_new_customer(data),
      create_token(data),
      get_email_conf_params(data),
      get_sender_info(data),
      prepare_email_content(data),
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
    get_service('passwordless_secret_keys')
      .then(function (service) {
        var payload = jwt.decode(enter_token, service.params.jwt_secret_key_email);
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
    }).catch(function (err) {
      callback(err, null);
    });
  };

  var get_customer_by_phone = function (data) {
    return function (next) {
      var query = { where: {phone: data.phone} };
      Customer.findOne(query, function (err, model) {
        data.customer = model;
        setImmediate(next, err);
      });
    };
  };

  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
  }

  var create_sms_code = function (data) {
    return function (next) {
      var code = getRandomInt(10000, 1000000);
      data.code = code;
      var payload = {
        sub: data.customer.id + '' + data.code,
        iat: moment().unix(),
        exp: moment().add(1, 'days').unix()
      };
      get_service('passwordless_secret_keys')
        .then(function (service) {
          var token = jwt.encode(payload, service.params.jwt_secret_key_sms);
          data.token =  token;
          data.customer.last_sms_token = token;
          Customer.upsert(data.customer, function (err, model) {
            data.customer = model;
            setImmediate(next, err);
          });
        }).catch(function (err) {
          setImmediate(next, err);
        });
    };
  };

  var send_sms = function (data) {
    return function (next) {
      get_service('phone')
        .then(function (serivce) {
          var params = {
            'src': serivce.params.phone,
            'dst' : data.phone,
            'text' : "Your code for login is: " + data.code,
            'url' : "http://example.com/report/",
            'method' : "GET"
          };
          Customer.connect_plivo_client()
            .then(function (plivo_client) {
              plivo_client.send_message(params, function (status, response) {
              data.response = { status: status, response: response };
              setImmediate(next, null);
            });
          })
          .catch(function (err) {
            setImmediate(next, err);
          });
        })
        .catch(function (err) {
          setImmediate(next, err);
        });
    };
  };

  Customer.get_token_sms = function (phone, callback) {
    var data = {};
    data.phone = phone;
    data.new_customer = {
      first_name: 'unknown',
      last_name: 'unknown',
      email: 'unknown' + getRandomInt(1, 10000000000000) + getRandomInt(1, 10000000000000)+ '@email.com',
      password: '3208932443232987832932',
      phone: data.phone
    };
    async.waterfall([
      get_customer_by_phone(data),
      create_new_customer(data),
      create_sms_code(data),
      send_sms(data)
    ],
    function (err) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, data.response);
    });
  };

  var try_auth_login = function (data) {
    return function (next) {
      if(data.customer == null) {
        data.customer_not_found = 'user not found';
        next();
        return;
      }
    };
  };

  Customer.try_enter_sms = function (phone, code, callback) {
    var query = { where: {phone: phone} };
    Customer.findOne(query, function(err, customer) {
      if (!customer) {
        callback(null, {invalid_input: 'customer not found', success: false});
        return;
      }
      get_service('passwordless_secret_keys')
        .then(function (service) {
          var payload = jwt.decode(customer.last_sms_token, service.params.jwt_secret_key_sms);
          if (payload.sub !== customer.id + '' + code) {
            callback(null, {invalid_input: 'invalid code',  success: false });
            return;
          }
          create_access_token(customer, function (err, user_profile) {
            if (err) {
              callback(err, null);
              return;
            }
            user_profile.success = true;
            callback(null, user_profile);
          });
        }).catch(function (err) {
          callback(err, null);
        })
    });
  };

  /*
    * passwordless by email
  */
  // enter_token = client fa la richiesta e il server invia una signed url con token
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
    accepts: { arg: 'phone', type: 'number', required: true },
    returns: { arg: 'result', type: 'object' },
    http: { path: '/get_token_sms', verb: 'post' }
  });

  Customer.remoteMethod('try_enter_sms', {
    accepts: [
      { arg: 'phone', type: 'number', required: true },
      { arg: 'code', type: 'string', required: true }
    ],
    returns: { arg: 'result', type: 'object' },
    http: { path: '/enter_sms', verb: 'post' }
  });


};