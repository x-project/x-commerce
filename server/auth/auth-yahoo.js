
// YAHOO
app.post('/auth/yahoo',
  // Step 1. Exchange authorization code for access token.
  function (req, res, next) {
    var accessTokenUrl = 'https://api.login.yahoo.com/oauth2/get_token';
    var clientId = req.body.clientId;
    var clientSecret = config.YAHOO_SECRET;
    var clientSecret64 = new Buffer(clientId + ':' + clientSecret).toString('base64');
    var headers = { Authorization: 'Basic ' + clientSecret64 };
    var formData = {
      code: req.body.code,
      redirect_uri: req.body.redirectUri,
      grant_type: 'authorization_code'
    };

    request.post({ url: accessTokenUrl, form: formData, headers: headers, json: true }, function(err, response, body) {
      if (err) {
        res.status(500).send(err);
        return;
      }
      req.accessToken = body.access_token;
      req.xoauth_yahoo_guid = body.xoauth_yahoo_guid;
      next();
    });
  },

  // Step 2. Retrieve profile information about the current user.
  function (req, res, next) {
    var socialApiUrl = 'https://social.yahooapis.com/v1/user/' + req.xoauth_yahoo_guid + '/profile?format=json';
    var headers = { Authorization: 'Bearer ' + req.accessToken };

    request.get({ url: socialApiUrl, headers: headers, json: true }, function(err, response, body) {
      if (err) {
        res.status(500).send(err);
        return;
      }
      req.profile = body.profile;
      next();
    });
  },

  // Step 3a. Link user accounts.
  function (req, res, next) {
    if (!req.headers[authHeader]) {
      next();
      return;
    }

    var porfile = req.profile;
    User.find({ where: { yahoo: profile.guid }}, function(err, user) {
      if (user) {
        res.status(409).send({ message: 'There is already a Yahoo account that belongs to you' });
        return;
      }
      var token = req.headers[authHeader].split(' ')[1];
      var payload = jwt.decode(token, config.TOKEN_SECRET);
      User.findById(payload.sub, function(err, user) {
        if (!user) {
          res.status(400).send({ message: 'User not found' });
          return;
        }
        user.yahoo = profile.guid;
        user.displayName = user.displayName || profile.nickname;
        user.save(function() {
          res.send({
            // token: createToken(user),
            user: user
          });
        });
      });
    });
  },

  // Step 3b. Create a new user account or return an existing one.
  function (req, res, next) {
    var profile = req.profile;
    var filter = { or: [{ yahoo: profile.guid }, { email: profile.email }] };

    User.find({ where: filter }, function(err, users) {
      var user = users[0];

      if (user) {
        if (!user.yahoo) {
          user.yahoo = body.profile.guid;
          user.displayName = user.displayName || body.profile.name;
          user.save(function() {
            req.user = user;
            next();
          });
          return;
        }

        req.user = user;
        next();
        return;
      }

      User.create({
        displayName: body.profile.name,
        yahoo: body.profile.guid,
        email: body.profile.email,
        password: body.profile.guid
      }, function (err, user) {
        req.user = user;
        next();
      });

    });
  },

  function sendAccessToken (req, res) {
    var user = req.user;
    user.createAccessToken(User.settings.ttl, function (err, token) {
      if (err) {
        res.send(err);
        return;
      }
      token.token = createToken(user);
      res.send(token);
    });
  });