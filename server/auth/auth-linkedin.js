
// LINKEDIN
app.post('/auth/linkedin',
  // Step 1. Exchange authorization code for access token.
  function(req, res, next) {
    var accessTokenUrl = 'https://www.linkedin.com/uas/oauth2/accessToken';
    var params = {
      code: req.body.code,
      client_id: req.body.clientId,
      client_secret: config.LINKEDIN_SECRET,
      redirect_uri: req.body.redirectUri,
      grant_type: 'authorization_code'
    };

    request.post(accessTokenUrl, { form: params, json: true }, function(err, response, body) {
      if (response.statusCode !== 200) {
        res.status(response.statusCode).send({ message: body.error_description });
        return;
      }
      var accessToken = body.access_token;
      req.accessToken = accessToken;
      next();
    });
  },

  // Step 2. Retrieve profile information about the current user.
  function (req, res, next) {
    var peopleApiUrl = 'https://api.linkedin.com/v1/people/~:(id,first-name,last-name,email-address)';
    var accessToken = req.accessToken;
    var params = {
      oauth2_access_token: access_token,
      format: 'json'
    };

    request.get({ url: peopleApiUrl, qs: params, json: true }, function(err, response, profile) {
      if (err) {
        res.status(500).send(err);
        return;
      }
      req.profile = profile;
      next();
    });
  },

  // Step 3a. Link user accounts.
  function (req, res, next) {
    if (!req.headers[authHeader]) {
      next();
      return;
    }

    User.find({ where: { linkedin: profile.id }}, function(err, users) {
      var user = users[0];

      if (user) {
        res.status(409).send({ message: 'There is already a LinkedIn account that belongs to you' });
        return;
      }
      var token = req.headers[authHeader].split(' ')[1];
      var payload = jwt.decode(token, config.TOKEN_SECRET);
      User.findById(payload.sub, function(err, user) {
        if (!user) {
          res.status(400).send({ message: 'User not found' });
          return;
        }
        user.linkedin = profile.id;
        user.displayName = user.displayName || profile.firstName + ' ' + profile.lastName;
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
    var filter = { or: [{ linkedin: profile.id }, { email: profile.email }] };

    User.find({ where: filter }, function(err, users) {
      var user = users[0];

      if (user) {
        if (!user.linkedin) {
          user.linkedin = profile.id;
          user.displayName = user.displayName || profile.name;
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
        displayName: profile.name,
        linkedin: profile.id,
        email: profile.email,
        password: profile.id
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